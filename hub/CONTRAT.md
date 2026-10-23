# Contrat du hub Editing OS

Le hub est un seul processus `node:http` (aucune dépendance), sur le port **4300**.
Il lit l'espace de travail de la v1 (`config.json` → `espace_de_travail`, soit
`.`) **sans jamais y écrire de code**. Les seules écritures côté
projets sont celles que la v1 faisait déjà : `review/<rendu>.json` (retours) et
`review/brief-*.md`. Tout ce que la v2 déclare vit dans `donnees/`.

## Vocabulaire

- **Tournage** : une carte de la page d'accueil. Un jeu de sources. Il regroupe un
  ou plusieurs **dossiers** de `video-projects/` (les doublons d'un même tournage
  sont reliés par déclaration, jamais déplacés).
- **Livrable** : une vidéo qui sort d'un tournage. Déclaré dans
  `donnees/tournages/<slug>.json`, jamais deviné.
- **Version** : un rendu (`renders/<prefixe>-vNN*.mp4`) d'un livrable.
- **Dossier** : le nom du répertoire dans `video-projects/` (le « slug » de la v1).
  Les routes qui touchent au disque (thumb, feedback, run, prune, studio,
  review) prennent un **dossier**. Les routes de haut niveau prennent un
  **tournage**.

## États d'un livrable

Deux déclarés au tournage (via le hub ou Claude), les autres déduits du disque.

