# Maison — Design Spec

> the workspace house style. Derived from `09-higgsfield` (same layouts, same motion
> language) with the accent swapped to the house brand yellow **#FFD935** and the
> supporting green tones warmed to amber to match. The reference frames in `references/`
> come from the Higgsfield source videos — they show the layouts and motion, not the
> final palette.

## Feel

Modern AI-tool creator energy. One neon-jaune accent carries the whole identity across
three different set moods (pale steel-blue studio, dark moody den, warm workshop).
Graphics feel like the product UI escaped into the room: frosted glass panels floating
in perspective beside the speaker, LED dot-matrix "boot" cards, staged text reveals
where words enter grey and flip to jaune. Fast but never frantic — text SNAPS, panels
DRIFT. Confident, techy, a little playful.

## Les deux registres de montage (à lire avant tout)

Le style a UNE identité visuelle (palette, typo, textures) mais DEUX registres
d'énergie, choisis par le format. Ne jamais les mélanger : un long monté comme
un reel épuise, un reel monté comme un long endort.

| | **LONG · 16:9** (YouTube, tutos) | **COURT · 9:16** (reels, TikTok, Shorts) |
| --- | --- | --- |
| Énergie | SOFT — pose, respire, tient | DYNAMIQUE — motion permanent |
| Densité de beats | 1 carte toutes les ~15-30s de parole | 1 élément visuel nouveau chaque ~1-2s ; chaque chose nommée est montrée (logiciel = interface, outil = carte, chiffre = compteur) |
| Entrées | `expo.out` 0.45-0.6s, puis DRIFT | `expo.out` 0.3-0.45s, pops `back.out` |
| Temps morts | Autorisés — le drift suffit | **Interdits** — toujours un élément vivant (typewriter, shimmer, compteur) |
| Holds | 4-7s par carte, outro 4-6s | 2-3s max, hors CTA final |
| Sous-titres | Groupes ou pas de sous-titres | **Karaoké un mot / ~300ms**, obligatoire |
| Cuts | Cachés dans le mouvement, match cuts | Durs, alternance de canvas, flash cards |
| Cartes | tier1 / tier2 du pool principal | `maison.soc.*` uniquement |
| Référence | Section **Motion** ci-dessous | Section **Formats courts** en fin de doc |

## Palette

| Token | Hex | Role |
| --- | --- | --- |
| `--jaune` | `#FFD935` | THE accent. Emphasis words, active states, kinetic type, tags. Sampled from refs. |
| `--jaune-soft` | `#FFE770` | Jaune on frosted glass (full jaune vibrates on light panels). |
| `--navy` | `#02060F` | tier1 canvas: step / thesis / stat cards. Near-black blue, never pure black. |
| `--olive` | `#141000` | tier1 canvas: stage/boot cards. Very dark warm amber + bokeh blobs. |
| `--cream` | `#F7F5C9` | tier1 canvas: money/kinetic typography cards. Pale butter. |
| `--charcoal` | `#17191C` | Text on cream. |
| `--grey-pre` | `rgba(255,255,255,0.38)` | The "pre-reveal" text state before the flip. |
| `--money-deep` → `--money-lite` | `#7A5C0E` → `#E6C230` | Vertical gradient for stat numbers on cream. |
| `--den` | `#19232A` | tier2 pill/PIP chrome tone. |
| `--warm-glow` | `#3A1E08` | Warm creep in a bottom corner of navy cards (the practical-light spill). |

Rules: jaune is the only saturated color anywhere. Backgrounds are one of exactly three
canvases (navy / olive / cream) — no other takeover background exists. White text on
dark, charcoal text on cream, jaune for the one emphasized thing.

## Typography

- **Display:** Garet Black (système de polices le créateur, 17/08 — fallback Inter
  Tight 900 tant que les fichiers Garet manquent), ALL CAPS, tracking condensé
  `--track-caps: -0.05em` (= son -50 Canva). Step titles run mega (220px single
  word). Kinetic floats run 54–84px.
- **Serif (2e voix) :** Instrument Serif, idéalement italique, même tracking
  condensé. Titres cumulatifs, connecteurs éditoriaux.
- **Eyebrow:** small caps, wide-tracked (`--track-eyebrow`, 0.34em) — "STEP 1:",
  "STAGE 2" — always above the big word, always subordinate.
