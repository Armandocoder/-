# Editing OS — Workspace Guide

A modular agent pipeline that turns a raw talking-head recording into a polished,
human-feeling edit. Built on [HyperFrames](https://hyperframes.heygen.com) (HTML-native
video, **not** Remotion).

Everything here is transcript-driven. A word-level transcript is produced once, and every
downstream decision (what to cut, where a motion-graphic beat lands, when b-roll enters)
is timed off those word timestamps. That is why the edits feel hand-made instead of
volume-gated.

## Les formats standard (à lire avant PROCESS.md)

**`formats/`** contient les trois formats de reel standardisés le 18/08 depuis les 6
reels publiés : `01-split-carte` (défaut), `02-avant-apres`,
`03-recreer-viral`. Chaque spec porte la géométrie canonique, la structure timecodée,
la place du CTA et une checklist ; les chiffres sont prouvés dans `formats/MESURES.md`.
Les squelettes clonables vivent dans `style-templates/reel-0*` et le skill
**`reel-format`** choisit le format puis instancie le projet. Un nouveau reel commence
par `reel-format`, puis suit `PROCESS.md` normalement.

## Le process de référence

**`PROCESS.md` est la recette complète d'un reel** (validée le 17/08 sur 17
versions) : préparation, montage parole (transcript puis décibel), direction artistique (`design-beats`), composition,
vérification (autoverify + master -14 LUFS), boucle de review. À lire avant de
démarrer toute nouvelle vidéo courte.

## The pipeline

Five agents, each a self-contained skill under `.claude/skills/`, run in order:

| # | Agent | Skill | What it does |
| --- | --- | --- | --- |
| 1 | **Snip** | `cut-silences` | Trims pauses and dead air off the word timestamps |
| 2 | **Redo** | `cut-mistakes` | Removes stutters, false starts, repeats, and retakes |
| 2.5 | **Vera** | `verify-cuts` | Re-transcribes the render and proves every cut landed |
| 3 | **Mo** | `motion-graphics` | Adds tiered motion-graphic cards from the style library |
| 4 | **Scout** | `insert-broll` | Adds cutaways, screenshots, logos, and stock footage |

Agents 1, 2, and 4 are **review-gated**: they propose every change with context and a
reason, you approve, and only then does anything get rendered.

**Stage 4 of `cut-mistakes` is the part people miss.** After the first verified render it
re-transcribes and reads the whole fresh transcript editorially, piecing together the best
take of every re-recorded sentence. The mechanical detector alone catches a small fraction
of real retakes. If you re-record lines while shooting, this is the step that saves you.

**`verify-cuts` is the trust step.** It never edits video. It re-transcribes the rendered
file and makes at least three full passes (silence sweep, cuts sweep, ledger sweep). PASS
is the precondition for motion graphics and b-roll. Failures route back to agents 1 and 2.

## Le hub Editing OS (V3)

`npm run os` lance le hub sur **http://localhost:4200** (serveur `hub/server.mjs`, Node
pur, aucune dépendance). Principe : **le disque déclare, l'écran lit**. Trois onglets, le
même menu partout :

- **Projets** : un projet par tournage (un dossier de `video-projects/`), ses vidéos (les
  livrables) et leur état. `à relire`, `retours chez Claude`, `en montage`, `à monter` se
  lisent sur le disque ; `validé`, `publié`, `abandonné` se déclarent (bouton du hub, ou toi,
  Claude, quand l'utilisateur dit « c'est good » : `node scripts/livrable.mjs <projet> <livrable> valider`).
  La déclaration de chaque projet vit dans `donnees/tournages/<projet>.json`.
- **Ma DA** : ce qu'on monte, en trois sous-onglets.
  - *Mon style* : `donnees/charte.json` (couleurs, polices, registres, règles). C'est un
    exemple de départ : le remplacer par la charte de l'utilisateur.
  - *Mes animations* : les cartes du style maison (`style-library/10-maison`) et celles
    adoptées depuis l'inspiration (`donnees/ma-charte.json`), rangées en six familles
    (Textes, Caméra, Compositions, Graphismes, Interfaces, Médias) puis 16 types d'effets.
    En tête, « Dans mes vidéos » : des extraits réels de ses vidéos publiées.
  - *Mes formats* : la mémoire de composition, `donnees/compositions.json`.
