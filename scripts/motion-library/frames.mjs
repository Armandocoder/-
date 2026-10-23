#!/usr/bin/env node
// Tire de chaque démo de motion-library/ ce qu'il faut pour la REGARDER :
//   media/<source>/<id>.sheet.jpg  planche de 12 images réparties sur la durée (4×3)
//   media/<source>/<id>.thumb.jpg  la vignette : l'image la plus riche du milieu
//                                  de la vidéo (beaucoup de démos ouvrent sur du noir)
//
//   node scripts/motion-library/frames.mjs            # ce qui manque
//   node scripts/motion-library/frames.mjs --force    # tout refaire
//
// La vidéo n'est jamais stockée : ffmpeg lit chaque image directement à son
// timecode (local si la démo est rapatriée, sinon depuis l'URL).
// Puis relancer `npm run motion:import` pour que la base référence les images.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LIB = path.join(ROOT, 'motion-library');
const force = process.argv.includes('--force');
const N = 12;
const CELL_W = 480, CELL_H = 270;

const run = (cmd, args) => new Promise((ok, ko) =>
  execFile(cmd, args, { maxBuffer: 1 << 24 }, (err, out, errOut) => (err ? ko(new Error(errOut || err.message)) : ok(out))));

async function duration(src) {
  const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src]);
  return parseFloat(out) || 0;
}

async function one(e) {
  const dir = path.join(LIB, 'media', e.source);
  const sheet = path.join(dir, `${e.id}.sheet.jpg`);
  const thumb = path.join(dir, `${e.id}.thumb.jpg`);
  if (!force && fs.existsSync(sheet) && fs.existsSync(thumb)) return 'déjà';
  const src = e.demoLocal ? path.join(ROOT, e.demoLocal) : e.demo;
  const d = await duration(src);
  if (!d) throw new Error('durée illisible');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mlf-'));
  try {
    const frames = [];
    for (let i = 0; i < N; i++) {
      const t = (d * (i + 0.5)) / N;
      const f = path.join(tmp, `f${String(i).padStart(2, '0')}.jpg`);
      // chaque image dans une case uniforme, bandes noires si le format diffère
      await run('ffmpeg', ['-v', 'error', '-y', '-ss', t.toFixed(2), '-i', src, '-frames:v', '1',
        '-vf', `scale=${CELL_W}:${CELL_H}:force_original_aspect_ratio=decrease,pad=${CELL_W}:${CELL_H}:(ow-iw)/2:(oh-ih)/2:black`,
        '-q:v', '4', f]);
      frames.push(f);
    }
    fs.mkdirSync(dir, { recursive: true });
    await run('ffmpeg', ['-v', 'error', '-y', '-framerate', '1', '-i', path.join(tmp, 'f%02d.jpg'),
      '-vf', 'tile=4x3:padding=4:color=white', '-frames:v', '1', '-q:v', '4', sheet]);
    // la vignette : parmi les images du milieu (25-85 %), la plus lourde en JPEG —
    // un écran noir ou uni compresse presque à rien, une image riche pèse
    const mid = frames.slice(Math.floor(N * 0.25), Math.ceil(N * 0.85));
    const best = mid.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
    const tBest = (d * (frames.indexOf(best) + 0.5)) / N;
    const vert = e.format === '9:16';
    await run('ffmpeg', ['-v', 'error', '-y', '-ss', tBest.toFixed(2), '-i', src, '-frames:v', '1',
      '-vf', vert ? 'scale=-2:960' : 'scale=960:-2', '-q:v', '3', thumb]);
    return 'ok';
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const lib = JSON.parse(fs.readFileSync(path.join(LIB, 'library.json'), 'utf8'));
const todo = lib.entries.filter((e) => e.demo);
let i = 0, done = 0;
const fails = [];
await Promise.all(Array.from({ length: 6 }, async () => {
  while (i < todo.length) {
    const e = todo[i++];
    try { await one(e); } catch (err) { fails.push(`${e.id} : ${err.message.split('\n')[0]}`); }
    if (++done % 20 === 0) console.log(`  ${done}/${todo.length}`);
  }
}));
console.log(`✓ ${todo.length - fails.length}/${todo.length} planches`);
if (fails.length) { console.log(fails.join('\n')); process.exitCode = 1; }