- **Body:** Inter 400–600, sentence case, only inside documents/panels.
- **Mono:** JetBrains Mono for pills, tags, and anything UI-flavored ("CREATING THE
  ASSETS", location tags, prompt pills).
- Kinetic float text gets a dark rim (`--kinetic-shadow`) and a slight 3D perspective
  tilt (`--kinetic-tilt`) so it sits "in the room", not on the screen.

## Layout

- **tier1** — three canvases, all full-bleed opaque:
  - *Navy*: subtle diagonal streaks (`--streaks`) + warm glow creeping into the
    bottom-right corner (`--warm-creep`) + vignette. Content centered.
  - *Olive*: bokeh blobs (`--olive-bokeh`) + LED dot grid (`--dot-grid`). Content centered.
  - *Cream*: flat pale butter, charcoal type, content centered with generous air.
- **tier2** — transparent; graphics anchor beside the speaker's head (right side
  default, `--kinetic-tilt-l` variants for left). Never cover the center face zone
  (roughly x 620–1300, y 80–900). Lower-frame tags stay under y 930.
- Glass panels are tilted in perspective (`--glass-tilt`) with big soft shadows and
  rounded corners (`--radius`).
- Speaker PIP (screen-recording sections): rounded rect (`--radius-pip`), bottom-right,
  ~300px wide, with a jaune prompt pill beside it.

## Motion — registre LONG (16:9)

> Ce qui suit décrit le registre SOFT des formats longs. Pour les 9:16, voir
> « Formats courts » en fin de document : mêmes tokens, énergie différente.

Two speeds, always:

1. **SNAP** — text and panels enter fast (`expo.out`, ~0.45s): slide 30–60px + fade.
   Icon props and pills POP (`back.out(1.9)`).
2. **DRIFT** — while a glass panel is alive it floats slowly (`sine.inOut`, ~6s cycle,
   ±10px translate + ±1.5deg rotate). Text never drifts.

Signature moves:

- **The flip** — text enters at `--grey-pre`, snaps to white/jaune (`--dur-flip`,
  `power2.inOut`) as the next element arrives. Sequential items (lists, steps) each
  enter grey and flip when their successor appears. Never flip two things at once.
- **Dot-matrix resolve** — stage titles materialize from a sparse LED-dot shimmer to
  solid white with a faint jaune glow (opacity ramp + blur 8→0 + letter stagger).
- **Word-stagger montage** (cream cards): per-word tracking reveals, one mid-sentence
  word scale-emphasized, jaune confetti shards flying, motion-blur ghost trails.
- **Typed pill** — mono sublabels type on character by character after the title lands.
- Graphics **persist across camera cuts** and re-anchor — plan beats to outlive a cut.

Exits mirror entrances but faster (`--dur-out`) — slide + fade, no bounce out.

## Card kinds in this style

- tier1: step marker (navy mega-word), stage boot (olive dot-matrix), money kinetic
  (cream montage), thesis (navy multi-line), stat (navy jaune countup), quote (cream),
  overview steps (navy sequential list).
- tier2: kinetic float caps, numbered list, glass step panel, glass media panel, paper
  script card, location tags, icon pop, lower-third pill, caption slam, idea→money arrow.
- custom: speaker-PIP frame, jaune UI-highlight ring.

## Transitions

> Derived from filmstrip analysis of 36 sampled cuts across the three refs
> (`raw-media/maison-style-refs/transitions-analysis/`). The refs cut FAST
> (113-244 cuts per video) and almost never crossfade. The grammar:

- **The base cut is a hard cut, placed mid-action.** The refs hide cuts inside
  motion (cannon fires -> ball already flying; hand reaches -> object lands).
  When assembling: cut on the motion, not after it settles. This is the match
  cut — continuity of object/direction across an instant cut.
- **Punch-in jump cuts** on the talking head: instant scale steps (~1.07 per
  step), no easing, no blur. Energy without softness.
- **Graphics bridge cuts.** Props, pills, and panels persist across camera cuts
  and re-anchor; a moving graphic can carry the eye THROUGH a cut (match carry).
- **Panels move, the world doesn't.** For context swaps, a jaune-rimmed media
  panel slides in over the speaker instead of cutting away (panel slide), or
  the camera dives into the panel until it becomes the next scene (zoom through).
- **Section boundaries get the gate.** The olive dot-matrix boot card doubles
  as a chapter-turn shutter (dot boot gate).
- Motion spec: whips/slides are power3/expo, 0.4-0.9s; the swap always happens
  at the fully-covered or fastest moment; nothing "eases gently in".

Transition cards (`cards/transitions/`), 16 total, grouped by energy:

- **Whips (fast, blurred, camera-driven):** `tr-whip-pan` (one-world pan, blur
  peak, overshoot settle), `tr-spin-whip` (rotation carries through the cut),
  `tr-zoom-punch` (crash zoom + 1.5deg rotation kiss), `tr-flash-cut` (3-frame
  jaune pop, fastest move).