- **Inspiration** : *Montage* (les autres styles de la style-library, à regarder pour la
  mécanique et à refaire dans la charte, jamais à monter tels quels) et *Motion design*
  (la bibliothèque motion, après `npm run motion:import` puis `npm run vitrine`).

**La review** (`/review.html?project=<dossier>&render=renders/x.mp4`, ouverte depuis un
projet) : vidéo en pleine hauteur, retours horodatés à droite, dessin sur l'image, plages,
repères, pièce jointe. Les retours s'écrivent dans `video-projects/<dossier>/review/` ;
quand un retour porte un `dessin` (PNG dans `review/`), le regarder avant de l'appliquer.

### Règles pour Claude

- **On ne retagge jamais les effets à la main.** Une carte mal classée, c'est une règle dans
  `donnees/effets/mapping.json`, puis `npm run effets`. `index.json` et `INDEX.md` sont des sorties.
- **Avant de proposer un storyboard** (skill `design-beats`), lire `donnees/effets/INDEX.md` :
  d'abord « Ma DA », puis « Ma DA en situation », l'inspiration seulement s'il manque une mécanique.
- **Après chaque vidéo publiée**, relever ses animations marquantes dans
  `donnees/exemples/exemples.json` (vidéo, début, fin, famille, effet, ce qu'on voit, comment
  c'est fait ; `court: true` sur la vidéo pour un reel) puis `npm run exemples`.
- Quand l'utilisateur dit « ça, je le veux dans ma DA », écrire `donnees/ma-charte.json`
  (ou `POST /api/ma-charte`), avec sa phrase en note.
- Le contrat complet des routes et des fichiers : `hub/CONTRAT.md`.

## Setup

**Prerequisites:** Node 20+, FFmpeg, Chrome, and whisper-cpp. Run `npx hyperframes doctor`
to check them at once.

```bash
npm install
brew install whisper-cpp  # local transcription (no API key)
cp .env.example .env      # optional keys only
npx hyperframes doctor
npm run os                # confirm the dashboard comes up on :4200
```

**No API key is required.** Transcription runs locally via whisper.cpp; the model downloads
itself to `models/` on first use. Every key in `.env` is optional: `ELEVENLABS_API_KEY`
only enables the hosted transcriber fallback, and Pexels / Pixabay / Unsplash only affect
`insert-broll`'s ability to fetch new stock footage from the web.

## Workspace layout

```
.
├── CLAUDE.md, MOTION_PHILOSOPHY.md   ← workspace docs
├── .claude/skills/                   ← the agents (pipeline + hyperframes + gsap)
├── hub/                              ← le hub (npm run os), contrat dans hub/CONTRAT.md
├── donnees/                          ← ce que le hub déclare : projets, charte, formats, effets, exemples
├── scripts/                          ← transcribe, validate, preflight
├── style-library/                    ← 8 motion-graphic card styles
├── motion-library/                   ← Explorer : ~270 exemples, démo + prompt (npm run motion:import)
├── ma-bibliotheque/                  ← la sélection (SELECTION.md, lu avant de composer)
├── style-templates/                  ← reusable look templates for new projects
├── asset-library/                    ← b-roll / logo / screenshot database
└── video-projects/<slug>/            ← one self-contained folder per video
```

Each project under `video-projects/<slug>/` is self-contained: `index.html` (root
composition), `compositions/` (sub-comps), `assets/`, `renders/` (gitignored),
`hyperframes.json`, `meta.json`.

**Always run the HyperFrames CLI from inside the project folder** — it resolves `assets/`,
`compositions/`, and `renders/` relative to the current working directory.

### Adding a new video project

1. `mkdir video-projects/<slug>` (kebab-case)
2. `cd video-projects/<slug>`
3. `npx hyperframes init`, or copy `hyperframes.json` / `meta.json` from
   `style-templates/<look>/` and edit `meta.json`
4. Build the composition, then lint and render from inside this folder

Name folders **date first** (convention de nommage, 17/08) : `AA-MM-JJ-sujet-en-kebab`,
ex. `26-08-17-montage-video-par-ia`. La date permet de les retrouver ; le kebab-case
reste obligatoire pour la CLI et le dashboard.

## MOTION_PHILOSOPHY.md — read before any creative session

`MOTION_PHILOSOPHY.md` is the canonical motion-graphics aesthetic, deconstructed from a
reference spot. Read it in full at the start of any creative session (composition, scene,
storyboard, palette, transitions, kinetic typography, logo reveal). Re-read section 0 (the
11 Laws) and section 4 (pre-flight checklist) every iteration, and run the pre-flight
checklist before calling any motion piece done.

Defaults: ~1.5s average scene length, black canvas with perspective grid and vignette,
chrome-gradient text with halo glow, motion-blurred whip transitions (never hard cuts),
5 or fewer symbolic colors, 4 to 6s outro hold, rule of threes. When a brand brief demands
a different look, keep the *discipline* (one idea per beat, motion in the transitions,
breathing outros, callbacks) and adapt the palette and texture.

## Skills — invoke these first

Always invoke the matching skill before writing or modifying compositions. Skills encode
framework-specific patterns (`window.__timelines` registration, `data-*` attribute
semantics, shader-compatible CSS, relative-timing syntax) that are **not** in generic web
docs. Skipping them produces broken compositions.

| Skill | When to use |
| --- | --- |
| `design-beats` | AVANT toute composition de reel : écoute le transcript et propose un storyboard d'animations avancées quasi chaque seconde (le designer) |
| `hyperframes` | Authoring compositions, captions, TTS, audio-reactive animation, transitions |
| `hyperframes-cli` | CLI: `init`, `add`, `lint`, `preview`, `render`, `transcribe`, `tts`, `doctor` |
| `gsap` | GSAP animation: timelines, easing, stagger, plugins, performance |
| `hyperframes-registry` | Installing catalog blocks via `npx hyperframes add <name>` |
| `hyperframes-video-beats` | Planning tiered beats (paper takeover vs glass card) |
| `hyperframes-to-ae` | Exporting layered footage with alpha for After Effects |

## Commands

```bash
# Authoring loop (run from inside a project folder)
npx hyperframes preview                          # Studio + hot reload (port 3002)
npx hyperframes lint                             # static HTML check — always before rendering
npx hyperframes compositions                     # list comp IDs + resolved durations
npx hyperframes render --quality draft    --output renders/draft.mp4
npx hyperframes render --quality standard --output renders/final.mp4

# From the workspace root
node scripts/transcribe-whisper.mjs <video-or-audio>      # word timestamps → <stem>.json
npm run os                                                # the dashboard
npx hyperframes doctor                                    # env check
```

**Render flags:** `--quality draft|standard|high` (CRF 28/18/15) · `--fps 24|30|60` ·
`--format mp4|mov|webm` · `--gpu` · `--crf <n>` · `--video-bitrate 10M`.

On an M-series Mac, `--workers auto --browser-gpu --gpu` is dramatically faster.

## Render Contract (must-dos and must-not-dos)

1. Root `<div>` needs `id`, `data-composition-id`, `data-start="0"`, `data-width`, `data-height`.
2. Timed visible elements need `class="clip"` — **except** `<video>` and `<audio>` (adding
   `class="clip"` to a `<video>` breaks it).
3. Every timed element needs `data-start`, `data-duration`, `data-track-index`.
4. `data-start` can reference another clip's id: `data-start="intro + 2"`. Same-track clips
   cannot overlap — use different `data-track-index`.
5. `<video>` must be `muted`; audio belongs in a sibling `<audio>` for the mixer. Set
   `data-has-audio="true"` only when the video's own audio feeds the mix.
6. Every composition registers exactly one GSAP timeline, paused, on
   `window.__timelines["<data-composition-id>"]`. The key must match `data-composition-id` exactly.
7. Composition duration = `tl.duration()`. Pad with `tl.set({}, {}, <seconds>)` to extend.
8. Never call `.play()` / `.pause()` or set `.currentTime` on media — the framework owns playback.
9. Never animate `width` / `height` / `top` / `left` on a `<video>` — wrap it in a `<div>`
   and animate the wrapper.
10. Sub-compositions use `<template>` + `data-composition-src`; their timelines auto-link
    to the parent.
11. Determinism: no `Date.now()`, no unseeded `Math.random()`, no render-time network
    fetches. Use seeded PRNGs.

## Authoring loop (with mandatory gates)

1. Read `MOTION_PHILOSOPHY.md` if you haven't this session.
2. Invoke the matching skill before editing.
3. Edit `index.html` or `compositions/<name>.html`.
4. **Gate 0 — transcript-sync validator** (projects with `assets/transcript.json` + beat
   chains): `node scripts/validate-beat-sync.mjs` must exit 0. Every beat carries
   `data-anchor="<verbatim phrase>"`; the validator enforces
   `-0.2s ≤ (wordStart − beatStart) ≤ 1.8s`. Animations enter just before the anchor word,
   never late.
5. `npx hyperframes lint` — fix errors, triage warnings.
6. **Gate 1 — live Studio preview** before any render, even a draft. Scrub the sub-comps
   and sign off.
7. After sign-off: `render --quality draft`.
8. **Visual verification** — extract one frame per scene at its hero moment and actually
   look at every PNG (face not cropped, transitions land on the intended word, captions
   readable, no overflow). Lint passing is not the same as the design working.
9. Run the `MOTION_PHILOSOPHY.md` pre-flight checklist.
10. **Gate 2 — rendered MP4 preview** on `localhost:8080` (serve with `npx serve . -p 8080 -n`,
    **not** Python's `http.server` — it has no Range support, so scrubbing breaks).
11. Final: `render --quality standard`.

"Lint passes" and "the CSS looks correct" are **not** verification. A frame you actually
looked at is.

## Boucle de review (validée sur le reel montage-ia, 17/08)

Chaque projet vidéo peut embarquer une interface de review frame par frame
(`review.html` à la racine du projet, modèle dans
`video-projects/reel-montage-ia/review.html`) : navigation image par image,
retours horodatés, export « Copier pour Claude ». Le cycle est : rendu draft →
le créateur note ses retours dans l'interface → il colle le bloc → corrections
chirurgicales par timecode → nouveau rendu. Pointer le `src` de la vidéo sur le
dernier rendu à chaque itération.

## Auto-vérification (obligatoire avant d'envoyer un rendu)

Demandée au tournage le 17/08 : « la plupart des retours, tu aurais pu t'en
rendre compte toi-même en regardant ou écoutant la vidéo ». Aucun rendu ne
lui est envoyé sans avoir passé :

```bash
npm run verify -- --project <slug>            # dernier rendu du projet
npm run verify -- --project <slug> --master   # dernier master
npm run verify -- video-projects/<slug>/renders/<rendu>.mp4
```

Le script vit dans `scripts/autoverify.py`, **une seule fois pour tout le
workspace** — il n'y a plus de copie à maintenir par projet (les copies
n'existaient que dans un projet sur quatre, donc trois projets sur quatre
n'étaient pas vérifiables). Sa configuration est optionnelle et tient dans le
`meta.json` du projet :

```json
"verify": { "sentinels": ["…"], "forbiddenRepeats": ["…"], "topZone": true, "tailMax": 1.6 }
```

Sans configuration : les mots-sentinelles se déduisent du transcript **du
montage** (`assets/transcript.json`, `edit.json`, `clean.json`) — jamais d'un
rush, qui contient les phrases coupées volontairement — et la passe « zone
haute » ne tourne que sur un format vertical. Le master s'obtient avec
`npm run master -- --project <slug>` (`scripts/master.py`).

Il re-transcrit le rendu et vérifie : mots-sentinelles présents (fins de
segments non coupées), aucune phrase répétée (prises multiples), parole qui
se termine près de la fin de la vidéo, zone haute jamais visuellement vide.
En complément : les frontières de segments se calculent depuis les VRAIS
`start`/`end` des mots du transcript (jamais estimées), et les groupes
séparés par moins de ~0.3s se fusionnent (moins de coupes = moins de risques).
Puis passe FINALE au niveau sonore (demandée au tournage, 17/08) : whisper
étire les mots sur les pauses, donc les micro-blancs échappent au transcript.
`silencedetect` (~-36 dB, min 0.25s) sur l'audio monté, raboter le milieu de
chaque blanc en laissant ~0.25s de respiration, et re-silencedetect sur le
rendu pour prouver qu'il ne reste rien. Le découpage au niveau sonore prime
sur le transcript pour les blancs.
Leçon v10 : vérifier aussi que le bake ffmpeg utilise bien le MÊME EDL que la
composition — c'est le désaccord bake/composition qui a produit tous les
défauts de la v10.

## Transcription

Default to **local whisper.cpp** for any transcript. It is offline, free, and needs no
API key. Do **not** use `npx hyperframes transcribe`, or openai-whisper /
faster-whisper (avoid the 3 GB PyTorch install).

```bash
node scripts/transcribe-whisper.mjs path/to/video.mp4         # → <stem>.json next to input
# options: --output path · --model large-v3-turbo|base.en|<path.bin> · --language en
#          --threads N · --prompt "..." · --keep-audio · --verbose
#          --no-vad · --no-align · --silence-db -30 · --silence-min 0.2
```

Requires `brew install whisper-cpp`. The ggml model (~1.6 GB for `large-v3-turbo`) and the
silero VAD model download automatically to `models/` on first use; `models/` is gitignored.
Roughly 7x realtime on an M4 Pro.

Output schema is identical to ElevenLabs Scribe, so every downstream agent is unchanged:
`{ language_code, text, words: [{ text, start, end, type, speaker_id }], audio_duration_secs }`
where `start` / `end` are seconds and `type` is `"word"` or `"spacing"`.

**Two defaults you should not turn off.** Raw whisper.cpp word timestamps are not usable by
this pipeline, and the script corrects them in two ways:

1. **`--vad` (silero).** Without it whisper smears words across leading silence. On a test
   clip whose speech provably starts at 2.10s, the first word was stamped **0.00s** — a 2.1s
   error that would misplace every downstream cut. With VAD it lands at 2.13s.
2. **`--align`.** whisper stretches words over pauses instead of leaving gaps. On the same
   clip, three real pauses (0.93s / 0.65s / 0.71s) were entirely swallowed by words only
   0.54–1.14s long, so `cut-silences` saw **no inter-word silence at all** — and the
   `clamp-stretched-tokens` pre-pass never fired, because its threshold is >1.2s. The align
   pass runs `silencedetect` on the source, pulls word edges back to real speech, and snaps
   late onsets back to the true attack. After it, first/last word land within **2 ms** of
   ground truth and all three gaps are recovered.

The `clamp-stretched-tokens` pre-pass in `cut-silences` is still mandatory — it catches the
long screen-recording waits the align pass leaves alone.

**Known artifact — doubled words.** `--max-len 1 --split-on-word` occasionally repeats a
word across a segment boundary ("so so", "without without"), which `verify-cuts` PASS 2
then reports as a residual stutter. Before cutting one, re-transcribe that window with
natural segmentation (drop `-ml 1 -sow`) and check whether the doubling is really there —
cutting a hallucinated repeat clips real speech:

```bash
ffmpeg -y -ss <t-2> -t 7 -i clean.mp4 -vn -ac 1 -ar 16000 -c:a pcm_s16le /tmp/w.wav
whisper-cli -m models/ggml-large-v3-turbo.bin -f /tmp/w.wav -l en \
  --vad -vm models/ggml-silero-v5.1.2.bin -np
```

ElevenLabs Scribe remains available as a hosted fallback (better raw word alignment, needs a
key and an upload):

```bash
node scripts/transcribe-elevenlabs.mjs path/to/video.mp4
```

## Asset prep

Re-encode raw recordings to H.264 before referencing them as a `<video src>`:

```bash
ffmpeg -i raw.mov -c:v libx264 -preset medium -crf 20 -c:a aac -b:a 192k \
  -movflags +faststart assets/clip.mp4
```

## Documentation

- Agent index: https://hyperframes.heygen.com/llms.txt
- Catalog block props: `https://hyperframes.heygen.com/catalog/blocks/<slug>`
- HTML schema (authoritative): https://hyperframes.heygen.com/reference/html-schema
- Inline: `npx hyperframes docs <topic>`

## Trois pièges de derush, payés le 02/09

**Un EDL n'est pas forcément chronologique.** Sur une vidéo longue montée ici,
celui du rush principal revient en arrière au plan 219 : une prise refaite plus tard est remise à sa
place dans le propos. Un remontage qui trie les plans par temps source annule
ce travail en silence — et supprime au passage tout ce qui dépendait de
l'ordre. Ne jamais trier ; fusionner uniquement des plans **voisins dans l'EDL
et contigus dans la source** (`0 <= écart < colle`).

**La détection des phrases dites deux fois ne marche pas sur le transcript
complet.** Whisper, en lisant tout le fichier, fusionne une phrase répétée en
une seule occurrence. Les trois reprises que le créateur avait entendues à
l'oreille étaient toutes absentes du transcript global et toutes présentes en
fenêtre isolée. Il faut découper le montage en fenêtres de 8 à 14 s, transcrire
chaque morceau seul, et faire **deux passes de tailles différentes** : whisper
n'est pas stable vis-à-vis de la longueur de fenêtre. Surtout pas `-ml 1 -sow`,
qui redécode et fait disparaître les reprises.

**Un montage peut être à cheval sur deux rushes.** Un CTA monté ici assemblait
deux clips différents ; son EDL décrit la passe décibel appliquée à cet assemblage,
pas à un rush. Le traiter comme une source unique a coupé exactement le
passage qu'il fallait garder. Avant de réutiliser un EDL, vérifier de quoi il
est l'EDL.

## Ne jamais mettre `<!DOCTYPE html>` en tête d'une composition

Mesuré le 02/09, deux rendus du même chapitre à un caractère près : avec la
déclaration, `data-composition-src` ne charge plus rien et **toutes les
sous-compositions disparaissent** — sans erreur au rendu, sans avertissement au
lint. Sans elle, elles reviennent. Je l'avais ajoutée pour faire taire un
avertissement du linter sur `index.html` ; elle a rendu six animations
invisibles dans un master qui passait par ailleurs autoverify 20/20.

Nuance mesurée le 06/10 (la 013) : un chapitre **autonome** — document complet rendu seul, sans
aucun `data-composition-src` et monté par personne — rend toutes ses cartes avec la déclaration.
`npm run verif-montage` ne signale donc plus que les compositions qui montent des sous-compositions
ou qui en sont une.

Corollaire de méthode : **autoverify ne voit pas ce qui manque à l'image.** Il
vérifie le son, les mots-sentinelles, la fin de parole. Un plan qui aurait dû
porter une animation et qui n'en porte pas lui est invisible. Seule la planche
de contact regardée en entier attrape ça.

## Un master ne commence pas par une image noire

Le démuxeur concat ne fait pas toujours démarrer le flux vidéo à zéro : sur un
montage assemblé ici il commençait à `start_pts=164` (10,7 ms) quand l'audio
était à 0. Un lecteur posé sur t=0 n'a alors aucune image à afficher et montre
du noir — défaut réel, parti dans deux masters d'affilée avant d'être vu.

Aucun remux standard ne le corrige : `-avoid_negative_ts make_zero` l'aggrave
(164 → 492), `-muxdelay 0 -muxpreload 0`, `-copyts` et un réencodage audio le
laissent tel quel. Ce qui marche, sans réencoder la vidéo, c'est le filtre de
flux : `-bsf:v setts=ts=TS-<start_pts>`. `scripts/master.py` lit désormais le
`start_pts` de la vidéo et le ramène à zéro tout seul.

**Et une couverture doit CHEVAUCHER ce qui la suit.** Une surcouche qui s'arrête
au bord d'une carte laisse voir l'écran pendant le fondu d'entrée de la carte —
0,4 s, soit une douzaine d'images, largement assez pour qu'on lise ce qu'on
voulait masquer.

## Le nettoyage des éclats est une passe FINALE, pas un pré-filtre

Un « éclat » est un plan trop court pour se lire — deux, de 0,12 s et 0,33 s,
ont survécu jusqu'au master livré, pris à deux endroits sans rapport du
rush. Deux erreurs de méthode à ne pas refaire :

**Le critère.** « Ne porte aucun mot du transcript » ne marche pas : le
transcript couvre presque toute la timeline, donc un éclat de 0,12 s chevauche
forcément un mot. Le critère qui marche est géométrique — moins de 0,6 s **et**
isolé dans la source (aucun voisin de montage ne le prolonge, écart > 0,4 s des
deux côtés). Sous 0,3 s, éclat quoi qu'il arrive.

**Le moment.** Filtrer avant les exclusions et la fusion ne suffit pas : les
deux en RECRÉENT (une coupe laisse un moignon, une borne de bloc tombe au milieu
d'une prise). Il faut repasser à la fin, en boucle — retirer un éclat peut en
isoler un autre — et sur **toutes** les EDL, y compris celles construites par un
autre script. Onze éclats survivaient à la première approche.

## Le rendu ne voit pas un `textContent` changé en JS — constaté le 03/09

Des sous-titres posés sur UN élément dont on remplace le texte par
`tl.set(el, { textContent })` passent `hyperframes validate` (le navigateur les
affiche) et sont **absents du rendu** : le mode de capture `drawelement` ne
relit pas le DOM muté, il ne suit que les propriétés visuelles animées. Vérifié
image par image sur 18 frames : rien. Même cause pour un effet « frappe » qui
mute le texte. Le pattern d'un autre projet du workspace
(`26-08-18-calibration-nick-replit`, karaoké par `textContent`) est donc
probablement cassé au rendu sans que personne l'ait vu.

**Ce qui marche :** un élément `class="clip"` par état de texte, avec ses
`data-start` / `data-duration` — la visibilité native. 121 groupes de
sous-titres = 121 divs ; une frappe E-D-I-T = 4 clips de 0,12 s. C'est ce que
fait `video-projects/26-09-03-reel-claude-edit/rebuild.py`, qui régénère
sous-titres et timings du CTA depuis le transcript en une commande.

Trois détails du même chantier :
- `<video>` et son `<audio>` jumeau doivent être sur des `data-track-index`
  **différents**, sinon le lint refuse (« overlapping clips same track »).
- Les clips `<audio>` de SFX se mixent bien (testé avec un clip seul :
  silence puis -7 dB au bon instant). Mais `asset-library/sfx/typing.wav` est
  discret (-36 dB de moyenne) : au 0,15 conseillé par son README il finit 34 dB
  sous la voix, inaudible. Le mesurer plutôt que le supposer : énergie > 6 kHz
  sur la fenêtre de frappe, rendu avec / sans.
- `npx hyperframes render` lancé depuis la racine du workspace ne rend rien et
  affiche l'aide d'`init` — le cwd est remis à la racine entre deux commandes,
  toujours préfixer d'un `cd` absolu vers le projet.

## Trop d'éléments `<audio>` dans une composition : une piste rejouée à t=0 — constaté le 19/09

Sur la 012 (chapitre intro : 4 sons de pub + 5 morceaux de voix + 8 SFX = 17 `<audio>`),
le rendu rejouait **une des pistes de voix à t=0**, par-dessus l'intro — « on entend
deux voix ». Laquelle changeait d'un rendu à l'autre (0:51 sur un draft, 1:45 sur le
suivant). Diagnostic en deux rendus du même chapitre : sans les 8 SFX, propre ; avec, doublé.
Le `data-duration` des SFX (plus long que le fichier) et le 44,1 kHz d'un wav n'y étaient
pour rien. Les autres chapitres, à 1-10 éléments audio, n'ont jamais eu le problème.

**Parade :** pré-mixer les SFX en un seul wav avec ffmpeg (`adelay` + `amix`) et le poser
sur une seule piste. Et **réécouter les 8 premières secondes de chaque chapitre rendu**
avec whisper : c'est ce test, pas la planche de contact, qui a trouvé le défaut — un
transcript qui contient une phrase d'ailleurs, c'est une piste mal placée.

## Une carte en `data-composition-src` peut passer SOUS l'écran — constaté le 19/09

Sur la 012, trois cartes du CTA en sous-composition (`data-composition-src`, `z-index: 9`)
étaient invisibles au rendu : la fenêtre d'écran (`#zoom > #ecran-cadre` avec coins
arrondis + ombre, `z-index: 2`) passait par-dessus, et seul le dernier « A » du titre,
hors de la fenêtre, apparaissait. Ni `mix-blend-mode`, ni la 3D, ni le DOCTYPE n'étaient en
cause (trois rendus de test). Les mêmes cartes **posées en ligne** dans le chapitre
(`div.clip` avec `data-start`/`data-duration`, timeline GSAP imbriquée `tl.add(b, a)`)
se rendent du premier coup. Pattern dans `video-projects/26-09-18-youtube-masterclass-cherico/tools/cta.py`.
Deux détails vus au passage : en capture drawElement, deux éléments animés dans un conteneur
flex se posent au même endroit (positions absolues) ; et un `<img>` de carte est bien rendu.

## Le rendu 4K remplit le disque — constaté le 07/10

`--resolution 4k --video-frame-format png` (le preset `high` de la 013, pour un master YouTube)
met en cache chaque image des vidéos sources en PNG dans `$TMPDIR/hyperframes-extract-cache-501` :
57 Go pour une vidéo de 23 min. Deux rendus 4K en parallèle plus ce cache ont saturé un disque qui
avait 152 Go libres — ENOSPC à 94 % d'un chapitre, annoncé seulement par « Render failed ». Rendre
les chapitres l'un après l'autre (deux files ne vont pas plus vite au total, ~3,3 fois le temps
réel), regarder `df -h` avant, vider ce cache une fois le master livré.

Un rendu lancé en tâche de fond meurt avec la session Claude : le détacher,
`perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' zsh -c "cd <projet> && tools/rendre.sh …" &`.
