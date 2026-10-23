// Les catégories de la bibliothèque motion, communes à toutes les sources.
// On cherche une référence par ce qu'elle FAIT (« il me faut un lancement
// produit », « une typo cinétique »), pas par l'auteur qui l'a postée.
//
// Le classement des sources sans catégories (prompt-motion) se fait par mots-
// clés sur le titre et le prompt. C'est grossier mais vérifiable : chaque règle
// est une liste de motifs lisibles, et une entrée prend au plus 3 catégories.

export const CATEGORIES = {
  'produit-marque': { label: 'Lancement produit & SaaS', hint: 'Présenter une app, une feature, une marque : écrans réels, curseur, chiffres qui claquent.' },
  'ui': { label: 'UI & interfaces animées', hint: 'Interfaces rejouées, dashboards, glassmorphism, curseurs.' },
  'typo': { label: 'Typographie cinétique', hint: 'Le texte est le sujet : mots qui arrivent au rythme de la phrase.' },
  'data': { label: 'Data viz & chiffres', hint: 'Graphiques qui se construisent, compteurs, résultats.' },
  'explicatif': { label: 'Explicatif & documentaire', hint: 'Faire comprendre une idée, une histoire, un mécanisme.' },
  '3d': { label: '3D, matière & lumière', hint: 'Volume, chrome, verre, objets en rotation, caméra en profondeur.' },
  'graphique-2d': { label: 'Graphique 2D & formes', hint: 'Formes, illustration plate, isométrique, line art, liquide.' },
  'logo': { label: 'Logo & signatures', hint: 'Logo sting, intro de chaîne, fin de vidéo.' },
  'showreel': { label: 'Showreels & montages', hint: 'Enchaînements rapides de plans, portfolio, sizzle.' },
  'code': { label: 'Code & terminal', hint: 'Terminal qui tape, éditeur, démo développeur.' },
  'artisanal': { label: 'Texturé & artisanal', hint: 'Papier, collage, riso, stop motion, pâte à modeler.' },
  'retro': { label: 'Rétro & esthétiques', hint: 'VHS, pixel art, 70s, glitch, BD.' },
  'personnage': { label: 'Personnages & scènes', hint: 'Personnages animés, scènes illustrées, mini-films.' },
  'carte': { label: 'Cartes & géographie', hint: 'Globe, itinéraire, zoom sur un lieu.' },
  'generatif': { label: 'Génératif & abstrait', hint: 'Particules, shaders, motifs procéduraux, simulations.' },
};

const RULES = [
  ['produit-marque', /\b(saas|product (launch|video|demo|promo|reveal)|launch (video|film)|promo|landing|feature|app (demo|promo)|startup|brand (film|video)|commercial|ad\b|advert|keynote|lancement|produit)/i],
  ['ui', /\b(ui|ux|interface|dashboard|glassmorph|cursor|screen ?recording|web ?page|website|mockup|iphone|mobile app|onboarding)\b/i],
  ['typo', /\b(kinetic|typograph|typo|text animation|word[- ]by[- ]word|lyric|quote|manifesto|title card)/i],
  ['data', /\b(chart|graph|data ?vi[sz]|stat(s|istic)?|counter|count[- ]?up|metric|numbers?|infographic|stock|crypto price|bar race|kpi)\b/i],
  ['explicatif', /\b(explain|explainer|educational|documentary|how .* works|tutorial|lesson|vox|kurzgesagt|whiteboard|history of|concept)\b/i],
  ['3d', /\b(3d|three\.?js|webgl|chrome|glass|metallic|isometric|blender|render(ed)? in 3|depth|orbit|rotat(e|ing) (the )?(product|object|model))/i],
  ['logo', /\b(logo|sting|intro sequence|outro|ident|brand reveal|lockup)\b/i],
  ['showreel', /\b(showreel|sizzle|montage|portfolio)\b/i],
  ['code', /\b(terminal|code editor|coding|cli\b|command line|developer|vs ?code|github|changelog|syntax)/i],
  ['artisanal', /\b(paper|collage|riso|halftone|stop[- ]?motion|clay|hand[- ]?drawn|sketch|watercolou?r|ink)\b/i],
  ['retro', /\b(retro|vhs|synthwave|pixel|8[- ]?bit|16[- ]?bit|70s|80s|90s|glitch|brutalis|comic|arcade|crt|vintage)\b/i],
  ['personnage', /\b(character|samurai|wizard|robot|mascot|cat|dog|person|story|scene|cinematic|anime|fight|kata)\b/i],
  ['carte', /\b(map|globe|world|route|itinerary|geograph|country|countries|earth)\b/i],
  ['generatif', /\b(particle|shader|generative|procedural|fractal|noise|fluid|simulation|abstract|physics|flow ?field|voronoi|boids)\b/i],
  ['graphique-2d', /\b(flat|2d|shapes?|geometric|bauhaus|swiss|line art|liquid|morph|illustrat\w*)\b/i],
];

export function categorize(s) {
  const hits = [];
  for (const [cat, re] of RULES) {
    const m = s.match(new RegExp(re.source, 'gi'));
    if (m) hits.push([cat, m.length]);
  }
  // le plus cité d'abord, à égalité l'ordre des règles (du plus spécifique au plus large)
  return hits.sort((a, b) => b[1] - a[1]).map((h) => h[0]);
}

export function techOf(s) {
  if (/hyper ?frames/i.test(s)) return 'hyperframes';
  if (/remotion/i.test(s)) return 'remotion';
  if (/three\.?js|webgl|r3f/i.test(s)) return 'three.js';
  if (/\bp5(\.js)?\b|canvas api|<canvas/i.test(s)) return 'canvas';
  if (/manim/i.test(s)) return 'manim';
  if (/after effects/i.test(s)) return 'after-effects';
  if (/\bhtml\b|css|gsap|svg/i.test(s)) return 'html';
  return 'non précisé';
}
