// scripts/extraire-exemples.mjs
// Tire les extraits de donnees/exemples/exemples.json du rendu de chaque vidéo :
// un mp4 720p (avec le son) et une affiche jpg au milieu de l'extrait, dans
// donnees/exemples/clips/. Ne refait que ce qui manque ou a changé (--force pour tout).
// Lit video-projects sans rien y écrire.
//
//   node scripts/extraire-exemples.mjs [--force]

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PROJECTS_DIR, DONNEES } from '../hub/lib/espace.mjs';

const force = process.argv.includes('--force');
const FICHIER = path.join(DONNEES, 'exemples', 'exemples.json');
const CLIPS = path.join(DONNEES, 'exemples', 'clips');
const ex = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
fs.mkdirSync(CLIPS, { recursive: true });

let faits = 0, gardes = 0, erreurs = 0;
for (const e of ex.exemples) {
  const v = ex.videos[e.video];
  if (!v) { console.log(`⚠ ${e.id} : vidéo « ${e.video} » inconnue`); erreurs++; continue; }
  const src = path.join(PROJECTS_DIR, v.dossier, v.rendu);
  if (!fs.existsSync(src)) { console.log(`⚠ ${e.id} : rendu absent ${src}`); erreurs++; continue; }
  const mp4 = path.join(CLIPS, `${e.id}.mp4`), jpg = path.join(CLIPS, `${e.id}.jpg`);
  const marque = path.join(CLIPS, `${e.id}.src`);
  const sig = `${src}|${fs.statSync(src).mtimeMs}|${e.debut}|${e.fin}`;
  if (!force && fs.existsSync(mp4) && fs.existsSync(jpg) && fs.existsSync(marque) && fs.readFileSync(marque, 'utf8') === sig) { gardes++; continue; }
  const d = Math.max(0.5, e.fin - e.debut);
  const r1 = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(e.debut), '-i', src, '-t', String(d),
    '-vf', 'scale=-2:720', '-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', mp4], { encoding: 'utf8' });
  const r2 = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(e.debut + d * 0.55), '-i', src, '-frames:v', '1',
    '-vf', 'scale=-2:720', '-q:v', '4', jpg], { encoding: 'utf8' });
  if (r1.status || r2.status) { console.log(`✗ ${e.id} : ${(r1.stderr || r2.stderr || '').slice(0, 200)}`); erreurs++; continue; }
  fs.writeFileSync(marque, sig);
  faits++;
  console.log(`✓ ${e.id} (${d.toFixed(1)} s, ${Math.round(fs.statSync(mp4).size / 1024)} Ko)`);
}
console.log(`${faits} extraits faits, ${gardes} déjà là, ${erreurs} erreurs · ${CLIPS}`);
