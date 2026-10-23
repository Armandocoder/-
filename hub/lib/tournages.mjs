// hub/lib/tournages.mjs
// Le modèle de la v2 : un TOURNAGE déclare ses LIVRABLES, et l'état de chaque
// livrable se lit sur le disque (rendus + retours) sauf quand le créateur l'a
// déclaré (validé, publié, abandonné).
//
// La déclaration vit dans donnees/tournages/<slug>.json (voir CONTRAT.md).
// Un dossier de video-projects/ qu'aucune déclaration ne couvre reçoit une
// déclaration automatique, en mémoire, marquée `non_declare` : un nouveau
// projet apparaît donc tout de suite, et la première modification depuis le
// hub écrit le fichier.

import path from 'node:path';

import { TOURNAGES_DIR, readdirSafe, readJSONSafe, ecrireJSON } from './espace.mjs';
import { listeDossiers, inventaireDossier, enrichirRendu, renduDeReference, prettify, splitSlug, dossierAbs } from './dossiers.mjs';
import { groupRenders } from './deliverables.mjs';

export const ETATS = ['retours', 'a-relire', 'en-montage', 'a-monter', 'valide', 'publie', 'abandonne'];
export const ETATS_LIBELLES = {
  'retours': 'retours chez Claude',
  'a-relire': 'à relire',
  'en-montage': 'en montage',
  'a-monter': 'à monter',
  'valide': 'validé',
  'publie': 'publié',
  'abandonne': 'abandonné',
};
export const TYPES = ['reel', 'pub', 'ugc', 'youtube', 'motion', 'demo'];
export const DESTINATIONS = ['instagram', 'meta-ads', 'youtube', 'skool', 'linkedin', 'client', 'interne'];
const DECLARES = new Set(['valide', 'publie', 'abandonne']);
const URGENCE = Object.fromEntries(ETATS.map((e, i) => [e, i]));

function baseName(file) {
  return path.basename(String(file)).replace(/\.(mp4|webm|mov)$/i, '');
}

/** Un rendu appartient à un livrable si son nom de base commence par un de ses préfixes. */
export function appartient(file, prefixes) {
  const b = baseName(file).toLowerCase();
  for (const p of prefixes || []) {
    const q = String(p).toLowerCase();
    if (!q) continue;
    if (b === q || b.startsWith(q + '-') || b.startsWith(q + '_') || b.startsWith(q + '.')) return true;
  }
  return false;
}

/** Type deviné depuis le nom du dossier (la migration l'affine, le créateur le corrige). */
export function devinerType(slug) {
  const r = splitSlug(slug).rest.toLowerCase();
  if (/^(youtube|intro-youtube)/.test(r)) return 'youtube';
  if (/^(reel|arcads)/.test(r)) return 'reel';
  if (/^ugc/.test(r)) return 'ugc';
  if (/^(ads?|pub)[-_]/.test(r) || /^(ads?|pub)$/.test(r)) return 'pub';
  if (/^(demo|calibration|comparaison)/.test(r)) return 'demo';
  if (/(motion|presentation|flora|iso|codex|idees|virgin)/.test(r)) return 'motion';
  return 'reel';
}

function nettoyerLivrable(L, dossierParDefaut) {
  return {
    id: String(L.id || 'principal'),
    nom: String(L.nom || L.id || 'La vidéo'),
    dossier: String(L.dossier || dossierParDefaut),
    composition: L.composition || null,
    prefixes: Array.isArray(L.prefixes) ? L.prefixes.map(String) : [],
    destination: L.destination || null,
    etat: DECLARES.has(L.etat) ? L.etat : null,
    valide: L.valide && typeof L.valide === 'object' ? L.valide : null,
    publie: L.publie && typeof L.publie === 'object' ? L.publie : null,
    composition_memo: L.composition_memo || null,
  };
}

function nettoyerDeclaration(obj, slug) {
  if (!obj || typeof obj !== 'object') return null;
  const dossiers = Array.isArray(obj.dossiers) && obj.dossiers.length ? obj.dossiers.map(String) : [slug];
  return {
    schema: 1,
    slug,
    titre: String(obj.titre || prettify(slug)),
    type: TYPES.includes(obj.type) ? obj.type : devinerType(slug),
    dossiers,
    archive: !!obj.archive,
    note: typeof obj.note === 'string' ? obj.note : '',
    livrables: (Array.isArray(obj.livrables) ? obj.livrables : []).map((L) => nettoyerLivrable(L, dossiers[0])),
    migration: obj.migration && typeof obj.migration === 'object' ? obj.migration : null,
  };
}

