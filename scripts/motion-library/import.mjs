#!/usr/bin/env node
// Importe des références de motion design (démo + prompt) dans motion-library/.
//
//   npm run motion:import                       # toutes les sources
//   npm run motion:import -- --source pocinho   # une seule
//   npm run motion:import -- --download         # rapatrie aussi les vidéos et posters
//
// Chaque source est un module qui rend une liste d'entrées au même format. Ajouter
// une source = ajouter une fonction dans SOURCES, rien d'autre. Les entrées des
// sources non relancées sont conservées telles quelles.
//
// Sorties (toutes régénérables) :
//   motion-library/library.json            la base, lue par le dashboard
//   motion-library/prompts/<source>/<id>.md un prompt par fichier, pour les agents
//   motion-library/INDEX.md                le catalogue lisible, groupé par catégorie
//   motion-library/media/<source>/…        seulement avec --download (gitignoré)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, categorize, techOf } from './categories.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LIB = path.join(ROOT, 'motion-library');
const DB = path.join(LIB, 'library.json');

const args = process.argv.slice(2);
const only = args.includes('--source') ? args[args.indexOf('--source') + 1] : null;
const download = args.includes('--download');

const UA = { 'user-agent': 'EditingOS-motion-library/1.0 (usage personnel, référence)' };

async function get(url, tries = 3) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
      return r;
    } catch (e) {
      if (i >= tries - 1) throw e;
      await new Promise((ok) => setTimeout(ok, 800 * (i + 1)));
    }
  }
}
const text = async (u) => (await get(u)).text();

// petite file : N requêtes à la fois, pas plus — on reste poli avec les sites
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

const decode = (s) => s
  .replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d));
const strip = (s) => decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
// Source 1 — julienpocinho.fr/motion : 30 styles, démo 15 s + prompt HyperFrames
// ---------------------------------------------------------------------------
const POCINHO_FAMILY = {
  'Explicatif et documentaire': 'explicatif',
  'Graphique 2D': 'graphique-2d',
  'Texturé et artisanal': 'artisanal',
  '3D': '3d',
  'Produit et marque': 'produit-marque',
  'Rétro et esthétiques': 'retro',
};

async function pocinho() {
  const base = 'https://julienpocinho.fr';
  const html = await text(base + '/motion');
  const entries = [];
  // les familles sont des <section> titrées par un <h2> ; on découpe par section
  const sections = html.split(/<section\b/).slice(1);
  for (const sec of sections) {
    const h2 = /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(sec);
    const famille = h2 ? strip(h2[1]) : '';
    const cards = sec.split(/<article class="carte"/).slice(1);
    for (const c of cards) {
      const id = /data-id="([^"]+)"/.exec(c)?.[1];
      if (!id) continue;
      const pick = (re) => { const m = re.exec(c); return m ? strip(m[1]) : ''; };
      const dd = {};
      for (const m of c.matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)) dd[strip(m[1])] = strip(m[2]);
      // le panneau du style (direction + prompt) vit ailleurs dans la page
      const pi = html.indexOf(`id="panneau-${id}"`);
      const panel = pi === -1 ? '' : html.slice(pi, pi + 40000);
      const pre = /<pre[^>]*class="prompt"[^>]*>([\s\S]*?)<\/pre>/.exec(panel);
      const prompt = pre ? decode(pre[1].replace(/<[^>]+>/g, '')).trim() : '';
      const demo = /data-src="([^"]+\.mp4)"/.exec(c)?.[1];
      const poster = /<img src="([^"]+)"/.exec(c)?.[1];
      const nom = pick(/<h3[^>]*>([\s\S]*?)<\/h3>/);
      const alias = pick(/class="carte__alias">([\s\S]*?)<\/p>/);
      const ligne = pick(/class="carte__ligne">([\s\S]*?)<\/p>/);
      const fam = POCINHO_FAMILY[famille] || null;
      entries.push({
        id: `pocinho-${id}`,
        source: 'pocinho',
        title: nom,
        alias,
        summary: ligne,
        family: famille,
        categories: [...new Set([fam, ...categorize(`${nom} ${alias} ${ligne}`)].filter(Boolean))].slice(0, 2),
        tech: 'hyperframes',
        format: /data-format="([^"]+)"/.exec(c)?.[1] || '16:9',
        duration: 15,
        difficulty: pick(/class="niveau__bouton"[^>]*>[\s\S]*?Rendu HTML(?:&nbsp;|\s)*:\s*([\s\S]*?)<\/button>/),
        difficultyNote: pick(/class="niveau__bulle"[^>]*>([\s\S]*?)<\/p>/),
        idealFor: dd['Idéal pour'] || '',
        toProvide: dd['À fournir'] || '',
        promptKind: 'prompt',
        prompt,
        author: 'Julien Pocinho',
        url: `${base}/motion#${id}`,
        demo: demo ? base + demo : null,
        poster: poster ? new URL(poster, base).href : null,
      });
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Source 2 — prompt-motion.com : galerie de vidéos faites avec Claude, prompt ou skill
// ---------------------------------------------------------------------------
// Le site est en Next.js : le contenu voyage dans des chunks self.__next_f.push.
function rsc(html) {
  let out = '';
  for (const m of html.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g)) {
    try { const a = JSON.parse(m[1]); if (typeof a[1] === 'string') out += a[1]; } catch { /* chunk binaire */ }
  }
  return out;
}