- **Cut-hiders (motion covers the swap):** `tr-match-carry` (prop bridge),
  `tr-punch-cut` (instant scale steps), `tr-glass-wipe` (frosted pane whip),
  `tr-type-wiper` (mega word as the wiper).
- **Reveals (masked, staggered — the AE hand):** `tr-venetian-slats` (staggered
  mask drop), `tr-circle-reveal` (iris from the click point),
  `tr-letterbox-crush` (the blink; heaviest, 1-2 per video).
- **Panel moves (the world is a window):** `tr-panel-slide` (b-roll comes to
  you), `tr-zoom-through` (dive into the panel), `tr-pip-expand` (window becomes
  the world), `tr-push-parallax` (depth push with shade + overshoot).

The AE tells baked into every card: motion blur on whips, overshoot-and-settle
landings, staggered masks, parallax depth, micro-rotations on zooms. Demo scene
planes inside each card stand in for real footage at assembly time.

## What NOT to do

- No second accent color. Ever. The brand blue does not enter this style.
- No pure-black backgrounds — navy `#02060F` or olive `#141000` only.
- No soft crossfades between elements; things snap or they drift, nothing "eases gently in".
- No static tier2 glass panel — if a panel lives longer than 2s it drifts.
- No jaune body text on cream (charcoal only; jaune is highlight pills/underlines there).
- No simultaneous flips; reveals are always staged left→right / top→bottom.
- No covering the speaker's face zone with tier2 content.

## Assembly rules — Maison's own recordings

> Established with le créateur on the kiprun intro/outro edit (Aug 2026). These govern
> HOW beats are placed over his talking-head footage, on top of the card style above.

### Protect what's on screen

- **Never cover the videos/inserts le créateur shows.** His edits often carry a vertical
  insert on the LEFT (UGC clips, screen recordings) — that insert IS the content.
  While an insert is up: tier2 pills go bottom-RIGHT, no takeovers, no reframe.
- Map the visual layout first (frame grid every ~5s) before placing anything: find the
  insert windows and the full-frame talking-head windows. Beats are placed per-window.
- His speaker position varies by multicam cut (center to center-right). Check actual
  frames before anchoring tier2 content — the library default (content right) usually
  needs the reframe below or a left-anchored variant.

### The reframe (his signature stage move)

When a beat needs room (lists, panels, banner) and he's too centered:

- **Pure lateral slide, NO zoom**: `x: -300px`, scale stays 1, `power2.inOut`, 0.7–0.85s.
  He keeps his natural size — zooming the reframe was tried and rejected.
- A **global navy scrim** lives at stage level (sibling of the video wrapper, above it,
  below the beats) and its opacity is driven by the MASTER timeline **in sync with the
  slide** (start it ~0.1s before the slide). Never put the scrim inside the beat: the
  beat fades in later and a light band flashes on the right first.
- Scrim gradient: `linear-gradient(90deg, transparent 0–36%, rgba(2,6,15,.55) 54%,
  rgba(2,6,15,.92) 70%, #02060F 80–100%)` — fully opaque before the slid video's right
  edge (1620px at −300). Video wrapper background: `#02060F`, transform-origin 50% 50%.
- Stage content sits right-aligned on the navy: mono eyebrow (30px, wide-tracked, jaune)
  on top, stacked items below (label 30px white@55% + value 58px Inter Tight 800 caps),
  entering grey-pre and flipping to jaune on their voice anchor, one at a time.
- **Return to full frame before the clip ends** (≥0.6s before the cut) so the edit
  joins the un-edited body cleanly.

### Punch-ins (youtuber energy)

- Instant scale steps `1.07–1.08` via `MT.set` — **no easing, no tween** (Higgsfield
  grammar). 2–3 per minute max, on emphasis phrases.
- Only during full-frame talking-head windows. Never during an insert (it would zoom
  the insert too), never during a reframe.

### Brand moments (Génération IA)

- The Génération IA banner is shown **as a glass panel beside him** when he says the
  name — never as a full-frame takeover (tried and rejected: "ça ferait bizarre").
- Panel spec: glass tilt, shot ~660×371 `object-fit: cover`, mono label under it in
  jaune, outline flips to `#FFD935` a beat after landing, then drifts.
- **Callback rule**: the same banner panel appears at BOTH mentions — end of intro
  ("j'ai fondé Génération IA") and outro. Same treatment, instant recognition.
- The Skool community screenshot (salle de classe) rides the same panel treatment;
  constrain the label to the image width (`max-width` + wrap) or the glass shows a
  grey slack strip beside the image.
