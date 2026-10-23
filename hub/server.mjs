// hub/server.mjs
// Le hub Editing OS. Un seul processus node:http, aucune dépendance, port 4300.
//
// Trois différences de fond avec la v1 :
//   1. il est fait pour tourner en service (launchd) : journal sur disque,
//      /api/health, et s'il trouve un jumeau sain sur son port il s'efface
//      proprement au lieu de faire boucler launchd ;
//   2. il affiche des TOURNAGES déclarés (donnees/tournages/*.json), plus des
//      projets devinés ;
//   3. il ne porte ni Studio 8-bit, ni vue Activité.
// Il lit l'espace de travail de la v1 (config.json) sans jamais y écrire de code.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawnSync } from 'node:child_process';

import { ROOT, DONNEES, PORT, NOM, VERSION, statSafe, readJSONSafe, dansDossier } from './lib/espace.mjs';
import { construireEtat, detailTournage, patchTournage, patchLivrable, appartient, ETATS_LIBELLES, TYPES, DESTINATIONS } from './lib/tournages.mjs';
import { inventaireDossier, dossierAbs, enrichirRendu, renduDeReference } from './lib/dossiers.mjs';
import { buildThumb } from './lib/thumbs.mjs';
import { ensureInfo, readCached } from './lib/media-info.mjs';
import { planPrune, applyPrune } from './lib/prune.mjs';
import { readFeedback, writeFeedback, setFeedbackDone, setNoteDone, writeNoteFile } from './lib/feedback.mjs';
import { deliverableId } from './lib/deliverables.mjs';
import { writeBrief } from './lib/brief.mjs';
import { open as openStudio, close as closeStudio, list as listStudios } from './lib/studio.mjs';
import { startJob, getJob, listJobs, listActions, stopJob } from './lib/jobs.mjs';
import { lireEffets, ecrireEffets, rafraichirIndexMd } from './lib/effets.mjs';
import { lireVitrine, ecrireVitrine } from './lib/vitrine.mjs';
import { ecrireEpingle, lireEpingles } from './lib/epingles.mjs';
import { ecrireMaCharte, lireMaCharte } from './lib/ma-charte.mjs';

const PUBLIC_DIR = path.join(import.meta.dirname, 'public');
const CACHE_TTL_MS = 60 * 1000;
const STARTED_AT = Date.now();

// --- journal : console + fichier, pour savoir pourquoi le hub est mort ---
const LOG_DIR = path.join(os.homedir(), 'Library', 'Logs', 'EditingOS');
const LOG_FILE = path.join(LOG_DIR, 'hub.log');
function log(...parts) {
  const line = `[${new Date().toISOString()}] ${parts.map((p) => (p instanceof Error ? (p.stack || p.message) : String(p))).join(' ')}`;
  console.log(line);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch { /* le journal ne doit jamais faire tomber le hub */ }
}

// --- un seul relevé en mémoire, 60 s ---
let snapshot = null;
function rescan() {
  const r = construireEtat();
  snapshot = r;
  warmMediaInfo(r);
  return r;
}
function getSnapshot() {
  if (!snapshot || Date.now() - snapshot.summary.scannedAt > CACHE_TTL_MS) return rescan();
  return snapshot;
}
function invalider() { snapshot = null; }

// ffprobe en tâche de fond, un rendu à la fois, pour les rendus dont on ne
// connaît pas encore le format. Le relevé lui-même n'ouvre jamais un média.
let warming = false;
function warmMediaInfo(r) {
  if (warming) return;
  const todo = [];
  for (const inv of r.invs.values()) {
    if (!inv) continue;
    for (const rd of inv.renders) {
      if (readCached(path.join(inv.projDir, rd.file), rd.mtime)) continue;
      todo.push({ abs: path.join(inv.projDir, rd.file), mtime: rd.mtime });
    }
  }
  if (!todo.length) return;
  warming = true;
  (async () => {
    let appris = false;
    for (const t of todo) {
      try { if (await ensureInfo(t.abs, t.mtime)) appris = true; } catch { /* un fichier illisible n'arrête pas les autres */ }
    }
    warming = false;
    if (appris) invalider();
  })();
}