// Un long texte n'est pas en ligne : la valeur vaut "$27" et renvoie à une
// ligne « 27:T<longueur hexa en octets>,<texte> » plus loin dans le flux.
function resolveRef(stream, v) {
  const m = /^\$([0-9a-f]+)$/.exec(v);
  if (!m) return v;
  const head = new RegExp(`(?:^|\\n)${m[1]}:T([0-9a-f]+),`).exec(stream);
  if (!head) return v;
  const buf = Buffer.from(stream.slice(head.index + head[0].length), 'utf8');
  return buf.subarray(0, parseInt(head[1], 16)).toString('utf8');
}

async function promptMotion() {
  const base = 'https://www.prompt-motion.com';
  const idx = rsc(await text(base + '/'));
  const items = [];
  const seen = new Set();
  // Motif souple : le 08/10 le site a glissé un champ « video » entre « preview »
  // et « width », et l'ancien motif, qui les voulait collés, ne trouvait plus rien.
  // Les objets « posters » (slug, poster, sans titre) sont écartés par le "title".
  for (const m of idx.matchAll(/\{"slug":"[^"]+","title":[^{}]*?"preview":"[^"]+"[^{}]*?"height":\d+\}/g)) {
    const it = JSON.parse(m[0]);
    if (!seen.has(it.slug)) { seen.add(it.slug); items.push(it); }
  }
  let done = 0;
  const entries = await pool(items, 4, async (it) => {
    let video = it.video || null;
    let prompt = '', kind = it.tags.includes('prompt') ? 'prompt' : 'skill', post = null, repo = null, install = null, skillDesc = '';
    try {
      const d = rsc(await text(`${base}/${it.slug}`));
      // la vidéo complète n'est que sur la page détail ; l'index ne donne qu'un aperçu de 4 s
      video = /https:\/\/media\.prompt-motion\.com\/[^"\\ ]+\/video\.[0-9a-f]+\.mp4/.exec(d)?.[0] || video;
      const pi = d.indexOf('"children":"Prompt"}');
      if (pi !== -1) {
        const t = /"text":("(?:[^"\\]|\\.)*")/.exec(d.slice(pi, pi + 200000));
        if (t) prompt = resolveRef(d, JSON.parse(t[1]));
      }
      const si = d.indexOf('"children":"Skill"}');
      if (si !== -1) {
        const seg = d.slice(si, si + 6000);
        skillDesc = /"children":("(?:[^"\\]|\\.)*")/.exec(seg.slice(20)) ? JSON.parse(/"children":("(?:[^"\\]|\\.)*")/.exec(seg.slice(20))[1]) : '';
        const ins = /"text":("(?:[^"\\]|\\.)*"),"label":"Copy install command"/.exec(seg);
        if (ins) install = JSON.parse(ins[1]);
        repo = /"href":"(https:\/\/github\.com\/[^"]+)"/.exec(seg)?.[1] || null;
      }
      post = new RegExp(`"href":"(https://(?:x|twitter)\\.com/${it.handle}/status/\\d+)"`, 'i').exec(d)?.[1]
        || /"href":"(https:\/\/(?:x|twitter)\.com\/[^"/]+\/status\/\d+)"/.exec(d)?.[1] || null;
    } catch (e) {
      console.warn(`  ! ${it.slug} : ${e.message}`);
    }
    if (++done % 25 === 0) console.log(`  prompt-motion ${done}/${items.length}`);
    const body = prompt || [skillDesc, install && `Installation : ${install}`, repo && `Repo : ${repo}`].filter(Boolean).join('\n\n');
    const w = it.width, h = it.height;
    return {
      id: `pm-${it.slug}`,
      source: 'prompt-motion',
      title: it.title,
      alias: `@${it.handle}`,
      summary: (prompt || skillDesc).split('\n').find((l) => l.trim())?.slice(0, 220) || '',
      family: null,
      // le titre d'abord : beaucoup de prompts reprennent la même consigne virale
      // (« a dynamic 15-second motion graphics video… like a showreel »), qui
      // classerait tout en showreel si on lui donnait le même poids
      categories: [...new Set([...categorize(it.title), ...categorize(body.slice(0, 1500))])].slice(0, 3),
      tech: techOf(body),
      format: h > w * 1.2 ? '9:16' : Math.abs(w - h) < w * 0.1 ? '1:1' : '16:9',
      duration: null,
      difficulty: null,
      idealFor: '',
      toProvide: '',
      promptKind: prompt ? 'prompt' : kind,
      prompt: body,
      skill: install || repo ? { install, repo } : null,
      author: `@${it.handle}`,
      url: post || `${base}/${it.slug}`,
      page: `${base}/${it.slug}`,
      demo: video || it.preview,
      preview: it.preview,
      poster: it.poster,
      width: w,
      height: h,
    };
  });
  return entries;
}

