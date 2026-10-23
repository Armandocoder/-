// hub/lib/dossiers.mjs
// L'inventaire d'un dossier de video-projects/ : ce qu'il y a sur le disque,
// et rien d'autre. Relevé par stat seulement (readdir + stat + meta.json),
// jamais d'ouverture de média : le format vient du cache media-info.
//
// Ce module ne connaît ni les tournages ni les livrables : c'est tournages.mjs
// qui pose la déclaration par-dessus.

import path from 'node:path';

import { PROJECTS_DIR, statSafe, readdirSafe, mtimeMs, readJSONSafe } from './espace.mjs';
import { readFeedback } from './feedback.mjs';
import { readCached, orientationOf, ratioLabel } from './media-info.mjs';

const VIDEO_RE = /\.(mp4|webm|mov)$/i;
const MASTER_RE = /-master\.(mp4|webm|mov)$/i;

/** Les dossiers de projets, triés. Les dossiers cachés (.consolide…) sont ignorés. */
export function listeDossiers() {
  return readdirSafe(PROJECTS_DIR)
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort();
}

/** Chemin absolu d'un dossier, ou null s'il n'existe pas ou si le nom est louche. */
export function dossierAbs(dossier) {
  if (!dossier || typeof dossier !== 'string') return null;
  if (dossier.includes('/') || dossier.includes('..') || dossier.startsWith('.')) return null;
  const abs = path.join(PROJECTS_DIR, dossier);
  const st = statSafe(abs);
  return st && st.isDirectory() ? abs : null;
}

// La convention de nommage est datée : AA-MM-JJ-sujet-en-kebab.
const DATED_RE = /^(\d{2})-(\d{2})-(\d{2})-(.+)$/;

export function splitSlug(slug) {
  const bare = String(slug).replace(/^_/, '');
  const m = DATED_RE.exec(bare);
  if (!m) return { date: null, rest: bare };
  return { date: `20${m[1]}-${m[2]}-${m[3]}`, rest: m[4] };
}

const ACRONYMS = {
  ia: 'IA', ai: 'AI', os: 'OS', ugc: 'UGC', b2b: 'B2B', b2c: 'B2C',
  seo: 'SEO', cta: 'CTA', vsl: 'VSL', faq: 'FAQ', '3d': '3D', '2d': '2D', tiktok: 'TikTok',
  youtube: 'YouTube', capcut: 'CapCut', chatgpt: 'ChatGPT',
};

export function prettify(slug) {
  return splitSlug(slug).rest
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w, i) => {
      const low = w.toLowerCase();
      if (ACRONYMS[low]) return ACRONYMS[low];
      return i === 0 ? low.charAt(0).toUpperCase() + low.slice(1) : low;
    })
    .join(' ');
}

function pickString(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * Inventaire d'un dossier. null si le dossier n'existe pas.
 * {
 *   dossier, projDir, indexHtml, compositions: ['a', 'b'] (noms sans .html),
 *   renders: [{ file, mtime, bytes, master, final }] (plus récent d'abord),
 *   rendersBytes, documents: ['MONTAGE.md', …], meta: { fps, format, statut, type, famille },
 *   titreMeta, lastTouched, feedback: [FeedbackFile]
 * }
 */
export function inventaireDossier(dossier) {
  const projDir = dossierAbs(dossier);
  if (!projDir) return null;

  let lastTouched = mtimeMs(statSafe(projDir));
  const bump = (m) => { if (m > lastTouched) lastTouched = m; };

  // --- racine : index.html et documents markdown ---
  let indexHtml = false;
  const documents = [];
  for (const e of readdirSafe(projDir)) {
    if (!e.isFile()) continue;
    const m = mtimeMs(statSafe(path.join(projDir, e.name)));
    bump(m);
    if (e.name === 'index.html') indexHtml = true;
    if (/\.md$/i.test(e.name)) documents.push(e.name);
  }
  documents.sort();

  // --- compositions/ ---
  const compositions = readdirSafe(path.join(projDir, 'compositions'))
    .filter((e) => e.isFile() && /\.html$/i.test(e.name))
    .map((e) => e.name.replace(/\.html$/i, ''))
    .sort();

  // --- renders/ (un niveau) + renders/final/ ---
  const renders = [];
  let rendersBytes = 0;
  const rendersDir = path.join(projDir, 'renders');
  for (const e of readdirSafe(rendersDir)) {
    const abs = path.join(rendersDir, e.name);
    const st = statSafe(abs);
    if (e.isFile()) {
      rendersBytes += st ? st.size : 0;
      bump(mtimeMs(st));
      if (VIDEO_RE.test(e.name)) {
        renders.push({ file: `renders/${e.name}`, mtime: mtimeMs(st), bytes: st ? st.size : 0,
                       master: MASTER_RE.test(e.name), final: false });
      }
    } else if (e.isDirectory() && e.name === 'final') {
      for (const d of readdirSafe(abs)) {
        if (!d.isFile() || !VIDEO_RE.test(d.name)) continue;
        const dst = statSafe(path.join(abs, d.name));
        rendersBytes += dst ? dst.size : 0;
        bump(mtimeMs(dst));
        renders.push({ file: `renders/final/${d.name}`, mtime: mtimeMs(dst), bytes: dst ? dst.size : 0,
                       master: MASTER_RE.test(d.name), final: true });
      }
    }
  }
  renders.sort((a, b) => b.mtime - a.mtime);

  // --- meta.json : ce que la v1 écrivait, lu en tolérance ---
  const meta = readJSONSafe(path.join(projDir, 'meta.json'), 64 * 1024) || {};
  const fps = Number(meta.fps) || Number(meta.render && meta.render.fps) || 30;

  return {
    dossier,
    projDir,
    indexHtml,
    compositions,
    renders,
    rendersBytes,
    documents,
    meta: {
      fps,
      format: pickString(meta.format),
      statut: pickString(meta.statut),
      type: pickString(meta.type),
      famille: pickString(meta.famille || meta.family),
      render: meta.render && typeof meta.render === 'object' ? meta.render : null,
    },
    titreMeta: pickString(meta.titre || meta.title || meta.name),
    lastTouched,
    feedback: readFeedback(projDir),
  };
}

/** Un rendu avec ce que le cache media-info sait de lui (jamais de sonde ici). */
export function enrichirRendu(projDir, r) {
  const info = readCached(path.join(projDir, r.file), r.mtime);
  return {
    ...r,
    width: info ? info.w : null,
    height: info ? info.h : null,
    orientation: orientationOf(info),
    ratio: ratioLabel(info),
    durationMs: info && info.dur ? Math.round(info.dur * 1000) : null,
  };
}

/** Le rendu de référence d'une liste : le master le plus récent, sinon le plus récent. */
// Un aperçu (540p, mobile, partage…) n'est pas une version : il ne compte pas
// comme « rendu plus récent » face à un master.
const APERCU_RE = /[-_](540p|720p|mobile|apercu|partage|preview)(?=[-_.]|$)/i;
export function estApercu(file) { return APERCU_RE.test(path.basename(String(file))); }

export function renduDeReference(renders) {
  if (!renders || !renders.length) return null;
  const sorted = renders.slice().sort((a, b) => b.mtime - a.mtime);
  const master = sorted.find((r) => r.master);
  const pick = master || sorted[0];
  const plusRecent = sorted.find((r) => !estApercu(r.file)) || sorted[0];
  return {
    ...pick,
    apercu: estApercu(pick.file),
    newerExists: !!master && plusRecent.file !== pick.file,
    newerFile: !!master && plusRecent.file !== pick.file ? plusRecent.file : null,
  };
}
