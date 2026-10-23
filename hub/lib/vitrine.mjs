// hub/lib/vitrine.mjs
// La VITRINE : les références de motion-library (Pocinho, Prompt Motion, styles)
// moins les faibles, rangées pépites d'abord puis une rangée par usage. C'est
// l'endroit où l'on se balade pour trouver une direction, pas la grille de
// travail (ça, c'est Effets). Construit depuis la v1 sans rien y écrire.
//
//   donnees/vitrine/index.json   GÉNÉRÉ par scripts/construire-vitrine.mjs

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DONNEES, readJSONSafe, ecrireJSON, statSafe } from './espace.mjs';
import { lireEpingles, appliquerEpingles } from './epingles.mjs';
import { lireVocabulaire, lireMapping } from './effets.mjs';

export const VITRINE_DIR = path.join(DONNEES, 'vitrine');
export const VITRINE_INDEX = path.join(VITRINE_DIR, 'index.json');
const LIBRARY = path.join(ROOT, 'motion-library', 'library.json');

const SOURCES_FR = { styles: 'Styles Editing OS', pocinho: 'Julien Pocinho', 'prompt-motion': 'Prompt Motion' };
const NIV_RANK = { pepite: 0, solide: 1, faible: 2 };
const SRC_RANK = { styles: 0, pocinho: 1, 'prompt-motion': 2 };

function existe(rel) { if (!rel) return false; const st = statSafe(path.join(ROOT, rel)); return !!(st && st.isFile()); }
function siExiste(rel) { return existe(rel) ? rel : null; }
function rx(src) { try { return new RegExp(src, 'iu'); } catch { return null; } }

export function construireVitrine() {
  const t0 = Date.now();
  const lib = readJSONSafe(LIBRARY, 64 * 1024 * 1024);
  if (!lib || !Array.isArray(lib.entries)) {
    // pas encore de bibliothèque motion (installation neuve) : une vitrine vide qui dit quoi faire
    return { schema: 1, absent: true, genere_le: new Date().toISOString(), sources: {}, usages: {}, effets: [], rangees: [], references: [], faibles: [],
      resume: { total: 0, gardees: 0, faibles: 0, pepites: 0, epinglees: 0, par_source: {} } };
  }
  const vocab = lireVocabulaire();
  const mapping = lireMapping();
  const regles = (mapping.techniques || []).map((r) => ({ re: rx(r.motif), effet: r.effet })).filter((r) => r.re && vocab.effets.some((e) => e.id === r.effet));
  const usages = mapping.usages || {};
  const epingles = lireEpingles();

  const toutes = lib.entries.slice();
  const faibles = toutes.filter((e) => e.niveau === 'faible');
  const gardees = toutes.filter((e) => e.niveau !== 'faible');
  gardees.sort((a, b) => (NIV_RANK[a.niveau] ?? 1) - (NIV_RANK[b.niveau] ?? 1) || (SRC_RANK[a.source] ?? 9) - (SRC_RANK[b.source] ?? 9) || String(a.titleFr || a.title).localeCompare(String(b.titleFr || b.title), 'fr'));

  const references = gardees.map((e) => {
    const techs = (e.mecanique && e.mecanique.techniques) || [];
    const effets = [];
    for (const t of techs) { const r = regles.find((x) => x.re.test(t)); if (r && !effets.includes(r.effet)) effets.push(r.effet); }
    if (!effets.length && usages[e.categories && e.categories[0]]) effets.push(usages[e.categories[0]]);
    const live = e.live && e.live.src ? siExiste(e.live.src) : null;
    return {
      id: e.id,
      source: e.source,
      source_nom: SOURCES_FR[e.source] || e.source,
      titre: e.titleFr || e.title,
      titre_original: e.title && e.title !== (e.titleFr || e.title) ? e.title : null,
      resume: e.resume || e.summary || '',
      usage: (e.categories && e.categories[0]) || null,
      usages: e.categories || [],
      effets,
      format: e.format || null,
      duree: e.duration || null,
      niveau: e.niveau || null,
      pourquoi: e.pourquoi || '',
      ambiance: e.ambiance || null,
      tech: e.tech || null,
      difficulte: e.difficulty || null,
      ideal_pour: e.idealFor || '',
      auteur: e.author || '',
      url: e.url || null,
      page: e.page || null,
      mecanique: e.mecanique ? { transitions: e.mecanique.transitions, rythme: e.mecanique.rythme, texte: e.mecanique.texte, techniques: techs } : null,
      prompt: e.prompt || '',
      prompt_generique: !!e.genericPrompt,
      prompt_court: !!e.shortPrompt,
      prompt_type: e.promptKind || 'prompt',
      fiche: siExiste(`motion-library/prompts/${e.source}/${e.id}.md`),
      style: e.styleId || null,
      apercu: {
        mp4: siExiste(e.previewLocal) || siExiste(e.demoLocal),
        demo: siExiste(e.demoLocal) || siExiste(e.previewLocal),
        poster: siExiste(e.posterLocal),
        thumb: siExiste(e.thumbLocal),
        planche: siExiste(e.sheetLocal),
        live: live ? { src: live, w: e.live.w || 1920, h: e.live.h || 1080 } : null,
        distant: !e.previewLocal && !e.demoLocal && !live ? (e.preview || e.demo || null) : null,
      },
      epingle: false,
      note_epingle: '',
    };
  });
  appliquerEpingles(references, epingles);

  // les pépites, sources alternées pour ne pas voir onze styles maison d'affilée
  const pep = references.filter((r) => r.niveau === 'pepite');
  const parSrc = {};
  for (const r of pep) (parSrc[r.source] ||= []).push(r);
  const melange = [];
  const srcs = Object.keys(parSrc).sort((a, b) => (SRC_RANK[a] ?? 9) - (SRC_RANK[b] ?? 9));
  for (let i = 0; melange.length < pep.length; i++) for (const s of srcs) if (parSrc[s][i]) melange.push(parSrc[s][i]);

  const cats = lib.categories || {};
  const parUsage = {};
  for (const r of references) if (r.usage) (parUsage[r.usage] ||= []).push(r.id);
  const rangees = [{ id: 'pepites', nom: 'Les pépites', hint: `les ${pep.length} références les plus fortes, jugées en regardant chaque démo`, refs: melange.map((r) => r.id) }];
  for (const [u, ids] of Object.entries(parUsage).sort((a, b) => b[1].length - a[1].length)) {
    rangees.push({ id: u, nom: (cats[u] && cats[u].label) || u, hint: (cats[u] && cats[u].hint) || '', refs: ids });
  }

  const index = {
    schema: 1,
    genere_le: new Date().toISOString(),
    genere_par: 'scripts/construire-vitrine.mjs',
    duree_ms: Date.now() - t0,
    sources: Object.fromEntries(Object.entries(lib.sources || {}).map(([k, v]) => [k, { nom: SOURCES_FR[k] || v.label, label: v.label, url: v.url, total: v.count }])),
    usages: cats,
    effets: vocab.effets.map((e) => ({ id: e.id, nom: e.nom })),
    resume: { total: toutes.length, gardees: references.length, faibles: faibles.length, pepites: pep.length, epinglees: references.filter((r) => r.epingle).length, par_source: Object.fromEntries(Object.keys(SOURCES_FR).map((s) => [s, references.filter((r) => r.source === s).length])) },
    rangees,
    references,
    faibles: faibles.map((e) => ({ id: e.id, titre: e.titleFr || e.title, source: e.source, pourquoi: e.pourquoi || '' })),
  };
  return index;
}