- Name-card pill: `TON NOM` / `ce que tu fais, en une ligne`,
  bottom-left, on his self-intro.

### Mechanics that broke and their fixes (don't relearn these)

- Overlapping beats must sit on **different `data-track-index`** — same-track overlap
  is invalid and the assembler won't warn loudly.
- `build-beats.mjs` writes the bg video src as `../../assets/clip.mp4` — fix to
  `assets/clip.mp4` (CLI runs from the project folder).
- The lint error `gsap_timeline_not_registered` on the assembled index.html is a false
  positive of the nested-master pattern (children live on `__beatTimelines`).
- Whisper transcription: French clips need `--language fr`; word timestamps are the
  anchor source for every beat start (beat enters 0.2–0.6s before the anchor word).
- No em dashes in on-card copy.

## Formats courts (9:16) — le système reels · registre DYNAMIQUE

Codifié le 2026-08-16 depuis les reels (Da5cgNmoNDr, DZU-J9roH-O,
Dba-jOyIbom) + déconstruction frame par frame de nathanhodgson.ai et nick_saraev.
Les templates vivent dans `cards/social/` (1080×1920, ids `maison.soc.*`).

### Layout canonique — LA CARTE (référence fournie par Maison, 17/08)

Le format de ses reels publiés, désormais obligatoire :

- **Jamais le créateur en plein cadre, pas même une frame.** Le split est là dès
  la frame 1 et jusqu'à la fin.
- **Fond noir texturé** (vagues concentriques subtiles) sur tout le cadre.
- **Sa vidéo dans une carte à coins arrondis (~42px) sur le TIERS BAS** :
  le haut de sa tête arrive environ au tiers bas de l'écran (~y 1280/1920).
  Sa tête reste petite — jamais « une grosse tête qui cache tout ».
- **Zone d'illustrations en haut (~58 %)**, coins arrondis en bas, animée
  en continu dès la frame 1 (mascotte, slam, cartes...).
- **Le karaoké vit dans l'interstice noir** entre les deux zones — jamais
  sur le visage, jamais sur une carte.
- **La tête détourée dépasse FRANCHEMENT du bord de la carte (~130px,
  référence : le reel publié), cadrage zoomé, visage grand.**
  Deux couches (vidéo clippée par la carte + détourage non clippé) avec des
  transforms STRICTEMENT identiques à tout instant — toute divergence de
  scale dédouble l'image (« 4 oreilles », v12 du reel 26-08-17).
- **Ligne de tête fixe.** Les punch-ins/zooms sur la carte (origin bas)
  s'accompagnent TOUJOURS d'une translation `y` vers le bas qui compense la
  montée due au scale : le haut de la tête ne franchit jamais sa ligne, donc
  ne rencontre jamais le karaoké. Référence v14 : zone haute 970px, base
  1.28/y0, punch 1.33/y50, zoom 1.43/y150, karaoké top 985, tête ~y1115.

### Règles de montage audio (feedbacks 17/08)

- **Pads d'entrée généreux** : ~0.25-0.3s avant l'attaque du premier mot d'un
  segment. Un mot dont on rate l'attaque (« Parce que » à peine audible) est
  une coupe ratée.