| id | libellé | qui | règle |
| --- | --- | --- | --- |
| `a-monter` | à monter | déduit | aucun rendu |
| `en-montage` | en montage | déduit | un rendu existe mais il est un draft sans review, ou le dernier lot de retours est traité et aucun rendu plus récent |
| `a-relire` | à relire, ton tour | déduit | le dernier rendu est plus récent que le dernier lot de retours (ou n'a aucun retour) |
| `retours` | retours chez Claude | déduit | un lot de retours non traité porte sur le dernier rendu |
| `valide` | validé | déclaré | `valide: {version, le, par, via}` posé |
| `publie` | publié | déclaré | `publie: {le, ou, url}` posé |
| `abandonne` | abandonné | déclaré | |

Précision sur `en-montage` : en pratique, dès qu'un rendu existe, c'est
`a-relire` ou `retours`. `en-montage` sert aux projets sans rendu mais avec un
`index.html`, et quand le dernier lot est traité (Claude travaille à la version
suivante).

L'état d'un tournage = le plus urgent de ses livrables, dans l'ordre
`retours` > `a-relire` > `en-montage` > `a-monter` > `valide` > `publie` > `abandonne`.

## Fichier déclaré : `donnees/tournages/<slug>.json`

```json
{
  "schema": 1,
  "slug": "26-10-13-arcads-comment-faire-ca",
  "titre": "Reel Arcads × Loopstr « Comment faire ça… »",
  "type": "reel",
  "dossiers": ["26-10-13-arcads-comment-faire-ca"],
  "archive": false,
  "note": "",
  "livrables": [
    {
      "id": "reel",
      "nom": "Le reel",
      "dossier": "26-10-13-arcads-comment-faire-ca",
      "composition": "index.html",
      "prefixes": ["reel-arcads"],
      "destination": "instagram",
      "etat": null,
      "valide": null,
      "publie": null,
      "composition_memo": "facecam"
    }
  ],
  "migration": { "auto": true, "le": "2026-10-18", "a_valider": true }
}
```

- `type` : `reel | pub | ugc | youtube | motion | demo`.
- `prefixes` : un rendu appartient au livrable si son nom de base commence par un
  des préfixes (après retrait de l'extension). Les rendus non rattachés sont
  listés à part dans le détail (`rendus_orphelins`).
- `etat` : `null` (déduit) ou l'un de `valide | publie | abandonne`.
- `composition_memo` : id d'une disposition de `donnees/compositions.json`.
- `destination` : `instagram | meta-ads | youtube | skool | linkedin | client | interne`.

## Routes

Toutes les réponses sont JSON (`{error}` sur erreur), timestamps en ms epoch.

### Santé et état
- `GET /api/health` → `{ ok, pid, uptimeSec, port, version, scannedAt, tournages }`
- `GET /api/state` → `{ summary, tournages: [TournageResume] }`
  - `summary` : `{ tournages, livrables, parEtat: {a-monter, en-montage, a-relire, retours, valide, publie, abandonne}, renderBytes, scannedAt, scanMs }`
- `POST /api/rescan` → `{ ok, scannedAt, ms }`

### Tournages
- `GET /api/tournage/<slug>` → `TournageDetail`
- `POST /api/tournage/<slug>` body `{ patch: { titre?, type?, note?, archive? } }` → `TournageDetail`
- `POST /api/tournage/<slug>/livrable` body `{ id, patch: { nom?, destination?, etat?, valide?, publie?, composition_memo? } }` → `TournageDetail`
  - poser `etat: "valide"` avec `valide: { version: "renders/x.mp4" }` complète `le` et `par: "maison"`, `via: "hub"`.
  - poser `etat: null` revient à l'état déduit.

`TournageResume` :
```json
{
  "slug": "…", "titre": "…", "type": "reel", "date": "2026-10-13",
  "dossiers": ["…"], "archive": false, "migration": {…},
  "etat": "a-relire",
  "apercu": { "dossier": "…", "file": "renders/reel-arcads-v8-master.mp4", "mtime": 0, "width": 1080, "height": 1920,
              "orientation": "vertical", "durationMs": 31000, "master": true },
  "livrables": [
    { "id": "reel", "nom": "Le reel", "dossier": "…", "destination": "instagram",
      "etat": "a-relire", "etat_declare": null, "versions": 8,
      "derniere": { "file": "renders/reel-arcads-v8-master.mp4", "mtime": 0, "bytes": 0, "master": true,
                    "width": 1080, "height": 1920, "orientation": "vertical", "durationMs": 31000 },
      "retours": { "open": 0, "total": 12 }, "composition_memo": "facecam",
      "valide": null, "publie": null }
  ],
  "retours": { "open": 0, "total": 12 },
  "lastTouched": 0, "renderBytes": 0
}
```

`TournageDetail` = `TournageResume` + :
```json
{
  "absPaths": { "<dossier>": "<ton-dossier>/video-projects/<dossier>" },
  "compositions": { "<dossier>": ["index.html", "compositions/a.html"] },
  "rendus": { "<livrable id>": [ { "dossier", "file", "mtime", "bytes", "master", "kind", "width", "height", "orientation", "durationMs", "retours": {"open","total","done"} } ] },
  "rendus_orphelins": [ { "dossier", "file", "mtime", "bytes" } ],
  "retours_fichiers": { "<dossier>": [FeedbackFile] },
  "documents": { "<dossier>": ["MONTAGE.md", "SCRIPT.md", …] },
  "meta": { "<dossier>": { "fps": 30, "format": "…" } }
}
```

### Vignettes
- `GET /api/thumb/<dossier>?file=renders/x.mp4[&kind=loop]&v=<mtime>` → jpeg (ou gif en `loop`), immuable.

### Review et retours
- `GET /api/reviews` → `{ reviews: [ { dossier, tournage, titre, fps, renders: [ { file, livrable, mtime, master, width, height, orientation, durationSec, retours: {open,total,done} } ] } ] }`
  - `orientation` ∈ `vertical | horizontal | square | null` (seuil unique : celui de media-info, 0.95 / 1.05).
  - `fps` vient de `meta.json` du dossier (`fps` ou `render.fps`), 30 à défaut.
- `GET /api/feedback/<dossier>` → `{ slug, files: [FeedbackFile] }`
- `POST /api/feedback` body `{ slug: <dossier>, render, notes: [Note], fps?, width?, height? }` → `{ ok, feedback }`
- `POST /api/feedback/done` body `{ slug, render, done }` → tout le lot
- `POST /api/feedback/note` body `{ slug, render, id, done }` → une note

- `POST /api/feedback/fichier` body `{ slug, render, id, kind: "dessin" | "piece", data: <data URL png/jpeg/webp/pdf, 8 Mo max>, nom? }` → `{ ok, rel: "review/<rendu>.<id>.<kind>.<ext>", bytes }`. Le fichier est écrit dans `review/` du projet, à côté du lot ; la note le référence par `dessin` ou `piece`.

`FeedbackFile` : `{ file, render, updatedAt, done, fps, width, height, notes: [Note] }`
`Note` : `{ id, t, txt, done, general, createdAt, t2?, dessin?, piece?, piece_nom? }` (`general: true` = note sans timecode, `t` vaut 0 ; `t2` = fin d'une plage ; `dessin` = PNG transparent tracé sur l'image à `t`, à la taille de la vidéo ; `piece` = photo ou PDF joint). La v1 ignore ces champs. Le brief (`review/brief-*.md`) les cite.

La page de review est **autonome** : `GET /review.html?project=<dossier>&render=<renders/x.mp4>`.
Elle lit `/api/reviews` pour connaître orientation, fps et dimensions AVANT de
charger la vidéo, puis sert la vidéo par `/workspace/video-projects/<dossier>/<file>`.

### Actions (pipeline depuis le navigateur)
Identiques à la v1, par dossier : `GET /api/actions`, `POST /api/run { slug: <dossier>, action, composition?, file? }`,
`GET /api/job/<id>?since=n`, `GET /api/jobs/<dossier>`, `POST /api/job-stop/<id>`.

### Rangement des rendus
`GET /api/prune/<dossier>?keep=3`, `POST /api/prune { slug, keep }`, `GET|POST /api/prune-all`. Corbeille système, masters et `renders/final/` protégés.

### Studio HyperFrames
`POST|DELETE /api/studio/<dossier>`, `GET /api/studios`.

### Bibliothèques (première livraison)
- `GET /api/compositions` → contenu de `donnees/compositions.json` + pour chaque disposition la liste des livrables qui la déclarent.
- `GET /api/charte` → contenu de `donnees/charte.json`.

### Effets et Vitrine (deuxième livraison)
- `GET /api/effets` → `donnees/effets/index.json` tel quel, avec par-dessus les épingles du moment (`epingle`, `note_epingle`) et **ma charte** (`dans_ma_charte`, `charte_via` ∈ `charte | chaine | carte | null`, `charte_note` sur chaque entrée ; `dans_ma_charte`, `charte_note` sur chaque chaîne ; `ma_charte: { chaines, cartes }` et `resume.dans_ma_charte`, `resume.inspiration`). Construit s'il manque.
- `GET /api/ma-charte` → `{ chaines: [ { id, le, note, via } ], cartes: [ … ] }`.
- `POST /api/ma-charte` body `{ type: "chaine" | "carte", id, dans?: bool, note?: string }` → adopte (ou retire, `dans: false`) une chaîne entière ou une carte seule dans la charte. Écrit `donnees/ma-charte.json`, réécrit `INDEX.md`. La chaîne `maison` est la charte elle-même et se refuse.
- `GET /api/vitrine` → `donnees/vitrine/index.json`, épingles appliquées. Construit s'il manque.
- `POST /api/effets/reconstruire` → relit la style-library et motion-library de la v1, réécrit les deux index et `INDEX.md` → `{ ok, effets: resume, vitrine: resume, avertissements }`.
- `GET /api/epingles` → `{ items: [ { id, epingle, le, note, via } ] }`, fusion v1 + v2.
- `POST /api/epingle` body `{ id, epingle?: bool, note?: string }` → `{ ok, epingle: { id, epingle, le, note, via } }`. Sans `epingle`, bascule. Écrit `donnees/epingles.json` et réécrit `donnees/effets/INDEX.md` (pas de reconstruction).

Les aperçus se servent par `/workspace/` : une carte jouable est une iframe sur `/workspace/style-library/<fichier>`, une référence une vidéo sur `/workspace/motion-library/media/…`.

### Divers
- `POST /api/reveal { path }` → `open -R` (confiné à l'espace de travail et à `donnees/`).
- `GET /workspace/<chemin>` → fichier de l'espace de travail v1, avec Range (206).
- `GET /donnees/<chemin>` → fichier de `donnees/` (lecture seule).
- Statique : `hub/public/` (`Cache-Control: no-store`).

## Navigation du front (hash)

Trois onglets, même menu partout, rien ne s'ouvre à part :

- **Projets** : `#/` · `#/tournage/<slug>`
- **Ma DA** (dans cet ordre) : `#/ma-da/style` (porte d'entrée de `#/ma-da`) · `#/ma-da/animations[?famille=&effet=&format=&charte=&q=]` · `#/ma-da/formats[/<disposition>]`
- **Inspiration** : `#/inspiration/montage[/<chaine>][?famille=&effet=&format=&charte=&q=]` · `#/inspiration/motion[?q=&usage=&epingles=1&voir=<id>]`
- Review : page autonome (`/review.html?project=<dossier>&render=<renders/x.mp4>`).

Anciennes adresses, redirigées : `#/compositions` → formats, `#/charte` → style, `#/effets` → animations, `/vitrine.html` → `#/inspiration/motion`.

## Effets : le vocabulaire, la table, l'index

Trois fichiers dans `donnees/effets/`, et un principe : **on ne retagge jamais à la main**.

| fichier | rôle | qui l'écrit |
| --- | --- | --- |
| `vocabulaire.json` | six familles (`familles: [{ id, nom, description }]`, celles de Frame AI Studio) et les types d'effets, vocabulaire fermé (`effets: [{ id, nom, description, neutre, famille, couvre }]`, `valide`, `valide_le`) | le créateur (via Claude) |
| `mapping.json` | la table purpose → effet, motifs sur l'id ou le traitement d'une carte, règles sur les techniques des références (regex, premier motif gagnant), usages de repli, chaînes (nom, note, ordre), `chaines_exclues` | Claude, à la main |
| `index.json`, `INDEX.md` | GÉNÉRÉS par `node scripts/construire-effets.mjs` (`npm run effets`) | le script |

**Deux bibliothèques, deux rôles.** Effets = la boîte à outils du montage, et dedans **ma charte** (ce qu'on monte tel quel) contre **l'inspiration** (les autres chaînes, à reprendre). Vitrine = l'inspiration au sens large (Pocinho, Prompt Motion, styles), rien ne s'y monte.

`donnees/ma-charte.json` : `{ chaines: [ { id, le, note, via } ], cartes: [ … ] }`. Une chaîne adoptée met toutes ses cartes dans la charte, une carte adoptée seule n'y met qu'elle ; les cartes `10-maison` y sont par nature. Amorcé le 18/10 avec les trois styles choisis dans la v1 (dankieft, nathan-hodgson, nick-saraev, avec les notes).

`donnees/epingles.json` : les épingles d'inspiration posées depuis la vitrine (`items: [{ id, epingle, le, note }]`). Il **prime** sur `ma-bibliotheque/selection.json` de la v1, qui est lu et jamais réécrit ; `epingle: false` retire une épingle v1.

`donnees/vitrine/index.json` : GÉNÉRÉ par `node scripts/construire-vitrine.mjs` (`npm run vitrine`). `npm run bibliotheques` fait les deux.

### Une entrée de `index.json`

```json
{
  "id": "maison.soc.screen.spotlight",
  "nature": "carte",                      // toujours une carte : un HTML HyperFrames à monter en data-composition-src
  "dans_ma_charte": true, "charte_via": "charte", "charte_note": "",   // posés à la lecture depuis donnees/ma-charte.json
  "chaine": "maison", "effet": "zoom-sur-zone", "effets_secondaires": ["ecran-3d"],
  "titre": "Spotlight jaune", "titre_traitement": "Spotlight jaune", "tier": "social", "purpose": "screen", "traitement": "spotlight-jaune",
  "format": "9:16",                       // lu sur data-width/data-height de la carte, ou style.json
  "charte": "neutre",                     // neutre : la mécanique ne dépend pas du look ; habille : porte la palette et la typo de sa chaîne
  "niveau": null,                         // pepite | solide | faible, hérité de l'analyse du style ; null pour la charte maison
  "fichier": "style-library/10-maison/cards/social/soc-spotlight-jaune.html",
  "slots": ["screen"], "duree": { "min": 4, "max": 7 }, "dimensions": { "w": 1080, "h": 1920 },
  "apercu": { "live": "style-library/…html", "poster": "style-library/…png", "mp4": null, "w": 1080, "h": 1920 },
  "mecanique": "…",                        // le commentaire d'en-tête de la carte (ou les notes de style.json)
  "variantes": { "n": 100, "canevas": { "cream": 39 }, "cartes": [ { "id", "traitement", "fichier" } ] },   // seulement sur une entrée repliée
  "epingle": false, "note_epingle": ""
}
```

Les 1 100 variantes générées de Higgsfield se replient en une entrée par chaîne × effet (`<style>.<tier>.<purpose>.variantes`) qui liste leurs traitements. Les références (Pocinho, styles de motion-library) ne sont **pas** dans Effets : elles sont en vitrine, chaque chaîne pointe la sienne par `vitrine: "style-<id>"`.

`chaines[]` : `{ id, nom, note, source, dossier, design, niveau, resume, palette, fonts, format_defaut, n_cartes, n_references, n_variantes, epingle }`. `matrice[chaine][effet]` : les comptes. `vocabulaire` : copie du vocabulaire au moment de la construction. `avertissements[]` : purposes ou effets hors table.

`INDEX.md` est la version lisible par le skill `design-beats` : vocabulaire, puis **Ma charte** (en entier, par effet), les épinglés, puis **l'inspiration des autres chaînes** (par effet et par chaîne, plafonnée à 12 lignes par case, le reste dans `index.json`), la matrice.

## Exemples concrets : `donnees/exemples/`

`exemples.json` : `{ videos: { <clé>: { titre, tournage, dossier, rendu, format, publie, code } }, exemples: [ { id, video, debut, fin, titre, famille, effet, format?, style?, ce_qu_on_voit, comment } ] }`. `famille` et `effet` viennent du vocabulaire, `format` d'une disposition de `compositions.json`, `style: true` le montre dans « Mon style ». `node scripts/extraire-exemples.mjs` (`npm run exemples`) tire `clips/<id>.mp4` (720p, son) et `clips/<id>.jpg` du rendu, sans rien écrire côté projets ; servis par `/donnees/`. Le front les lit directement (`/donnees/exemples/exemples.json`) ; `INDEX.md` les liste dans « Ma DA en situation ».

`videos.<clé>.court: true` range l'extrait dans la grille des reels (9:16), sinon YouTube (16:9).

À l'écran il n'y a qu'un mot, ♥ **Favori** (épingle, `/api/epingle`). `GET /api/vitrine` y verse les références `niveau: "pepite"` sans décision (`favori_par: "claude"`) ; une épingle `epingle: false` les retire. La première rangée est `favoris`.
