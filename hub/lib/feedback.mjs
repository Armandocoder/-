// hub/lib/feedback.mjs
// Les retours de review, écrits dans le projet (video-projects/<dossier>/review/).
//
// Un fichier par rendu : des notes sur la v17 n'ont aucun sens sur la v18, les
// timecodes ont bougé. Le schéma reste compatible avec la v1 (project, render,
// updatedAt, done, notes[{t, txt}]) et s'enrichit :
//   - au niveau du fichier : fps, width, height (pour retrouver la frame après coup)
//   - par note : id, done, createdAt, general (note sans timecode), t2 (fin d'une
//     plage), dessin (un PNG tracé sur l'image, dans review/), piece (une photo
//     ou un fichier joint, dans review/)
// La v1 ignore les champs qu'elle ne connaît pas, donc les deux hubs peuvent
// lire les mêmes fichiers pendant la comparaison.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const NOTE_CAP = 500;

function reviewDir(projDir) {
  return path.join(projDir, 'review');
}

function fileFor(projDir, render) {
  const base = path.basename(String(render || 'rendu')).replace(/\.(mp4|webm|mov)$/i, '');
  const safe = base.replace(/[^a-zA-Z0-9._-]+/g, '-');
  return path.join(reviewDir(projDir), `${safe}.json`);
}