// ---------------------------------------------------------------------------
// Source 3 — les styles de style-library/ (sauf la charte maison, qui n'est pas
// une référence parmi d'autres : elle vit dans « Ma bibliothèque »). Locale, sans
// réseau. Le « prompt » d'un style, c'est son DESIGN.md : c'est ce qu'on donne à
// Claude pour composer dans ce style. Pas de vidéo : l'aperçu est la première
// carte du style, jouée en direct.
const HOUSE_STYLE = 'maison';
// 11 styles : les classer à la main est plus juste que par mots-clés
const STYLE_CATS = {
  'vox-explainer': ['explicatif', 'artisanal'],
  'kallaway': ['explicatif', 'ui', '3d'],
  'keynote-minimal': ['produit-marque', 'typo', '3d'],
  'harris-atlas': ['carte', 'explicatif'],
  'fireship-terminal': ['code', 'typo'],
  'bloomberg-data': ['data'],
  'abram-optimist': ['explicatif', 'typo'],
  'higgsfield': ['ui', 'typo'],
  'dankieft': ['ui', '3d'],
  'nathan-hodgson': ['ui', 'typo'],
  'nick-saraev': ['ui', 'typo'],
};

function cardDims(abs) {
  try {
    const head = fs.readFileSync(abs, 'utf8').slice(0, 6000);
    const w = +(/data-width="(\d+)"/.exec(head)?.[1] || 1920);
    const h = +(/data-height="(\d+)"/.exec(head)?.[1] || 1080);
    return { w, h };
  } catch { return { w: 1920, h: 1080 }; }
}

async function styles() {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'style-library', 'registry.json'), 'utf8'));
  return reg.styles.filter((s) => s.id !== HOUSE_STYLE).map((s) => {
    const card = s.cards.find((c) => c.tier === 'tier1') || s.cards[0];
    const { w, h } = card ? cardDims(path.join(ROOT, 'style-library', card.file)) : { w: 1920, h: 1080 };
    const design = path.join(ROOT, 'style-library', s.folder, 'DESIGN.md');
    const prompt = fs.existsSync(design) ? fs.readFileSync(design, 'utf8').trim() : s.inspiration || '';
    const insp = (s.inspiration || '').replace(/\s+/g, ' ').trim();
    return {
      id: `style-${s.id}`,
      source: 'styles',
      title: s.name,
      alias: `style-library/${s.folder}`,
      summary: insp.split(/(?<=\.)\s/)[0].slice(0, 220),
      family: null,
      categories: STYLE_CATS[s.id] || categorize(`${s.name} ${insp}`).slice(0, 3),
      tech: 'hyperframes',
      format: h > w * 1.2 ? '9:16' : '16:9',
      duration: null,
      difficulty: null,
      idealFor: '',
      toProvide: '',
      promptKind: 'design',
      prompt,
      author: 'Editing OS',
      url: `#/style/${s.id}`,
      styleId: s.id,
      cardCount: s.cardCount,
      palette: s.palette || null,
      live: card ? { src: `style-library/${card.file}`, w, h } : null,
      demo: null,
      poster: null,
    };
  });
}

