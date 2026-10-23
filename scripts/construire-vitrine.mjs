// scripts/construire-vitrine.mjs
// Génère donnees/vitrine/index.json : les références de motion-library moins
// les faibles, pépites d'abord puis une rangée par usage, chacune avec sa
// mécanique, son prompt et ses aperçus locaux (vérifiés sur le disque).
//
//   node scripts/construire-vitrine.mjs
//
// Ne modifie jamais EditingOS-dist. Relancer après npm run motion:import côté v1.

import { ecrireVitrine, VITRINE_INDEX } from '../hub/lib/vitrine.mjs';

const index = ecrireVitrine();
const r = index.resume;
console.log(`${r.gardees} références gardées sur ${r.total} (${r.faibles} faibles écartées) · ${r.pepites} pépites · ${r.epinglees} épinglées · ${index.rangees.length} rangées · ${index.duree_ms} ms`);
console.log('par source :', Object.entries(r.par_source).map(([k, v]) => `${k} ${v}`).join(' · '));
const sansApercu = index.references.filter((x) => !x.apercu.mp4 && !x.apercu.live && !x.apercu.poster);
if (sansApercu.length) console.log(`⚠ ${sansApercu.length} références sans aucun aperçu local : ${sansApercu.slice(0, 8).map((x) => x.id).join(', ')}${sansApercu.length > 8 ? '…' : ''}`);
console.log(`écrit : ${VITRINE_INDEX}`);