// --- helpers http ---
function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  res.end(body);
}
function sendError(res, status, message) { sendJSON(res, status, { error: message }); }

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
};

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      data += c;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
async function readJSONBody(req, res, limit) {
  try {
    const raw = await readBody(req, limit);
    return raw ? JSON.parse(raw) : {};
  } catch {
    sendError(res, 400, 'Invalid JSON body');
    return null;
  }
}

/** Fichiers de l'interface : no-store, le hub change souvent. */
function serveStatic(res, urlPath) {
  let rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  try { rel = decodeURIComponent(rel); } catch { sendError(res, 400, 'Bad path'); return; }
  const abs = path.join(PUBLIC_DIR, rel);
  if (!dansDossier(abs, PUBLIC_DIR) || abs === PUBLIC_DIR) { sendError(res, 403, 'Forbidden'); return; }
  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) {
      if (urlPath === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><meta charset="utf-8"><title>${NOM}</title><body style="font:16px -apple-system,sans-serif;padding:40px;background:#F5F1E8;color:#17191C"><h1>${NOM}</h1><p>Le serveur tourne. L'interface (hub/public/) n'est pas encore là.</p><p>Essaie <a href="/api/state">/api/state</a> ou <a href="/api/health">/api/health</a>.</p></body>`);
        return;
      }
      sendError(res, 404, 'Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store, must-revalidate' });
    fs.createReadStream(abs).pipe(res);
  });
}

/** Fichiers d'un dossier racine, avec Range (la review scrubbe des mp4 de 200 Mo). */
function serveFichier(req, res, racine, relEncoded, { lectureSeule = true } = {}) {
  let rel;
  try { rel = decodeURIComponent(relEncoded); } catch { sendError(res, 400, 'Bad path'); return; }
  const abs = path.join(racine, rel);
  if (!dansDossier(abs, racine) || abs === racine) { sendError(res, 403, 'Forbidden'); return; }
  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) { sendError(res, 404, 'Not found'); return; }
    const type = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!m) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); res.end(); return; }
      let start = m[1] === '' ? null : Number(m[1]);
      let end = m[2] === '' ? null : Number(m[2]);
      if (start === null) { start = Math.max(0, st.size - end); end = st.size - 1; }
      else if (end === null || end >= st.size) end = st.size - 1;
      if (start > end || start >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); res.end(); return; }
      res.writeHead(206, { 'Content-Type': type, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
      fs.createReadStream(abs, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
    fs.createReadStream(abs).pipe(res);
  });
}

function baseName(file) { return path.basename(String(file)).replace(/\.(mp4|webm|mov)$/i, ''); }

// --- reviews : tout ce que la page de review doit savoir AVANT de charger la vidéo ---
function construireReviews() {
  const snap = getSnapshot();
  const parDossier = new Map();
  for (const t of snap.tournages) {
    for (const L of t.livrables) {
      if (!parDossier.has(L.dossier)) parDossier.set(L.dossier, { tournage: t.slug, titre: t.titre, livrables: [] });
      parDossier.get(L.dossier).livrables.push({ id: L.id, nom: L.nom, prefixes: L.prefixes });
    }
  }
  const reviews = [];
  for (const [d, inv] of snap.invs) {
    if (!inv || !inv.renders.length) continue;
    const e = parDossier.get(d) || null;
    const renders = inv.renders.map((r) => {
      const er = enrichirRendu(inv.projDir, r);
      const fb = inv.feedback.find((f) => baseName(f.render) === baseName(r.file)) || null;
      const liv = e ? (e.livrables.find((l) => (l.prefixes.length ? appartient(r.file, l.prefixes) : e.livrables.length === 1)) || null) : null;
      return {
        file: r.file, livrable: liv ? liv.id : null, livrable_nom: liv ? liv.nom : null,
        mtime: r.mtime, bytes: r.bytes, master: r.master, final: r.final,
        width: er.width, height: er.height, orientation: er.orientation, ratio: er.ratio,
        durationSec: er.durationMs ? er.durationMs / 1000 : null,
        retours: fb ? { open: fb.done ? 0 : fb.notes.filter((n) => !n.done).length, total: fb.notes.length, done: !!fb.done } : { open: 0, total: 0, done: false },
      };
    });
    reviews.push({ dossier: d, tournage: e ? e.tournage : d, titre: e ? e.titre : d, fps: inv.meta.fps, absPath: inv.projDir, renders });
  }
  reviews.sort((a, b) => (b.renders[0] ? b.renders[0].mtime : 0) - (a.renders[0] ? a.renders[0].mtime : 0));
  return { reviews };
}

// --- vignettes ---
// Au plus trois ffmpeg à la fois : une grille de trente cartes à froid lançait
// trente extractions en parallèle, et les dernières dépassaient leur délai (404).
const THUMB_MAX = 3;
let thumbEnCours = 0;
const thumbFile = [];
function thumbTicket() {
  if (thumbEnCours < THUMB_MAX) { thumbEnCours++; return Promise.resolve(); }
  return new Promise((resolve) => thumbFile.push(resolve));
}
function thumbRendre() {
  const suivant = thumbFile.shift();
  if (suivant) suivant();
  else thumbEnCours--;
}

async function handleThumb(req, res, dossier, kind, file, url) {
  const inv = inventaireDossier(dossier);
  if (!inv) { sendError(res, 404, 'Unknown project'); return; }
  const hit = file ? inv.renders.find((r) => r.file === file) : renduDeReference(inv.renders);
  if (!hit) { sendError(res, 404, 'No render'); return; }
  await thumbTicket();
  let abs;
  try {
    abs = await buildThumb(dossier, { ...hit, slug: dossier, abs: path.join(inv.projDir, hit.file) }, kind);
  } finally {
    thumbRendre();
  }
  if (!abs) { sendError(res, 404, 'Thumbnail unavailable'); return; }
  let st;
  try { st = fs.statSync(abs); } catch { sendError(res, 404, 'Thumbnail unavailable'); return; }
  res.writeHead(200, { 'Content-Type': kind === 'loop' ? 'image/gif' : 'image/jpeg', 'Content-Length': st.size, 'Cache-Control': 'public, max-age=31536000, immutable' });
  fs.createReadStream(abs).pipe(res);
}

// --- rangement ---
function prunePlanFor(dossier, keep) {
  const inv = inventaireDossier(dossier);
  if (!inv) return null;
  const plan = planPrune(inv.renders, keep, inv.compositions);
  return { slug: dossier, absPath: inv.projDir, ...plan };
}
function prunePlanAll(keep) {
  const projects = [];
  for (const d of getSnapshot().invs.keys()) {
    const plan = prunePlanFor(d, keep);
    if (plan && plan.remove.length) projects.push(plan);
  }
  projects.sort((a, b) => b.freeBytes - a.freeBytes);
  return {
    keep: projects.length ? projects[0].keep : Math.max(1, Number(keep) || 3),
    projects,
    removeCount: projects.reduce((n, p) => n + p.remove.length, 0),
    freeBytes: projects.reduce((n, p) => n + p.freeBytes, 0),
    protected: projects.reduce((n, p) => n + p.protected, 0),
  };
}

// --- actions du pipeline (catalogue fermé de lib/jobs.mjs) ---
function nextVersionName(inv, deliverable) {
  const base = deliverable || 'rendu';
  let max = 0;
  for (const r of inv.renders) {
    const m = /-v(\d+)/i.exec(path.basename(r.file));
    if (m && deliverableId(r.file, inv.compositions) === base) max = Math.max(max, Number(m[1]) || 0);
  }
  return `${base}-v${max + 1}.mp4`;
}

async function handleRun(req, res) {
  const body = await readJSONBody(req, res);
  if (!body) return;
  const dossier = typeof body.slug === 'string' ? body.slug : '';
  const projDir = dossierAbs(dossier);
  if (!projDir) { sendError(res, 404, 'Unknown project'); return; }
  const inv = inventaireDossier(dossier);
  const comps = inv.compositions;
  const composition = comps.includes(String(body.composition || '')) ? String(body.composition) : null;
  const known = inv.renders.some((r) => r.file === body.file);
  const renderCfg = inv.meta.render ? { ...inv.meta.render } : {};
  if (renderCfg.fps == null) renderCfg.fps = inv.meta.fps;
  const file = known ? String(body.file) : null;
  const deliverable = file ? deliverableId(file, comps) : null;
  const ctx = { composition, file, deliverable, render: renderCfg };

  let feedbackRender = null;
  if (String(body.action || '') === 'send-to-editor') {
    const wanted = file ? path.basename(file) : null;
    const files = inv.feedback;
    const lot = files.find((f) => path.basename(f.render) === wanted && f.notes.length && !f.done)
      || files.find((f) => f.notes.length && !f.done);
    if (!lot) { sendError(res, 409, 'aucun retour à envoyer sur ce projet'); return; }
    feedbackRender = lot.render;
    ctx.nextRender = nextVersionName(inv, deliverable || deliverableId(lot.render, comps));
    const brief = writeBrief(projDir, dossier, lot, { fps: Number(renderCfg.fps) || 30, nextRender: ctx.nextRender });
    ctx.brief = brief.text;
    ctx.briefRel = brief.rel;
  }

  const { job, error } = startJob(ROOT, dossier, String(body.action || ''), (done) => {
    invalider();
    if (feedbackRender && done.status === 'done') {
      try { setFeedbackDone(projDir, feedbackRender, true); } catch { /* sans gravité */ }
    }
  }, ctx);
  if (error) { sendError(res, 409, error); return; }
  log(`action ${body.action} sur ${dossier}${composition ? ' (' + composition + ')' : ''}`);
  sendJSON(res, 200, { ok: true, job, brief: ctx.briefRel || null, nextRender: ctx.nextRender || null });
}

// --- Studio HyperFrames ---
async function handleStudio(req, res, dossier, method) {
  const projDir = dossierAbs(dossier);
  if (!projDir) { sendError(res, 404, 'Unknown project'); return; }
  if (method === 'DELETE') { sendJSON(res, 200, await closeStudio(projDir)); return; }
  const r = await openStudio(projDir, {
    snapshot: () => spawnSync('node', [path.join(ROOT, 'scripts', 'snapshot-project.mjs'), dossier, 'avant ouverture du Studio'], { cwd: ROOT, encoding: 'utf8' }),
  });
  if (r.error) { sendError(res, 500, r.error); return; }
  sendJSON(res, 200, r);
}

// --- bibliothèques de la première livraison ---
function compositionsAvecUsages() {
  const base = readJSONSafe(path.join(DONNEES, 'compositions.json'), 2 * 1024 * 1024) || { schema: 1, dispositions: [] };
  const usages = {};
  for (const t of getSnapshot().tournages) {
    for (const L of t.livrables) {
      if (!L.composition_memo) continue;
      (usages[L.composition_memo] ||= []).push({ tournage: t.slug, titre: t.titre, livrable: L.id, nom: L.nom, etat: L.etat, dossier: L.dossier, derniere: L.derniere ? L.derniere.file : null });
    }
  }
  return { ...base, dispositions: (base.dispositions || []).map((d) => ({ ...d, utilisee_par: usages[d.id] || [] })) };
}

// --- routeur ---
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  const m = req.method;
  const seg = (prefix) => { try { return decodeURIComponent(p.slice(prefix.length)); } catch { return ''; } };
  const okSlug = (s) => s && !s.includes('/') && !s.includes('..');

  try {
    if (m === 'GET' && p === '/api/health') {
      sendJSON(res, 200, { ok: true, nom: NOM, version: VERSION, pid: process.pid, port: PORT, uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000),
        scannedAt: snapshot ? snapshot.summary.scannedAt : null, tournages: snapshot ? snapshot.summary.tournages : null,
        espace: ROOT, journal: LOG_FILE, node: process.version });
      return;
    }
    if (m === 'GET' && p === '/api/state') {
      const s = getSnapshot();
      sendJSON(res, 200, { summary: s.summary, libelles: ETATS_LIBELLES, types: TYPES, destinations: DESTINATIONS, tournages: s.tournages });
      return;
    }
    if (m === 'POST' && p === '/api/rescan') {
      const r = rescan();
      sendJSON(res, 200, { ok: true, scannedAt: r.summary.scannedAt, ms: r.summary.scanMs });
      return;
    }

    // --- tournages ---
    if (p.startsWith('/api/tournage/')) {
      const rest = seg('/api/tournage/');
      const [slug, sub] = rest.split('/');
      if (!okSlug(slug)) { sendError(res, 400, 'Bad slug'); return; }
      if (m === 'GET' && !sub) {
        const d = detailTournage(slug);
        if (!d) { sendError(res, 404, 'Unknown tournage'); return; }
        sendJSON(res, 200, d);
        return;
      }
      if (m === 'POST' && !sub) {
        const body = await readJSONBody(req, res);
        if (!body) return;
        const d = patchTournage(slug, body.patch || {});
        if (!d) { sendError(res, 404, 'Unknown tournage'); return; }
        invalider();
        log(`tournage ${slug} modifié : ${Object.keys(body.patch || {}).join(', ')}`);
        sendJSON(res, 200, d);
        return;
      }
      if (m === 'POST' && sub === 'livrable') {
        const body = await readJSONBody(req, res);
        if (!body) return;
        if (!body.id) { sendError(res, 400, 'Missing livrable id'); return; }
        const d = patchLivrable(slug, String(body.id), body.patch || {});
        if (!d) { sendError(res, 404, 'Unknown tournage or livrable'); return; }
        invalider();
        log(`livrable ${slug}/${body.id} modifié : ${JSON.stringify(body.patch || {})}`);
        sendJSON(res, 200, d);
        return;
      }
    }

    // --- vignettes ---
    if (m === 'GET' && p.startsWith('/api/thumb/')) {
      const dossier = seg('/api/thumb/');
      if (!okSlug(dossier)) { sendError(res, 400, 'Bad slug'); return; }
      await handleThumb(req, res, dossier, url.searchParams.get('kind') === 'loop' ? 'loop' : 'poster', url.searchParams.get('file') || null, url);
      return;
    }

    // --- review et retours ---
    if (m === 'GET' && p === '/api/reviews') { sendJSON(res, 200, construireReviews()); return; }
    if (m === 'GET' && p.startsWith('/api/feedback/')) {
      const dossier = seg('/api/feedback/');
      const dir = dossierAbs(dossier);
      if (!dir) { sendError(res, 404, 'Unknown project'); return; }
      sendJSON(res, 200, { slug: dossier, files: readFeedback(dir) });
      return;
    }
    if (m === 'POST' && p === '/api/feedback/fichier') {
      // un dessin tracé sur l'image ou une pièce jointe, écrit dans review/ du projet
      const body = await readJSONBody(req, res, 12 * 1024 * 1024);
      if (!body) return;
      const dir = dossierAbs(body.slug);
      if (!dir) { sendError(res, 404, 'Unknown project'); return; }
      if (!body.render) { sendError(res, 400, 'Missing render'); return; }
      try {
        const r = writeNoteFile(dir, body.render, String(body.id || ''), String(body.kind || ''), body.data, body.nom);
        log(`retour ${body.kind} écrit : ${body.slug}/${r.rel} (${r.bytes} o)`);
        sendJSON(res, 200, { ok: true, ...r });
      } catch (e) { sendError(res, 400, e.message); }
      return;
    }
    if (m === 'POST' && (p === '/api/feedback' || p === '/api/feedback/done' || p === '/api/feedback/note')) {
      const body = await readJSONBody(req, res, 512 * 1024);
      if (!body) return;
      const dir = dossierAbs(body.slug);
      if (!dir) { sendError(res, 404, 'Unknown project'); return; }
      if (!body.render) { sendError(res, 400, 'Missing render'); return; }
      let result;
      if (p === '/api/feedback') result = writeFeedback(dir, body.render, body.notes, { fps: body.fps, width: body.width, height: body.height });
      else if (p === '/api/feedback/done') result = setFeedbackDone(dir, body.render, body.done);
      else result = setNoteDone(dir, body.render, String(body.id || ''), body.done);
      if (!result) { sendError(res, 404, 'No feedback for this render'); return; }
      invalider();
      sendJSON(res, 200, { ok: true, feedback: result });
      return;
    }

    // --- actions ---
    if (m === 'GET' && p === '/api/actions') { sendJSON(res, 200, { actions: listActions(ROOT) }); return; }
    if (m === 'POST' && p === '/api/run') { await handleRun(req, res); return; }
    if (m === 'GET' && p.startsWith('/api/job/')) {
      const job = getJob(seg('/api/job/'), Number(url.searchParams.get('since')) || 0);
      if (!job) { sendError(res, 404, 'Unknown job'); return; }
      sendJSON(res, 200, job);
      return;
    }
    if (m === 'GET' && p.startsWith('/api/jobs/')) { sendJSON(res, 200, { jobs: listJobs(seg('/api/jobs/')) }); return; }
    if (m === 'POST' && p.startsWith('/api/job-stop/')) { sendJSON(res, 200, { ok: stopJob(seg('/api/job-stop/')) }); return; }

    // --- rangement ---
    if (m === 'GET' && p === '/api/prune-all') {
      const all = prunePlanAll(url.searchParams.get('keep'));
      sendJSON(res, 200, { keep: all.keep, removeCount: all.removeCount, freeBytes: all.freeBytes, protected: all.protected,
        projects: all.projects.map((x) => ({ slug: x.slug, removed: x.remove.length, bytes: x.freeBytes, deliverables: x.deliverables })) });
      return;
    }
    if (m === 'POST' && p === '/api/prune-all') {
      const body = await readJSONBody(req, res);
      if (!body) return;
      const all = prunePlanAll(body.keep);
      const moved = []; const failed = []; let freedBytes = 0;
      for (const plan of all.projects) {
        const r = applyPrune(plan.absPath, plan);
        for (const f of r.moved) moved.push({ slug: plan.slug, file: f });
        for (const f of r.failed) failed.push({ slug: plan.slug, ...f });
        freedBytes += plan.remove.filter((x) => r.moved.includes(x.file)).reduce((n, x) => n + (x.bytes || 0), 0);
      }
      invalider();
      log(`rangement global : ${moved.length} rendus vers la corbeille`);
      sendJSON(res, 200, { ok: true, moved, failed, freedBytes, projects: all.projects.length });
      return;
    }
    if (m === 'GET' && p.startsWith('/api/prune/')) {
      const dossier = seg('/api/prune/');
      if (!okSlug(dossier)) { sendError(res, 400, 'Bad slug'); return; }
      const plan = prunePlanFor(dossier, url.searchParams.get('keep'));
      if (!plan) { sendError(res, 404, 'Unknown project'); return; }
      sendJSON(res, 200, plan);
      return;
    }
    if (m === 'POST' && p === '/api/prune') {
      const body = await readJSONBody(req, res);
      if (!body) return;
      if (!okSlug(body.slug)) { sendError(res, 400, 'Bad slug'); return; }
      const plan = prunePlanFor(body.slug, body.keep);
      if (!plan) { sendError(res, 404, 'Unknown project'); return; }
      if (!plan.remove.length) { sendJSON(res, 200, { ok: true, moved: [], failed: [], freedBytes: 0 }); return; }
      const r = applyPrune(plan.absPath, plan);
      invalider();
      log(`rangement ${body.slug} : ${r.moved.length} rendus vers la corbeille`);
      sendJSON(res, 200, { ok: true, ...r });
      return;
    }

    // --- Studio HyperFrames ---
    if (p.startsWith('/api/studio/') && (m === 'POST' || m === 'DELETE')) {
      const dossier = seg('/api/studio/');
      if (!okSlug(dossier)) { sendError(res, 400, 'Bad slug'); return; }
      await handleStudio(req, res, dossier, m);
      return;
    }
    if (m === 'GET' && p === '/api/studios') { sendJSON(res, 200, { studios: await listStudios() }); return; }

    // --- bibliothèques ---
    if (m === 'GET' && p === '/api/compositions') { sendJSON(res, 200, compositionsAvecUsages()); return; }
    if (m === 'GET' && p === '/api/charte') {
      const c = readJSONSafe(path.join(DONNEES, 'charte.json'), 1024 * 1024);
      if (!c) { sendError(res, 404, 'charte.json absent'); return; }
      sendJSON(res, 200, c);
      return;
    }

    // --- bibliothèques de la deuxième livraison : Effets et Vitrine ---
    // L'index est construit par scripts/construire-effets.mjs et lu ici tel
    // quel, les épingles du moment appliquées par-dessus (pas de reconstruction
    // à chaque épingle : INDEX.md seul est réécrit, pour le skill design-beats).
    if (m === 'GET' && p === '/api/effets') { sendJSON(res, 200, lireEffets()); return; }
    if (m === 'GET' && p === '/api/vitrine') { sendJSON(res, 200, lireVitrine()); return; }
    if (m === 'POST' && p === '/api/effets/reconstruire') {
      const r = ecrireEffets();
      const v = ecrireVitrine();
      log(`bibliothèques reconstruites : ${r.index.resume.entrees} effets, ${v.resume.gardees} références en vitrine`);
      sendJSON(res, 200, { ok: true, effets: r.index.resume, vitrine: v.resume, avertissements: r.index.avertissements });
      return;
    }
    if (m === 'GET' && p === '/api/epingles') { sendJSON(res, 200, { items: [...lireEpingles().values()] }); return; }
    if (m === 'GET' && p === '/api/ma-charte') { const mc = lireMaCharte(); sendJSON(res, 200, { chaines: [...mc.chaines.values()], cartes: [...mc.cartes.values()] }); return; }
    if (m === 'POST' && p === '/api/ma-charte') {
      // adopter (ou retirer) une chaîne ou une carte dans la charte
      const body = await readJSONBody(req, res);
      if (!body) return;
      let mc;
      try { mc = ecrireMaCharte(String(body.type || ''), String(body.id || ''), { dans: typeof body.dans === 'boolean' ? body.dans : undefined, note: typeof body.note === 'string' ? body.note : undefined }); }
      catch (e) { sendError(res, 400, e.message); return; }
      try { rafraichirIndexMd(); } catch (e) { log('INDEX.md non rafraîchi :', e); }
      log(`ma charte : ${body.type} ${body.id} ${body.dans === false ? 'retiré' : 'adopté'}`);
      sendJSON(res, 200, { ok: true, chaines: [...mc.chaines.values()], cartes: [...mc.cartes.values()] });
      return;
    }
    if (m === 'POST' && p === '/api/epingle') {
      const body = await readJSONBody(req, res);
      if (!body) return;
      let etat;
      try { etat = ecrireEpingle(String(body.id || ''), { epingle: typeof body.epingle === 'boolean' ? body.epingle : undefined, note: typeof body.note === 'string' ? body.note : undefined }); }
      catch (e) { sendError(res, 400, e.message); return; }
      try { rafraichirIndexMd(); } catch (e) { log('INDEX.md non rafraîchi :', e); }
      log(`épingle ${etat.epingle ? 'posée' : 'retirée'} : ${etat.id}`);
      sendJSON(res, 200, { ok: true, epingle: etat });
      return;
    }

    // --- divers ---
    if (m === 'POST' && p === '/api/reveal') {
      const body = await readJSONBody(req, res);
      if (!body) return;
      if (typeof body.path !== 'string') { sendError(res, 400, 'Missing path'); return; }
      const abs = path.resolve(body.path);
      if (!(dansDossier(abs, ROOT) || dansDossier(abs, DONNEES)) || abs === ROOT) { sendError(res, 400, 'Path outside workspace'); return; }
      if (!fs.existsSync(abs)) { sendError(res, 404, 'Path does not exist'); return; }
      execFile('open', ['-R', abs], (err) => (err ? sendError(res, 500, 'Failed to reveal') : sendJSON(res, 200, { ok: true })));
      return;
    }
    if (m === 'GET' && p.startsWith('/workspace/')) { serveFichier(req, res, ROOT, p.slice('/workspace/'.length)); return; }
    if (m === 'GET' && p.startsWith('/donnees/')) { serveFichier(req, res, DONNEES, p.slice('/donnees/'.length)); return; }
    if (m === 'GET') { serveStatic(res, p); return; }
    sendError(res, 404, 'Not found');
  } catch (e) {
    log('erreur sur', m, p, ':', e);
    if (!res.headersSent) sendError(res, 500, e && e.message ? e.message : 'Internal error');
    else res.end();
  }
});

// --- cycle de vie : fait pour launchd ---
function sonderJumeau() {
  return new Promise((resolve) => {
    const rq = http.get({ host: '127.0.0.1', port: PORT, path: '/api/health', timeout: 1500 }, (rs) => {
      let d = '';
      rs.on('data', (c) => { d += c; });
      rs.on('end', () => { try { const j = JSON.parse(d); resolve(j && j.ok ? j : null); } catch { resolve(null); } });
    });
    rq.on('error', () => resolve(null));
    rq.on('timeout', () => { rq.destroy(); resolve(null); });
  });
}

server.on('error', async (err) => {
  if (err && err.code === 'EADDRINUSE') {
    const jumeau = await sonderJumeau();
    if (jumeau) {
      // un hub sain répond déjà : sortir en succès, sinon launchd relancerait en boucle
      log(`un hub sain tourne déjà sur le port ${PORT} (pid ${jumeau.pid}) : je m'efface`);
      process.exit(0);
    }
    log(`le port ${PORT} est occupé par autre chose qu'un hub : arrêt`);
    process.exit(1);
  }
  log('erreur serveur :', err);
  process.exit(1);
});

function arreter(signal) {
  log(`${signal} reçu : arrêt propre`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGTERM', () => arreter('SIGTERM'));
process.on('SIGINT', () => arreter('SIGINT'));
process.on('uncaughtException', (e) => { log('exception non rattrapée :', e); process.exit(1); });
process.on('unhandledRejection', (e) => { log('promesse rejetée sans suite :', e); });

server.listen(PORT, () => {
  const t0 = Date.now();
  const r = rescan();
  log(`${NOM} v${VERSION} à l'écoute sur http://localhost:${PORT} (pid ${process.pid}, node ${process.version}) : ` +
      `${r.summary.tournages} tournages, ${r.summary.dossiers} dossiers, relevé en ${r.summary.scanMs} ms, chauffe ${Date.now() - t0} ms. Espace : ${ROOT}`);
});