/** Toutes les déclarations sur disque : Map slug → déclaration. */
export function lireDeclarations() {
  const out = new Map();
  for (const e of readdirSafe(TOURNAGES_DIR)) {
    if (!e.isFile() || !e.name.endsWith('.json')) continue;
    const slug = e.name.replace(/\.json$/, '');
    const decl = nettoyerDeclaration(readJSONSafe(path.join(TOURNAGES_DIR, e.name)), slug);
    if (decl) out.set(slug, decl);
  }
  return out;
}

/**
 * Déclaration automatique d'un dossier non déclaré : un livrable par groupe de
 * rendus (la règle v1), ou un livrable « principal » vide s'il n'y a rien.
 */
export function declarationAuto(dossier, inv) {
  const groups = inv ? groupRenders(inv.renders, inv.compositions) : [];
  const livrables = groups.length
    ? groups.map((g) => nettoyerLivrable({
        id: g.id,
        nom: g.id,
        dossier,
        composition: inv.compositions.includes(g.id) ? `compositions/${g.id}.html` : (inv.indexHtml ? 'index.html' : null),
        prefixes: [g.id],
      }, dossier))
    : [nettoyerLivrable({ id: 'principal', nom: 'La vidéo', dossier,
                          composition: inv && inv.indexHtml ? 'index.html' : null, prefixes: [] }, dossier)];
  return {
    schema: 1,
    slug: dossier,
    titre: (inv && inv.titreMeta) || prettify(dossier),
    type: devinerType(dossier),
    dossiers: [dossier],
    archive: false,
    note: '',
    livrables,
    migration: { auto: true, non_declare: true, a_valider: true },
  };
}

/**
 * L'état d'un livrable. Déclaré si le créateur l'a posé ; sinon lu sur le disque.
 * `rendus` : plus récent d'abord. `fbFor(file)` : le lot de retours d'un rendu.
 */
function etatLivrable(L, rendus, inv, fbFor) {
  if (DECLARES.has(L.etat)) return L.etat;
  if (!rendus.length) return inv && (inv.indexHtml || inv.compositions.length) ? 'en-montage' : 'a-monter';
  const dernier = rendus[0];
  // Un lot de retours ouvert sur n'importe quelle version compte, tant qu'aucun
  // rendu n'est sorti APRÈS lui : un rendu plus récent que les retours, c'est
  // la version suivante, donc à relire.
  const lots = rendus.map((r) => fbFor(r.file)).filter((f) => f && f.notes.length);
  const ouverts = lots.filter((f) => !f.done);
  if (ouverts.length) {
    const plusRecent = Math.max(...ouverts.map((f) => f.updatedAt || 0));
    if (dernier.mtime <= plusRecent + 1000) return 'retours';
    return 'a-relire';
  }
  const fb = fbFor(dernier.file);
  if (fb && fb.notes.length && fb.done) return 'en-montage';
  return 'a-relire';
}

// `depuis` : mtime du rendu le plus récent du livrable. Un lot ouvert plus
// ancien que ce rendu est « dépassé » : la version suivante est sortie depuis,
// on le compte à part pour ne pas gonfler les retours à traiter pour toujours.
function resumeRetours(fichiers, depuis = 0) {
  let open = 0;
  let total = 0;
  let depasses = 0;
  for (const f of fichiers) {
    total += f.notes.length;
    if (f.done) continue;
    const n = f.notes.filter((x) => !x.done).length;
    if (depuis && (f.updatedAt || 0) < depuis - 1000) depasses += n;
    else open += n;
  }
  return { open, total, depasses };
}

function resumeRetoursRendu(fb) {
  if (!fb) return { open: 0, total: 0, done: false };
  return { open: fb.done ? 0 : fb.notes.filter((n) => !n.done).length, total: fb.notes.length, done: !!fb.done };
}

/**
 * Résumé (ou détail) d'un tournage à partir de sa déclaration et des
 * inventaires de ses dossiers.
 */
