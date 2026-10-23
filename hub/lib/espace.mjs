// hub/lib/espace.mjs
// Où sont les choses. Le hub v2 vit dans EditingOS-v2 mais LIT l'espace de
// travail de la v1 (video-projects, bibliothèques) sans jamais y écrire de code.
// Tout ce que la v2 déclare vit dans donnees/.

import fs from 'node:fs';
import path from 'node:path';

export const V2_ROOT = path.resolve(import.meta.dirname, '..', '..');

function lireConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(V2_ROOT, 'config.json'), 'utf8'));
  } catch {
    return {};
  }
}
const config = lireConfig();

/** Racine de l'espace de travail (la v1) : video-projects/, scripts/, style-library/… */
export const ROOT = path.resolve(V2_ROOT, config.espace_de_travail || '.');
export const PROJECTS_DIR = path.join(ROOT, 'video-projects');
export const DONNEES = path.join(V2_ROOT, 'donnees');
export const TOURNAGES_DIR = path.join(DONNEES, 'tournages');
export const PORT = Number(process.env.PORT) || Number(config.port) || 4300;
export const NOM = config.nom || 'Editing OS';
export const VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(V2_ROOT, 'package.json'), 'utf8')).version || '0';
  } catch {
    return '0';
  }
})();

export function statSafe(p) {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

export function readdirSafe(p) {
  try {
    return fs.readdirSync(p, { withFileTypes: true });
  } catch {
    return [];
  }
}

export function mtimeMs(st) {
  return st ? Math.round(st.mtimeMs) : 0;
}

/** Lit un JSON borné en taille. null si absent, trop gros ou invalide. */
export function readJSONSafe(abs, max = 256 * 1024) {
  const st = statSafe(abs);
  if (!st || !st.isFile() || st.size > max) return null;
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch {
    return null;
  }
}

/** Écrit un JSON de façon atomique (fichier temporaire puis rename). */
export function ecrireJSON(abs, obj) {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  fs.renameSync(tmp, abs);
}

/** Vrai si `abs` est dans `dir` (ou égal). */
export function dansDossier(abs, dir) {
  const a = path.resolve(abs);
  const d = path.resolve(dir);
  return a === d || a.startsWith(d + path.sep);
}