function readJSON(abs) {
  try {
    const st = fs.statSync(abs);
    if (!st.isFile() || st.size > 512 * 1024) return null;
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch {
    return null;
  }
}

function newId() {
  return crypto.randomBytes(4).toString('hex');
}

// Une note nettoyée. Les anciennes notes (t, txt) reçoivent un id stable
// dérivé de leur contenu, pour que « fait » tienne d'une lecture à l'autre.
function cleanNote(n, fileDone) {
  if (!n || typeof n.txt !== 'string' || !n.txt.trim()) return null;
  const txt = String(n.txt).trim().slice(0, 2000);
  const t = Math.max(0, Number(n.t) || 0);
  const id = typeof n.id === 'string' && n.id
    ? n.id.slice(0, 16)
    : crypto.createHash('sha1').update(`${t.toFixed(3)}|${txt}`).digest('hex').slice(0, 8);
  const out = {
    id,
    t,
    txt,
    done: typeof n.done === 'boolean' ? n.done : !!fileDone,
    general: !!n.general,
    createdAt: Number(n.createdAt) || 0,
  };
  // une plage : la fin, strictement après le début
  if (n.t2 != null && Number(n.t2) > t) out.t2 = Number(n.t2);
  // un dessin ou une pièce jointe : un fichier de review/, jamais ailleurs
  const relOk = (v) => typeof v === 'string' && /^review\/[a-zA-Z0-9._-]+$/.test(v);
  if (relOk(n.dessin)) out.dessin = n.dessin;
  if (relOk(n.piece)) { out.piece = n.piece; if (typeof n.piece_nom === 'string') out.piece_nom = n.piece_nom.slice(0, 120); }
  return out;
}

/**
 * Écrit un fichier qui accompagne une note (un dessin tracé sur l'image, une
 * photo jointe) dans review/, à côté du lot. Retourne son chemin relatif au
 * projet. `dataUrl` : data:image/png;base64,… (8 Mo au plus).
 */
export function writeNoteFile(projDir, render, id, kind, dataUrl, nom) {
  if (!/^[a-zA-Z0-9]{1,16}$/.test(String(id || ''))) throw new Error('id de note invalide');
  if (kind !== 'dessin' && kind !== 'piece') throw new Error('kind attendu : dessin ou piece');
  const m = /^data:(image\/(png|jpeg|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('fichier attendu en data URL (png, jpeg, webp ou pdf)');
  const ext = m[1] === 'application/pdf' ? 'pdf' : m[2] === 'jpeg' ? 'jpg' : m[2];
  const buf = Buffer.from(m[3], 'base64');
  if (!buf.length || buf.length > 8 * 1024 * 1024) throw new Error('fichier vide ou de plus de 8 Mo');
  const base = path.basename(fileFor(projDir, render), '.json');
  const name = `${base}.${id}.${kind}.${ext}`;
  fs.mkdirSync(reviewDir(projDir), { recursive: true });
  fs.writeFileSync(path.join(reviewDir(projDir), name), buf);
  return { rel: `review/${name}`, bytes: buf.length, nom: typeof nom === 'string' ? nom.slice(0, 120) : null };
}

/** Tous les retours d'un projet, le plus récemment touché d'abord. */
export function readFeedback(projDir) {
  const dir = reviewDir(projDir);
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.json')) continue;
    const abs = path.join(dir, e.name);
    const obj = readJSON(abs);
    if (!obj || !Array.isArray(obj.notes)) continue;
    const notes = obj.notes.map((n) => cleanNote(n, obj.done)).filter(Boolean);
    out.push({
      file: `review/${e.name}`,
      render: obj.render || e.name.replace(/\.json$/, ''),
      updatedAt: obj.updatedAt || 0,
      // « traité » au niveau du lot : explicite, ou toutes les notes faites
      done: !!obj.done || (notes.length > 0 && notes.every((n) => n.done)),
      fps: Number(obj.fps) || null,
      width: Number(obj.width) || null,
      height: Number(obj.height) || null,
      notes,
    });
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt);
  return out;
}

/** Ce que la grille affiche : combien de retours restent à traiter. */
export function feedbackSummary(projDir) {
  const all = readFeedback(projDir);
  let open = 0;
  let total = 0;
  for (const f of all) {
    total += f.notes.length;
    if (!f.done) open += f.notes.filter((n) => !n.done).length;
  }
  return { open, total, files: all.length };
}

/** Le lot de retours d'un rendu précis, ou null. */
export function feedbackFor(projDir, render) {
  const wanted = path.basename(String(render || ''));
  return readFeedback(projDir).find((f) => path.basename(f.render) === wanted) || null;
}

/**
 * Écrit les retours d'un rendu. Ajouter une note à un lot déjà marqué traité
 * le rouvre : sinon un retour arrivé après coup disparaîtrait sans bruit.
 * `extra` : { fps, width, height } quand la review les connaît.
 */
export function writeFeedback(projDir, render, notes, extra = {}) {
  const abs = fileFor(projDir, render);
  const prev = readJSON(abs);
  const now = Date.now();
  const clean = (Array.isArray(notes) ? notes : [])
    .slice(0, NOTE_CAP)
    .map((n) => cleanNote({ ...n, id: n && n.id ? n.id : newId(), createdAt: (n && n.createdAt) || now }, false))
    .filter(Boolean)
    .sort((a, b) => a.t - b.t);

  const prevTxt = JSON.stringify((prev && prev.notes || []).map((n) => [n.t, n.txt, n.t2 || null, n.dessin || null, n.piece || null]));
  const changed = !prev || prevTxt !== JSON.stringify(clean.map((n) => [n.t, n.txt, n.t2 || null, n.dessin || null, n.piece || null]));
  const body = {
    project: path.basename(projDir),
    render: String(render || ''),
    updatedAt: now,
    done: changed ? false : !!(prev && prev.done),
    fps: Number(extra.fps) || (prev && prev.fps) || null,
    width: Number(extra.width) || (prev && prev.width) || null,
    height: Number(extra.height) || (prev && prev.height) || null,
    notes: clean,
  };
  fs.mkdirSync(reviewDir(projDir), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(body, null, 2) + '\n');
  return body;
}

/** Marque un lot traité (ou le rouvre). Toutes les notes suivent. */
export function setFeedbackDone(projDir, render, done) {
  const abs = fileFor(projDir, render);
  const prev = readJSON(abs);
  if (!prev) return null;
  prev.done = !!done;
  prev.notes = (prev.notes || []).map((n) => ({ ...cleanNote(n, false), done: !!done }));
  prev.updatedAt = Date.now();
  fs.writeFileSync(abs, JSON.stringify(prev, null, 2) + '\n');
  return prev;
}

/** Marque UNE note faite ou non. Le lot est traité quand toutes le sont. */
export function setNoteDone(projDir, render, id, done) {
  const abs = fileFor(projDir, render);
  const prev = readJSON(abs);
  if (!prev) return null;
  let hit = false;
  prev.notes = (prev.notes || []).map((n) => {
    const c = cleanNote(n, prev.done);
    if (c && c.id === id) { hit = true; c.done = !!done; }
    return c;
  }).filter(Boolean);
  if (!hit) return null;
  prev.done = prev.notes.length > 0 && prev.notes.every((n) => n.done);
  prev.updatedAt = Date.now();
  fs.writeFileSync(abs, JSON.stringify(prev, null, 2) + '\n');
  return prev;
}
