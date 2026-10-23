// hub/lib/ma-charte.mjs
// MA DA : ce que le créateur monte dans ses vidéos. Dans donnees/ma-charte.json :
//   cartes[]   une carte adoptée depuis l'inspiration : elle entre dans ses
//              animations, à monter telle quelle
//   chaines[]  ses RÉFÉRENCES de montage : une chaîne d'inspiration qu'il a
//              notée (« mon style pour le YouTube long »). Ça n'adopte pas ses
//              cartes, ça dit pourquoi il la regarde.
// Les cartes du style 10-maison sont dans sa DA par nature. Tout le reste de
// la style-library est de l'inspiration tant qu'une carte n'est pas adoptée.
// Ce fichier est à la v2 ; ma-bibliotheque/selection.json de la v1 a servi
// d'amorce (les trois styles choisis le 06/10) et n'est jamais réécrit.

import path from 'node:path';
import { DONNEES, readJSONSafe, ecrireJSON } from './espace.mjs';

export const MA_CHARTE_FILE = path.join(DONNEES, 'ma-charte.json');
export const CHAINE_MAISON = 'maison';

function lireFichier() {
  const j = readJSONSafe(MA_CHARTE_FILE, 1024 * 1024) || {};
  return {
    schema: 1,
    a_propos: j.a_propos || 'Ce que le créateur veut dans SA charte de montage. Une chaîne adoptée met toutes ses cartes dans la charte ; une carte adoptée seule n\'y met qu\'elle. Le reste de la style-library est de l\'inspiration.',
    updated: j.updated || null,
    chaines: Array.isArray(j.chaines) ? j.chaines.filter((x) => x && typeof x.id === 'string') : [],
    cartes: Array.isArray(j.cartes) ? j.cartes.filter((x) => x && typeof x.id === 'string') : [],
  };
}

/** { chaines: Map id -> {id, le, note, via}, cartes: Map id -> {id, le, note, via} } */
export function lireMaCharte() {
  const f = lireFichier();
  return { chaines: new Map(f.chaines.map((x) => [x.id, x])), cartes: new Map(f.cartes.map((x) => [x.id, x])) };
}

/** Adopte ou retire une chaîne (`type: 'chaine'`) ou une carte (`type: 'carte'`). Retourne la charte lue. */
export function ecrireMaCharte(type, id, { dans, note } = {}) {
  if (type !== 'chaine' && type !== 'carte') throw new Error('type attendu : chaine ou carte');
  if (typeof id !== 'string' || !id || id.length > 200 || /[\s/]/.test(id)) throw new Error('id invalide');
  if (type === 'chaine' && id === CHAINE_MAISON) throw new Error('la chaîne le créateur est la charte elle-même');
  const f = lireFichier();
  const liste = type === 'chaine' ? f.chaines : f.cartes;
  const i = liste.findIndex((x) => x.id === id);
  const garder = typeof dans === 'boolean' ? dans : i === -1;
  if (!garder) { if (i >= 0) liste.splice(i, 1); }
  else {
    const cur = i >= 0 ? liste[i] : { id, le: new Date().toISOString().slice(0, 10), note: '', via: 'hub' };
    if (typeof note === 'string') cur.note = note.slice(0, 2000);
    if (i === -1) liste.unshift(cur); else liste[i] = cur;
  }
  f.updated = new Date().toISOString();
  ecrireJSON(MA_CHARTE_FILE, f);
  return lireMaCharte();
}

/**
 * Pose sur un index d'effets : `dans_ma_charte`, `charte_via`, `charte_note` sur
 * chaque entrée ; `dans_ma_charte` (la chaîne maison), `reference`,
 * `reference_note` sur chaque chaîne. Mutation en place.
 */
export function appliquerMaCharte(index, mc = lireMaCharte()) {
  for (const c of index.chaines || []) {
    const a = mc.chaines.get(c.id);
    c.dans_ma_charte = c.id === CHAINE_MAISON;
    c.reference = !!a;
    c.reference_note = a ? a.note || '' : '';
    c.reference_le = a ? a.le || null : null;
    c.charte_note = c.id === CHAINE_MAISON ? 'La charte elle-même : crème quadrillé, jaune, Garet.' : (a ? a.note || '' : '');
  }
  const refs = new Set([...mc.chaines.keys()]);
  for (const x of index.entrees || []) {
    const a = mc.cartes.get(x.id);
    if (x.chaine === CHAINE_MAISON) { x.dans_ma_charte = true; x.charte_via = 'charte'; x.charte_note = ''; }
    else if (a) { x.dans_ma_charte = true; x.charte_via = 'carte'; x.charte_note = a.note || ''; }
    else { x.dans_ma_charte = false; x.charte_via = null; x.charte_note = ''; }
    x.chaine_reference = refs.has(x.chaine);
  }
  if (index.resume) {
    index.resume.dans_ma_charte = (index.entrees || []).filter((x) => x.dans_ma_charte).length;
    index.resume.inspiration = (index.entrees || []).length - index.resume.dans_ma_charte;
  }
  index.ma_charte = { references: [...mc.chaines.values()], chaines: [...mc.chaines.values()], cartes: [...mc.cartes.values()] };
  return index;
}