- **Fins de mots complètes** : +0.4-0.7s après le dernier mot (les mots longs
  comme « professionnel », « l'installer » traînent). Vérifier à l'oreille
  (whisper naturel sur la fenêtre) les fins de segments.
- **Répétitions : garder UNIQUEMENT la dernière prise** — c'est toujours la
  meilleure (règle d'or). Vérifier chaque gap long avec une
  re-transcription naturelle : whisper fusionne les prises et masque les
  répétitions.

### Réalisme des mockups UI

Une interface reconstituée doit RESSEMBLER à l'outil réel : Claude = thème
clair officiel (fond crème #FAF9F5, texte #3d3929, logo orange #D97757,
réponse en vrai texte qui streame), pas un chat sombre générique. Partir
d'une capture réelle de l'outil comme référence avant de mocker.

### Layout canonique (historique)

- **Le split screen est l'ÉTAT PAR DÉFAUT du reel** (confirmé au tournage,
  2026-08-16 : c'est ce qui fait mouche chez Nathan/Nick) : illustration en
  haut ~58%, speaker en bas ~40%, en continu. Le plein cadre speaker est
  l'exception, réservé à l'accroche et au CTA. La zone haute ne se vide
  jamais entre deux illustrations : elle enchaîne.
- **Média en haut ~58%** du cadre, coins arrondis 44px en bas, pill source
  mono en haut à droite. Le talking-head 9:16 occupe le bas (il est la base,
  pas un overlay). Carte : `soc.media.top`.
- Variantes de zone haute : stack A/B (`soc.compare.stack`), chat vivant
  (`soc.ui.chat-live`), badges de vues (`soc.proof.views`), carte profil
  (`soc.proof.profile`).
- Bandeau marque persistant en haut si collab/outil nommé (`soc.label.header`).
- Fin de reel : mot-clé de commentaire en jaune géant (`soc.cta.comment`).

### Sous-titres

- **Groupes de 1 à 4 mots, remplacés en bloc toutes les 0,6-1,2 s** (tranché par
  le créateur le 18/08 depuis ses 6 reels publiés, mesures dans
  `formats/MESURES.md`). Le groupe se coupe sur le SENS, pas sur le
  compte de mots. Blanc gras 64-66px, ombre portée douce, posé au-dessus de la
  ligne de tête (top 985 avec tête plafonnée à ~y1115). (Remplace la règle
  mot-à-mot héritée de Nathan/Nick.)
- **Aucun mot en couleur** (le créateur, 02/10 : « tu peux arrêter de mettre des
  sous-titres en jaune ? ») : le sous-titre entier est blanc, encre sur fond
  crème. Fin des mots-clés `*` en jaune. Le jaune reste pour les éléments
  graphiques (pills, surlignage du carton), pas pour le texte parlé.
- **Jamais sur le visage, jamais devant quoi que ce soit** (règle le créateur
  17/08) : un sous-titre ne recouvre ni le visage ni un élément visuel. Si
  la place manque, c'est le layout qu'on ajuste, pas la règle.

### Les 6 règles d'animation (déduites de Nathan/Nick, non négociables)

1. **L'animation montre le produit en train de FAIRE.** Typewriter = l'outil
   travaille, barre = installation, courbe = croissance, squelettes = l'IA
   répond. Zéro animation décorative.
1a. **Le texte ne couvre JAMAIS le visage** (règle le créateur 17/08). Tout texte
   (karaoké, CTA, titres) vit dans la zone haute ou dans les marges claires.
   Si une section n'a pas de place hors visage (CTA final), le split reste
   engagé et le texte monte dans la zone haute ; le karaoké se coupe plutôt
   que de chevaucher le visage.
1b. **ZÉRO FLOTTEMENT dans la zone haute** (vérifié frame par frame chez
   Nathan : son typewriter avance à CHAQUE frame ; confirmé au tournage
   17/08). Toute carte en hold porte une animation d'entretien : playhead
   qui balaye, curseur qui clignote, shimmer qui boucle, zoom lent,
   pulsation, REC qui clignote. Si une carte est immobile plus de ~0.5s,
   c'est un bug de montage.
2. **Jamais de capture d'écran brute.** Toujours : recadrée sur la ligne qui
   compte, coins arrondis, contour jaune, posée sur fond neutre. Les UIs
   importantes se RECONSTRUISENT en mockup HTML géant et lisible.
3. **PAS de glare sweep.** (Retiré le 18/08 sur demande : « ce voile
   qui passe sur la vidéo, je l'aime pas, retire-le de mon style ».) Les entrées
   de cartes vivent par le snap + le drift, jamais par un voile qui balaye.
4. **Toujours un élément vivant** à l'écran pendant que le créateur parle
   (typewriter qui continue, curseur, drift, shimmer). Jamais une frame morte.
5. **Deux voix typographiques** : Inter Tight caps pour l'info,
   `var(--font-serif)` (Instrument Serif italique) pour les connecteurs
   dramatiques et titres cumulatifs (`soc.section.title-build`).
6. **Sur cream, l'emphase est or `#B8940F`**, jamais jaune pur (illisible).
   Le jaune #FFD935 vit sur navy/noir et dans les surlignages derrière du
   texte charbon.

### Sound design

Les SFX suivent la convention de `asset-library/sfx/README.md` : whoosh sur
les balayages, pop sur les cartes, click sur le typewriter, riser avant les
moments forts, impact sur les mots-clés massifs, ding sur les complétions.
Clips `<audio>` calés sur le timestamp de l'animation, volume 0.12-0.25,
voix toujours à 1.0. Registre court : les événements majeurs sonnent, jamais
les swaps karaoké. Registre long : transitions de section uniquement.

### Texte derrière le sujet

Détourage u2net (`npx hyperframes remove-background`) + titre entre le fond
et le cutout. Recette validée dans `video-projects/demo-texte-derriere/`.
Sur fond noir, ajouter le halo jaune subtil derrière le sujet.