/** Les techniques de l'analyse qu'aucune règle de mapping.techniques n'attrape : [[technique, n]]. */
export function diagnostiquerTechniques() {
  const lib = readJSONSafe(LIBRARY, 64 * 1024 * 1024) || { entries: [] };
  const mapping = lireMapping();
  const regles = (mapping.techniques || []).map((r) => rx(r.motif)).filter(Boolean);
  const inc = new Map();
  for (const e of lib.entries || []) for (const t of (e.mecanique && e.mecanique.techniques) || []) if (!regles.some((re) => re.test(t))) inc.set(t, (inc.get(t) || 0) + 1);
  return [...inc.entries()].sort((a, b) => b[1] - a[1]);
}

export function ecrireVitrine() {
  const index = construireVitrine();
  ecrireJSON(VITRINE_INDEX, index);
  return index;
}

/** Lu sur le disque (construit s'il manque), épingles du moment appliquées. */
export function lireVitrine() {
  let index = readJSONSafe(VITRINE_INDEX, 64 * 1024 * 1024);
  if (!index) index = ecrireVitrine();
  const ep = lireEpingles();
  appliquerEpingles(index.references, ep);
  // Un seul concept à l'écran : les favoris. Ce que Claude avait jugé le plus fort
  // (niveau « pepite ») y entre par défaut ; un retrait (epingle: false
  // dans donnees/epingles.json) l'en sort pour de bon.
  for (const r of index.references) {
    if (!ep.has(r.id) && r.niveau === 'pepite') { r.epingle = true; r.favori_par = 'claude'; }
    else if (r.epingle) r.favori_par = 'toi';
  }
  const favoris = index.references.filter((r) => r.epingle && r.source !== 'styles');
  favoris.sort((a, b) => (a.favori_par === 'toi' ? 0 : 1) - (b.favori_par === 'toi' ? 0 : 1));
  index.rangees = [{ id: 'favoris', nom: 'Mes favoris', hint: 'les tiens, et ceux que Claude a trouvés les plus forts en regardant chaque démo ; retire ce qui ne te parle pas', refs: favoris.map((r) => r.id) },
    ...index.rangees.filter((r) => r.id !== 'pepites')];
  index.resume.epinglees = favoris.length;
  return index;
}