const SOURCES = {
  styles: { label: 'Styles Editing OS — la style-library du workspace', url: 'style-library/', run: styles },
  pocinho: { label: 'Julien Pocinho — Bibliothèque de styles motion', url: 'https://julienpocinho.fr/motion', run: pocinho },
  'prompt-motion': { label: 'Prompt Motion — galerie de vidéos faites avec Claude', url: 'https://www.prompt-motion.com/', run: promptMotion },
};

// ---------------------------------------------------------------------------
// Médias (optionnel) : on rapatrie la démo et le poster à côté de la base,
// pour que le monteur puisse en extraire des images sans réseau.
async function fetchMedia(e) {
  const dir = path.join(LIB, 'media', e.source);
  fs.mkdirSync(dir, { recursive: true });
  for (const [key, url] of [['demo', e.demo], ['preview', e.preview], ['poster', e.poster]]) {
    if (!url) continue;
    // la vidéo complète d'une galerie (~16 Mo pièce, 3,5 Go pour Prompt Motion)
    // reste en ligne : on garde l'aperçu court pour le survol, et les images
    // d'analyse se tirent directement de l'URL (scripts/motion-library/frames.mjs)
    if (key === 'demo' && e.preview) continue;
    const ext = path.extname(new URL(url).pathname) || (key === 'demo' ? '.mp4' : '.webp');
    const rel = `media/${e.source}/${e.id}${key === 'demo' ? '' : '.' + key}${ext}`;
    const abs = path.join(LIB, rel);
    if (!fs.existsSync(abs)) {
      const buf = Buffer.from(await (await get(url)).arrayBuffer());
      fs.writeFileSync(abs, buf);
    }
    e[key + 'Local'] = `motion-library/${rel}`;
  }
}