export function resumerTournage(decl, invs, detail = false) {
  const getInv = (d) => {
    if (!invs.has(d)) invs.set(d, inventaireDossier(d));
    return invs.get(d);
  };

  const livrables = [];
  const rendusParLivrable = {};
  const utilises = new Set();

  // combien de livrables par dossier : un livrable seul dans son dossier, sans
  // préfixe, prend tous les rendus du dossier
  const parDossier = {};
  for (const L of decl.livrables) parDossier[L.dossier] = (parDossier[L.dossier] || 0) + 1;

  for (const L of decl.livrables) {
    const inv = getInv(L.dossier);
    const tous = inv ? inv.renders : [];
    const prend = (r) => (L.prefixes.length ? appartient(r.file, L.prefixes) : parDossier[L.dossier] === 1);
    const rendus = tous.filter(prend).map((r) => (inv ? enrichirRendu(inv.projDir, r) : r));
    for (const r of rendus) utilises.add(`${L.dossier}|${r.file}`);

    const fbs = inv ? inv.feedback : [];
    const fbFor = (file) => fbs.find((f) => baseName(f.render) === baseName(file)) || null;
    const fbsDuLivrable = fbs.filter((f) => (L.prefixes.length ? appartient(f.render, L.prefixes) : parDossier[L.dossier] === 1));

    const etat = etatLivrable(L, rendus, inv, fbFor);
    const ref = renduDeReference(rendus);

    livrables.push({
      id: L.id,
      nom: L.nom,
      dossier: L.dossier,
      composition: L.composition,
      prefixes: L.prefixes,
      destination: L.destination,
      etat,
      etat_declare: DECLARES.has(L.etat) ? L.etat : null,
      versions: rendus.length,
      derniere: ref,
      plus_recent: rendus[0] || null,
      retours: resumeRetours(fbsDuLivrable, rendus[0] ? rendus[0].mtime : 0),
      composition_memo: L.composition_memo,
      valide: L.valide,
      publie: L.publie,
    });

    if (detail) {
      rendusParLivrable[L.id] = rendus.map((r) => ({ dossier: L.dossier, ...r, retours: resumeRetoursRendu(fbFor(r.file)) }));
    }
  }

  // rendus d'aucun livrable
  const orphelins = [];
  for (const d of decl.dossiers) {
    const inv = getInv(d);
    if (!inv) continue;
    for (const r of inv.renders) {
      if (!utilises.has(`${d}|${r.file}`)) orphelins.push({ dossier: d, ...r });
    }
  }

  // état du tournage : le plus urgent
  const actifs = livrables.filter((l) => l.etat !== 'abandonne');
  const pool = actifs.length ? actifs : livrables;
  const etat = pool.length ? pool.slice().sort((a, b) => URGENCE[a.etat] - URGENCE[b.etat])[0].etat : 'a-monter';

  // aperçu : le livrable le plus récemment touché qui a un rendu (hors abandonnés)
  const avecRendu = pool.filter((l) => l.derniere).sort((a, b) => b.plus_recent.mtime - a.plus_recent.mtime);
  const ap = avecRendu[0] || null;
  const apercu = ap ? { dossier: ap.dossier, livrable: ap.id, ...ap.derniere } : null;

  let lastTouched = 0;
  let renderBytes = 0;
  const absPaths = {};
  const compositions = {};
  const documents = {};
  const meta = {};
  const retoursFichiers = {};
  for (const d of decl.dossiers) {
    const inv = getInv(d);
    if (!inv) continue;
    lastTouched = Math.max(lastTouched, inv.lastTouched);
    renderBytes += inv.rendersBytes;
    if (detail) {
      absPaths[d] = inv.projDir;
      compositions[d] = [...(inv.indexHtml ? ['index.html'] : []), ...inv.compositions.map((c) => `compositions/${c}.html`)];
      documents[d] = inv.documents;
      meta[d] = inv.meta;
      retoursFichiers[d] = inv.feedback;
    }
  }

  const base = {
    slug: decl.slug,
    titre: decl.titre,
    type: decl.type,
    date: splitSlug(decl.slug).date,
    dossiers: decl.dossiers,
    archive: decl.archive,
    note: decl.note,
    migration: decl.migration,
    etat,
    apercu,
    livrables,
    retours: {
      open: livrables.reduce((n, l) => n + l.retours.open, 0),
      total: livrables.reduce((n, l) => n + l.retours.total, 0),
    },
    lastTouched,
    renderBytes,
    dossiers_manquants: decl.dossiers.filter((d) => !getInv(d)),
  };
  if (!detail) return base;
  return {
    ...base,
    absPaths,
    compositions,
    rendus: rendusParLivrable,
    rendus_orphelins: orphelins,
    retours_fichiers: retoursFichiers,
    documents,
    meta,
  };
}

/** Toutes les déclarations, complétées par les automatiques des dossiers non couverts. */
export function toutesDeclarations(invs) {
  const decls = lireDeclarations();
  const couverts = new Set();
  for (const d of decls.values()) for (const x of d.dossiers) couverts.add(x);
  for (const d of listeDossiers()) {
    if (couverts.has(d) || decls.has(d)) continue;
    if (!invs.has(d)) invs.set(d, inventaireDossier(d));
    decls.set(d, declarationAuto(d, invs.get(d)));
  }
  return decls;
}

