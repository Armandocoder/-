// Ce qui change d'un système à l'autre, au même endroit.
//
// Windows : `npx` est un script .cmd que spawn/execFile ne savent pas lancer
// sans shell, et `python3` n'existe pas (c'est `python`, ou un alias qui ouvre
// le Microsoft Store). On lance donc le CLI hyperframes local directement avec
// node, et Python sous son nom Windows. Mac et Linux gardent leurs commandes.
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WINDOWS = process.platform === 'win32';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HYPERFRAMES_BIN = path.join(ROOT, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs');

export const PYTHON = WINDOWS ? 'python' : 'python3';

/** [cmd, args] prêts pour spawn/execFile sur ce système. */
export function commande(cmd, args) {
  if (!WINDOWS) return [cmd, args];
  if (cmd === 'npx' && args[0] === 'hyperframes') return [process.execPath, [HYPERFRAMES_BIN, ...args.slice(1)]];
  if (cmd === 'python3') return [PYTHON, args];
  return [cmd, args];
}

/** Montre le fichier dans le gestionnaire de fichiers du système. */
export function reveler(abs, cb) {
  if (process.platform === 'darwin') return execFile('open', ['-R', abs], cb);
  // explorer.exe rend un code 1 même quand il a ouvert la fenêtre
  if (WINDOWS) return execFile('explorer.exe', [`/select,${abs}`], () => cb(null));
  return execFile('xdg-open', [path.dirname(abs)], cb);
}
