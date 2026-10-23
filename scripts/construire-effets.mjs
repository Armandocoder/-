// scripts/construire-effets.mjs
// Génère donnees/effets/index.json et donnees/effets/INDEX.md depuis la v1 :
//   style-library/registry.json (+ style.json de chaque style, pour les
//   traitements et les variantes générées), les 30 fiches Pocinho et les
//   styles de motion-library/library.json, classés par donnees/effets/mapping.json
//   dans le vocabulaire fermé de donnees/effets/vocabulaire.json.
//
//   node scripts/construire-effets.mjs                # construit et écrit
//   node scripts/construire-effets.mjs --diagnostic   # + techniques non classées
//   node scripts/construire-effets.mjs --sec          # ne rien écrire, afficher le résumé
//
// Ne modifie jamais EditingOS-dist. Relancer après tout changement de
// mapping.json ou de vocabulaire.json, ou quand la style-library bouge.

import { construireEffets, ecrireEffets, FICHIERS } from '../hub/lib/effets.mjs';
import { diagnostiquerTechniques } from '../hub/lib/vitrine.mjs';

const args = process.argv.slice(2);
const sec = args.includes('--sec');
const diag = args.includes('--diagnostic');

const { index, diagnostic } = sec ? construireEffets() : ecrireEffets();
const r = index.resume;
console.log(`${r.cartes} cartes jouables · ${r.chaines} chaînes · ${r.effets} effets · ${r.epinglees} épinglées · ${index.sources.registry.generees} variantes repliées · ${index.duree_ms} ms`);
console.log(`vocabulaire ${index.vocabulaire.valide ? 'validé' : 'PROPOSÉ, non validé'}`);
console.log('par effet :', Object.entries(r.par_effet).map(([k, v]) => `${k} ${v}`).join(' · '));
for (const a of index.avertissements) console.log('⚠', a);
if (!sec) console.log(`écrit : ${FICHIERS.index}\n        ${FICHIERS.md}`);
if (diag) {
  for (const [p, n] of diagnostic.purposes_inconnus) console.log(`purpose inconnu : ${p} (${n})`);
  const inc = diagnostiquerTechniques();
  console.log(`\n${inc.length} techniques de motion-library non classées par mapping.techniques (ça ne touche que les étiquettes de la vitrine) :`);
  for (const [t, n] of inc) console.log(`  ${n}× ${t}`);
}