/** L'état complet : résumé + un tournage par déclaration. */
export function construireEtat() {
  const t0 = Date.now();
  const invs = new Map();
  for (const d of listeDossiers()) invs.set(d, inventaireDossier(d));
  const decls = toutesDeclarations(invs);

  const tournages = [];
  for (const decl of decls.values()) tournages.push(resumerTournage(decl, invs));
  tournages.sort((a, b) => b.lastTouched - a.lastTouched);

  const parEtat = Object.fromEntries(ETATS.map((e) => [e, 0]));
  let livrables = 0;
  let renderBytes = 0;
  for (const t of tournages) {
    if (t.archive) continue;
    for (const l of t.livrables) { livrables++; parEtat[l.etat]++; }
    renderBytes += t.renderBytes;
  }
  const scannedAt = Date.now();
  return {
    summary: {
      tournages: tournages.filter((t) => !t.archive).length,
      archives: tournages.filter((t) => t.archive).length,
      dossiers: invs.size,
      livrables,
      parEtat,
      renderBytes,
      scannedAt,
      scanMs: scannedAt - t0,
    },
    tournages,
    invs,
    decls,
  };
}

/** La déclaration d'un tournage (fichier, ou automatique si c'est un dossier non déclaré). */
export function lireDeclaration(slug) {
  if (!slug || slug.includes('/') || slug.includes('..')) return null;
  const decl = nettoyerDeclaration(readJSONSafe(path.join(TOURNAGES_DIR, `${slug}.json`)), slug);
  if (decl) return decl;
  // un dossier couvert par un autre tournage n'est pas un tournage
  for (const d of lireDeclarations().values()) if (d.dossiers.includes(slug)) return null;
  if (!dossierAbs(slug)) return null;
  return declarationAuto(slug, inventaireDossier(slug));
}

export function detailTournage(slug) {
  const decl = lireDeclaration(slug);
  if (!decl) return null;
  return resumerTournage(decl, new Map(), true);
}

function ecrireDeclaration(decl) {
  const out = { ...decl };
  if (out.migration && out.migration.non_declare) {
    // la première écriture depuis le hub : ce n'est plus une déclaration automatique
    out.migration = { ...out.migration, non_declare: false, a_valider: false, auto: false, ecrit_le: new Date().toISOString() };
  }
  ecrireJSON(path.join(TOURNAGES_DIR, `${decl.slug}.json`), out);
  return out;
}

const CHAMPS_TOURNAGE = new Set(['titre', 'type', 'note', 'archive']);

export function patchTournage(slug, patch) {
  const decl = lireDeclaration(slug);
  if (!decl) return null;
  for (const [k, v] of Object.entries(patch || {})) {
    if (!CHAMPS_TOURNAGE.has(k)) continue;
    if (k === 'type' && !TYPES.includes(v)) continue;
    if (k === 'archive') decl.archive = !!v;
    else decl[k] = String(v == null ? '' : v);
  }
  if (patch && patch.valider_migration) decl.migration = { ...(decl.migration || {}), a_valider: false, valide_le: new Date().toISOString() };
  ecrireDeclaration(decl);
  return detailTournage(slug);
}

const CHAMPS_LIVRABLE = new Set(['nom', 'destination', 'etat', 'valide', 'publie', 'composition_memo', 'prefixes']);

export function patchLivrable(slug, id, patch) {
  const decl = lireDeclaration(slug);
  if (!decl) return null;
  const L = decl.livrables.find((l) => l.id === id);
  if (!L) return null;
  const p = patch || {};
  const now = new Date().toISOString();
  for (const [k, v] of Object.entries(p)) {
    if (!CHAMPS_LIVRABLE.has(k)) continue;
    if (k === 'nom') L.nom = String(v || L.nom);
    else if (k === 'destination') L.destination = v && DESTINATIONS.includes(v) ? v : null;
    else if (k === 'composition_memo') L.composition_memo = v ? String(v) : null;
    else if (k === 'prefixes' && Array.isArray(v)) L.prefixes = v.map(String).filter(Boolean);
  }
  if ('etat' in p) {
    if (p.etat === 'valide') {
      L.etat = 'valide';
      L.valide = { version: (p.valide && p.valide.version) || (L.valide && L.valide.version) || null,
                   le: now, par: (p.valide && p.valide.par) || 'maison', via: (p.valide && p.valide.via) || 'hub' };
    } else if (p.etat === 'publie') {
      L.etat = 'publie';
      L.publie = { le: (p.publie && p.publie.le) || now, ou: (p.publie && p.publie.ou) || L.destination || null,
                   url: (p.publie && p.publie.url) || null };
      if (!L.valide) L.valide = { version: null, le: now, par: 'maison', via: 'hub' };
    } else if (p.etat === 'abandonne') {
      L.etat = 'abandonne';
    } else {
      // retour à l'état déduit : on efface la déclaration, sinon la page croirait encore à une validation
      L.etat = null;
      L.valide = null;
      L.publie = null;
    }
  }
  ecrireDeclaration(decl);
  return detailTournage(slug);
}
