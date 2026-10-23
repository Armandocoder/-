// scripts/livrable.mjs
// Poser l'état d'un livrable depuis une conversation ou un script, sans passer
// par le navigateur. C'est l'outil de Claude quand le créateur dit « c'est good »,
// « c'est publié, voilà le lien », ou « laisse tomber celle-là ».
//
//   node scripts/livrable.mjs <tournage> <livrable> valider [--version renders/x.mp4]
//   node scripts/livrable.mjs <tournage> <livrable> publier --ou instagram [--url https://…]
//   node scripts/livrable.mjs <tournage> <livrable> abandonner
//   node scripts/livrable.mjs <tournage> <livrable> deduit            # retour à l'état lu sur le disque
//   node scripts/livrable.mjs <tournage> <livrable> memo <disposition> # mémoire de composition
//   node scripts/livrable.mjs <tournage> <livrable> nom "Le reel Instagram"
//   node scripts/livrable.mjs <tournage>                                # affiche les livrables
//
// Le fichier donnees/tournages/<tournage>.json est écrit, puis le hub est prié
// de relire le disque (POST /api/rescan) s'il tourne.

import http from 'node:http';

import { PORT } from '../hub/lib/espace.mjs';
import { detailTournage, patchLivrable, ETATS_LIBELLES } from '../hub/lib/tournages.mjs';

const [tournage, livrable, action, ...reste] = process.argv.slice(2);

function option(nom) {
  const i = reste.indexOf(`--${nom}`);
  return i >= 0 ? reste[i + 1] : null;
}

function rescan() {
  return new Promise((resolve) => {
    const rq = http.request({ host: '127.0.0.1', port: PORT, path: '/api/rescan', method: 'POST', timeout: 1500 }, (rs) => { rs.resume(); rs.on('end', resolve); });
    rq.on('error', resolve);
    rq.on('timeout', () => { rq.destroy(); resolve(); });
    rq.end();
  });
}

function afficher(d) {
  console.log(`${d.titre} (${d.slug}) · ${d.type} · ${ETATS_LIBELLES[d.etat]}`);
  for (const L of d.livrables) {
    const v = L.derniere ? ` · ${L.derniere.file}` : '';
    const r = L.retours.open ? ` · ${L.retours.open} retour(s) à traiter` : '';
    console.log(`  - ${L.id} « ${L.nom} » : ${ETATS_LIBELLES[L.etat]}${L.etat_declare ? ' (déclaré)' : ''}${v}${r}${L.composition_memo ? ` · composition ${L.composition_memo}` : ''}`);
  }
}

if (!tournage) {
  console.error('usage : node scripts/livrable.mjs <tournage> [<livrable> <action> …]');
  process.exit(2);
}

const detail = detailTournage(tournage);
if (!detail) { console.error(`tournage inconnu : ${tournage}`); process.exit(1); }

if (!livrable || !action) { afficher(detail); process.exit(0); }

const L = detail.livrables.find((x) => x.id === livrable);
if (!L) { console.error(`livrable inconnu : ${livrable}. Disponibles : ${detail.livrables.map((x) => x.id).join(', ')}`); process.exit(1); }

let patch;
switch (action) {
  case 'valider':
    patch = { etat: 'valide', valide: { version: option('version') || (L.derniere ? L.derniere.file : null), par: 'maison', via: 'conversation' } };
    break;
  case 'publier':
    patch = { etat: 'publie', publie: { ou: option('ou') || L.destination || null, url: option('url') || null } };
    break;
  case 'abandonner':
    patch = { etat: 'abandonne' };
    break;
  case 'deduit':
    patch = { etat: null };
    break;
  case 'memo':
    patch = { composition_memo: reste[0] || null };
    break;
  case 'nom':
    patch = { nom: reste.join(' ') };
    break;
  case 'destination':
    patch = { destination: reste[0] || null };
    break;
  default:
    console.error(`action inconnue : ${action} (valider, publier, abandonner, deduit, memo, nom, destination)`);
    process.exit(2);
}

const apres = patchLivrable(tournage, livrable, patch);
await rescan();
afficher(apres);
