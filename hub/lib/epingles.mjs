// hub/lib/epingles.mjs
// Les épingles : ce que le créateur a retenu dans la bibliothèque (une carte, une
// référence, un style). Deux couches, fusionnées à la lecture :
//   1. ma-bibliotheque/selection.json de la v1, lu SEULEMENT (on n'écrit jamais
//      dans EditingOS-dist) ;
//   2. donnees/epingles.json de la v2, qui prime : il peut épingler une carte
//      que la v1 ne connaît pas, et dés-épingler ce que la v1 avait retenu.
// Une épingle ne stocke que l'id : l'objet reste dans la style-library ou la
// motion-library, jamais recopié.

import path from 'node:path';
import { ROOT, DONNEES, readJSONSafe, ecrireJSON } from './espace.mjs';

export const EPINGLES_FILE = path.join(DONNEES, 'epingles.json');
const SELECTION_V1 = path.join(ROOT, 'ma-bibliotheque', 'selection.json');

/** Map id -> { id, epingle, le, note, via } ; via = 'v1' ou 'v2'. */
export function lireEpingles() {
  const out = new Map();
  const v1 = readJSONSafe(SELECTION_V1, 1024 * 1024);
  for (const it of (v1 && Array.isArray(v1.items) ? v1.items : [])) {
    if (it && typeof it.id === 'string') out.set(it.id, { id: it.id, epingle: true, le: it.added || null, note: it.note || '', via: 'v1' });
  }
  const v2 = readJSONSafe(EPINGLES_FILE, 1024 * 1024);
  for (const it of (v2 && Array.isArray(v2.items) ? v2.items : [])) {
    if (!it || typeof it.id !== 'string') continue;
    const avant = out.get(it.id);
    out.set(it.id, { id: it.id, epingle: it.epingle !== false, le: it.le || null, note: typeof it.note === 'string' ? it.note : (avant ? avant.note : ''), via: 'v2' });
  }
  return out;
}

/** Pose ou retire une épingle (v2). Retourne l'état fusionné de cet id. */
export function ecrireEpingle(id, { epingle, note } = {}) {
  if (typeof id !== 'string' || !id || id.length > 200 || /[\s/]/.test(id)) throw new Error('id d\'épingle invalide');
  const cur = readJSONSafe(EPINGLES_FILE, 1024 * 1024) || {};
  const items = Array.isArray(cur.items) ? cur.items.filter((x) => x && typeof x.id === 'string') : [];
  const i = items.findIndex((x) => x.id === id);
  const prev = i >= 0 ? items[i] : null;
  const fusion = lireEpingles().get(id);
  const next = {
    id,
    epingle: typeof epingle === 'boolean' ? epingle : !(fusion && fusion.epingle),
    le: new Date().toISOString(),
    note: typeof note === 'string' ? note.slice(0, 2000) : (prev && typeof prev.note === 'string' ? prev.note : (fusion ? fusion.note : '')),
  };
  if (i >= 0) items[i] = next; else items.unshift(next);
  ecrireJSON(EPINGLES_FILE, {
    schema: 1,
    a_propos: 'Les épingles posées depuis le hub v2 (Effets, Vitrine). Elles priment sur ma-bibliotheque/selection.json de la v1, qui n\'est jamais réécrit. epingle: false retire une épingle v1.',
    updated: new Date().toISOString(),
    items,
  });
  return lireEpingles().get(id);
}

/** Applique les épingles courantes sur une liste d'entrées ({id, epingle, note}). Mutation en place, retourne la liste. */
export function appliquerEpingles(entrees, epingles = lireEpingles()) {
  for (const e of entrees) {
    const p = epingles.get(e.id);
    e.epingle = !!(p && p.epingle);
    e.note_epingle = p && p.epingle && p.note ? p.note : '';
  }
  return entrees;
}