// ---------------------------------------------------------------------------
function promptFile(e) {
  const meta = [
    `# ${e.titleFr || e.title}`,
    e.titleFr && e.titleFr !== e.title ? `\n_Titre d’origine : ${e.title}_` : null,
    '',
    `- **Source** : ${SOURCES[e.source]?.label || e.source} — ${e.author}`,
    e.styleId ? `- **Cartes** : ${e.cardCount}, dans \`${e.alias}/cards/\` — à voir dans le dashboard (\`${e.url}\`)` : `- **Lien** : ${e.url}`,
    e.demo && `- **Démo** : ${e.demoLocal || e.demo}`,
    `- **Catégories** : ${e.categories.map((c) => CATEGORIES[c]?.label || c).join(', ') || '—'}`,
    `- **Format** : ${e.format}${e.duration ? ` · ${e.duration} s` : ''} · **Techno** : ${e.tech}`,
    e.difficulty && `- **Difficulté de rendu HTML** : ${e.difficulty}${e.difficultyNote ? ` — ${e.difficultyNote}` : ''}`,
    e.idealFor && `- **Idéal pour** : ${e.idealFor}`,
    e.toProvide && `- **À fournir** : ${e.toProvide}`,
    e.niveau && `- **Niveau** : ${{ pepite: 'pépite', solide: 'solide', faible: 'faible' }[e.niveau]}${e.pourquoi ? ` — ${e.pourquoi}` : ''}`,
    e.sheetLocal && `- **Planche (12 images)** : ${e.sheetLocal}`,
    (e.resume || e.summary) && `\n> ${e.resume || e.summary}`,
    e.mecanique && '\n## Mécanique — ce qu’on peut reprendre\n',
    e.mecanique && `- **Transitions** : ${e.mecanique.transitions}`,
    e.mecanique && `- **Rythme** : ${e.mecanique.rythme}`,
    e.mecanique && `- **Texte** : ${e.mecanique.texte}`,
    e.mecanique && `- **Techniques** : ${e.mecanique.techniques.join(', ')}`,
    e.genericPrompt && '\n_Prompt générique (la consigne virale « montre quel motion designer tu es ») : il ne décrit pas cette vidéo, c’est la planche et la démo qu’il faut regarder._',
    e.shortPrompt && '\n_Prompt très court : l’essentiel est dans la vidéo, pas dans le texte._',
    '\n',
    `## ${e.promptKind === 'skill' ? 'Skill' : e.promptKind === 'design' ? `DESIGN.md (${e.alias})` : 'Prompt'}`,
    '',
    '```text',
    e.prompt || '(prompt non publié)',
    '```',
    '',
  ];
  return meta.filter((l) => l !== null && l !== undefined && l !== false && l !== '').join('\n')
    .replace(/\n## /, '\n\n## ').replace(/\n```text/, '\n\n```text');
}

function indexLine(e) {
  const star = e.niveau === 'pepite' ? '★ ' : '';
  const what = e.resume || e.summary || '';
  const tech = e.mecanique ? ` — _${e.mecanique.techniques.slice(0, 3).join(', ')}_` : '';
  return `- ${star}[${e.titleFr || e.title}](prompts/${e.source}/${e.id}.md) — ${e.author}, ${e.format}${what ? ` · ${what.slice(0, 120)}` : ''}${tech}`;
}

function indexMd(lib) {
  const by = {};
  for (const e of lib.entries) for (const c of (e.categories.length ? e.categories : ['autre'])) (by[c] = by[c] || []).push(e);
  const order = [...Object.keys(CATEGORIES), 'autre'].filter((c) => by[c]);
  const lines = [
    '# Bibliothèque motion — index',
    '',
    `Généré par \`npm run motion:import\` le ${lib.updated.slice(0, 10)}. Ne pas éditer à la main.`,
    `${lib.entries.length} références : ${Object.entries(lib.sources).map(([k, s]) => `${s.count} ${k}`).join(', ')}.`,
    '',
    'Chaque ligne renvoie à sa fiche dans `prompts/` (ce qu’on voit, la mécanique à reprendre, le prompt). ★ = pépite : à regarder en premier.',
    'Les **styles** (style-library) et les **pocinho** sont écrits pour HyperFrames : ce sont les plus directement réutilisables.',
    'Ce que le créateur a choisi est dans `../ma-bibliotheque/SELECTION.md` : le lire AVANT cet index.',
    '',
  ];
  for (const c of order) {
    lines.push(`## ${CATEGORIES[c]?.label || 'Autre'}`, '');
    if (CATEGORIES[c]?.hint) lines.push(`_${CATEGORIES[c].hint}_`, '');
    // une entrée n'apparaît que sous sa catégorie principale : l'index se lit
    // d'un trait, sans doublons ; les faibles sont listés à part, en fin
    for (const e of by[c].filter((x) => x.niveau !== 'faible' && (x.categories[0] || 'autre') === c)) lines.push(indexLine(e));
    lines.push('');
  }
  const weak = lib.entries.filter((e) => e.niveau === 'faible');
  if (weak.length) {
    lines.push('## À éviter comme référence', '', '_Jugées faibles en regardant la démo : génériques, quasi statiques ou brouillonnes._', '');
    for (const e of weak) lines.push(indexLine(e));
    lines.push('');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
async function main() {
  const prev = fs.existsSync(DB) ? JSON.parse(fs.readFileSync(DB, 'utf8')) : { entries: [], sources: {} };
  const names = only ? [only] : Object.keys(SOURCES);
  for (const n of names) if (!SOURCES[n]) throw new Error(`source inconnue : ${n} (connues : ${Object.keys(SOURCES).join(', ')})`);

  let entries = prev.entries.filter((e) => !names.includes(e.source));
  const sources = { ...prev.sources };
  for (const n of names) {
    console.log(`→ ${n}`);
    const got = await SOURCES[n].run();
    console.log(`  ${got.length} entrées, ${got.filter((e) => e.prompt).length} avec prompt`);
    // Une source muette ne doit ni effacer ce qu'on avait d'elle, ni bloquer les
    // autres : sur une installation neuve, une seule page changée laissait
    // Explorer entièrement vide.
    if (!got.length) {
      const kept = prev.entries.filter((e) => e.source === n);
      console.warn(`  ⚠ ${n} n'a rien rendu (la page a probablement changé) : ${kept.length} entrées précédentes gardées`);
      entries = entries.concat(kept);
      continue;
    }
    entries = entries.concat(got);
    sources[n] = { label: SOURCES[n].label, url: SOURCES[n].url, count: got.length, fetched: new Date().toISOString() };
  }

  // ordre stable : les sources dans l'ordre de SOURCES (pocinho d'abord, ses
  // prompts sont écrits pour HyperFrames), puis l'ordre de chaque galerie
  const rank = Object.keys(SOURCES);
  entries.sort((a, b) => rank.indexOf(a.source) - rank.indexOf(b.source));

  if (download) {
    console.log('→ médias');
    let k = 0;
    await pool(entries, 4, async (e) => {
      try { await fetchMedia(e); } catch (err) { console.warn(`  ! ${e.id} : ${err.message}`); }
      if (++k % 25 === 0) console.log(`  ${k}/${entries.length}`);
    });
  } else {
    // les médias déjà rapatriés restent référencés
    for (const e of entries) {
      for (const key of ['demo', 'preview', 'poster']) {
        const loc = key + 'Local';
        if (!e[key]) continue;
        const ext = path.extname(new URL(e[key]).pathname);
        const rel = `media/${e.source}/${e.id}${key === 'demo' ? '' : '.' + key}${ext}`;
        if (fs.existsSync(path.join(LIB, rel))) e[loc] = `motion-library/${rel}`;
      }
    }
  }

  // l'analyse (ce qu'on voit, la mécanique, le niveau) vient de motion-library/
  // analyse.json : écrite en regardant chaque démo, elle n'est jamais regénérée
  // ici. Une entrée sans analyse garde ses catégories par mots-clés.
  const ANALYSE = fs.existsSync(path.join(LIB, 'analyse.json'))
    ? JSON.parse(fs.readFileSync(path.join(LIB, 'analyse.json'), 'utf8')) : {};
  for (const e of entries) {
    for (const [key, suffix] of [['thumbLocal', 'thumb'], ['sheetLocal', 'sheet']]) {
      const rel = `media/${e.source}/${e.id}.${suffix}.jpg`;
      if (fs.existsSync(path.join(LIB, rel))) e[key] = `motion-library/${rel}`;
      else delete e[key];
    }
    // un prompt viral recopié tel quel, ou trop court, n'apprend rien : c'est
    // la vidéo qu'il faut regarder
    e.genericPrompt = e.source === 'prompt-motion' && /what an incredible motion designer you are/i.test(e.prompt);
    e.shortPrompt = e.source === 'prompt-motion' && !e.genericPrompt && e.prompt.length < 200;
    const a = ANALYSE[e.id];
    if (!a) { e.niveau = null; continue; }
    // les styles nommés (Pocinho, style-library) gardent leur nom : c'est leur identité
    e.titleFr = e.source === 'prompt-motion' ? a.titre : e.title;
    e.resume = a.resume;
    e.categories = [a.usage, ...(a.usages || [])].filter((c, i, l) => CATEGORIES[c] && l.indexOf(c) === i);
    e.ambiance = a.ambiance;
    e.mecanique = a.mecanique;
    e.niveau = a.niveau;
    e.pourquoi = a.pourquoi;
  }
  // dans chaque galerie : les pépites d'abord, les faibles à la fin
  const NIV = { pepite: 0, solide: 1, faible: 2 };
  entries.sort((a, b) => rank.indexOf(a.source) - rank.indexOf(b.source)
    || (NIV[a.niveau] ?? 1) - (NIV[b.niveau] ?? 1));

  const lib = {
    generated_by: 'scripts/motion-library/import.mjs',
    updated: new Date().toISOString(),
    categories: CATEGORIES,
    sources,
    entries,
  };
  fs.mkdirSync(LIB, { recursive: true });
  fs.writeFileSync(DB, JSON.stringify(lib, null, 1));
  for (const e of entries) {
    const dir = path.join(LIB, 'prompts', e.source);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${e.id}.md`), promptFile(e));
  }
  fs.writeFileSync(path.join(LIB, 'INDEX.md'), indexMd(lib));
  // la sélection reprend les titres et la mécanique à jour
  if (fs.existsSync(path.join(ROOT, 'ma-bibliotheque', 'selection.json'))) {
    const { refreshSelection } = await import('../../editing-os/lib/selection.mjs');
    refreshSelection(ROOT);
  }
  console.log(`✓ ${entries.length} références dans motion-library/`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
