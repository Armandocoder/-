# Editing OS V3 — installation et prise en main

**Un studio de montage vidéo piloté par des agents IA, qui tourne entièrement sur ta
machine.** Tu déposes un rush face caméra, les agents s'enchaînent (couper les blancs,
couper les erreurs, vérifier les coupes, poser les animations, poser la b-roll), et tu
valides à chaque étape. Rien ne part dans le cloud, aucun abonnement.

La V3 change surtout **le hub**, l'écran depuis lequel tu suis tes vidéos, relis tes rendus
et choisis tes animations. Le moteur de montage (les agents, HyperFrames, la style-library)
est le même qu'en V2.

---

## 1. Ce qui change par rapport à la V2

**Un hub en trois onglets, et c'est tout.** Fini Mission Control, le bureau 8-bit, « Ma
bibliothèque » et « Explorer » mélangés. Le même menu partout :

- **Projets** : un projet par tournage, avec ses vidéos et leur état en clair : *à relire*
  (c'est ton tour), *retours chez Claude*, *en montage*, *à monter*, *validé*, *publié*.
  Tu valides ou marques publié d'un bouton, ou tu dis simplement « c'est good » à Claude.
- **Ma DA** : tes affaires à toi, ce qu'on monte dans tes vidéos.
  - *Mon style* : ta charte (couleurs, polices, registres clair et sombre, sound design, règles).
  - *Mes animations* : tes cartes, rangées en six familles (Textes, Caméra, Compositions,
    Graphismes, Interfaces, Médias) puis par type d'effet, jouées en direct au survol. En
    tête, **« Dans mes vidéos »** : des extraits réels de tes vidéos publiées, que Claude relève
    après chaque publication.
  - *Mes formats* : comment tes vidéos sont composées (split carte, face caméra, YouTube écran
    et bulle…), avec un exemple rendu à côté du schéma.
- **Inspiration** : ce qui n'est pas à toi, à regarder pour la mécanique.
  - *Montage* : les autres styles (Kallaway, Vox, Higgsfield, Dan Kieft, Nathan Hodgson…), une
    page par chaîne. Une carte qui te plaît : **Mettre dans ma DA**, elle passe dans tes animations.
  - *Motion design* : ~270 références plein écran sur fond noir, avec leur démo, leur mécanique
    et le prompt à copier. **♥ Favoris** pour garder celles qui te parlent.

**Une review bien plus complète.** La vidéo prend toute la hauteur, les retours sont à
droite, et tu peux maintenant :

- **dessiner sur l'image** (crayon, flèche, rectangle, ellipse, quatre couleurs) : le dessin part
  avec ton retour et Claude le regarde avant de corriger ;
- poser **une plage** (touche P) au lieu d'un seul instant ;
- faire une remarque **sans timecode** (G), **joindre une photo** ;
- lire **en boucle** (B), afficher des **repères** centre et tiers (R).

**Claude lit ta DA avant de proposer un storyboard.** Le fichier `donnees/effets/INDEX.md`
liste tes animations, tes extraits réels et l'inspiration, dans cet ordre. Le skill
`design-beats` commence par lui.

**Le hub peut rester allumé tout seul** (Mac) : `npm run service:installer`, et
http://localhost:4200 répond dès que tu ouvres ta session, sans terminal ouvert.

---

## 2. Ce dont tu as besoin

| | Quoi | Vérifier / installer |
|---|---|---|
| Machine | **macOS** (Apple Silicon idéalement) | le chemin testé ; Linux devrait marcher, Windows non testé |
| | **Node 20 ou plus** | `node -v`, sinon https://nodejs.org |
| | **FFmpeg** | `ffmpeg -version`, sinon `brew install ffmpeg` |
| | **Google Chrome** | c'est lui qui fait le rendu des compositions |
| | **whisper.cpp** | `brew install whisper-cpp` (transcription locale, gratuite) |
| | **Python 3** | déjà présent sur macOS |
| Outil | **Claude Code** | les agents sont des skills Claude Code |

Aucune clé API obligatoire.

---

## 3. Installation (5 minutes)

**a. Dézippe** `editing-os-v3.zip` où tu veux (par exemple dans `Documents`), puis dans un
terminal :

```bash
cd ~/Documents/editing-os-v3
npm install
npx hyperframes doctor
```

`doctor` te dit ligne par ligne ce qui manque. Corrige, relance.

**b. Lance le hub :**

```bash
npm run os
```

→ http://localhost:4200

**c. (Mac, conseillé) Garde-le allumé en permanence :**

```bash
npm run service:installer
```

Ensuite le hub démarre tout seul à chaque ouverture de session. Ajoute
http://localhost:4200 en favori, ou dans Chrome : menu ⋮ → « Caster, enregistrer et
partager » → « Installer la page comme application », pour avoir l'icône dans le Dock.

**d. (Optionnel) La bibliothèque motion design** de l'onglet Inspiration se télécharge à part :

```bash
npm run motion:import
npm run vitrine
```

**e. (Optionnel) Les clés API** : `cp .env.example .env`, puis renseigne seulement ce dont tu
as besoin (b-roll de stock, transcription hébergée).

---

## 4. Tu viens de la V2 ? Reprendre ton travail

Installe la V3 **dans un nouveau dossier**, à côté de l'ancien (ne l'écrase pas), puis :

1. **Tes projets** : copie le contenu de `video-projects/` de la V2 dans `video-projects/` de
   la V3. Ils apparaissent tout seuls dans l'onglet Projets, avec leurs rendus et leurs retours
   de review (le format des retours n'a pas changé).
2. **Ton style**, si tu l'avais modifié : copie `style-library/10-maison/` de la V2 par-dessus
   celui de la V3, puis lance `npm run effets`.
3. **Ta charte** : ouvre Claude Code dans le dossier V3 et dis-lui « voici ma charte : … »
   (couleurs, polices, deux ou trois vidéos que tu aimes). Il réécrit `donnees/charte.json`,
   qu'on voit dans Ma DA › Mon style. Celle livrée n'est qu'un exemple.
4. **Ton `.env`** : copie-le de la V2 si tu en avais un.
5. Arrête l'ancien tableau de bord : les deux utilisent le port 4200.

Quand tout est là, tu peux archiver l'ancien dossier.

---

## 5. Ton premier montage

Ouvre **Claude Code** dans le dossier, et lance :

```
/reel-format
```

Il choisit le format et crée `video-projects/AA-MM-JJ-ton-sujet/`. Dépose ton rush dans
`assets/`, puis, en langage naturel :

```
transcris le rush
coupe les silences
coupe les erreurs et les reprises
vérifie les coupes
propose le storyboard des animations
```

Les agents te proposent chaque coupe et chaque animation avant de rendre quoi que ce soit.
Quand un rendu est prêt, ton projet passe à **à relire** dans le hub : ouvre la review,
note tes retours (ou dessine-les), puis « Envoyer au monteur » ou « Copier pour Claude ».

Quand une vidéo est publiée, dis à Claude : « relève les animations marquantes de cette vidéo
dans mes exemples ». Elles apparaîtront dans Ma DA › Mes animations, sur ton propre contenu.

Le détail de la recette : `PROCESS.md`. Le contrat technique (pour Claude) : `CLAUDE.md` et
`hub/CONTRAT.md`.

---

## 6. Ce qu'il y a dans le dossier

```
LISEZMOI.md          ce fichier
CLAUDE.md            le guide que Claude Code lit automatiquement
PROCESS.md           la recette complète d'un reel
MOTION_PHILOSOPHY.md l'esthétique motion design

hub/                 le hub (npm run os) et son contrat (hub/CONTRAT.md)
donnees/             ce que le hub déclare : projets, charte, formats, effets, exemples
.claude/skills/      les agents
formats/             les formats de reel documentés
style-templates/     squelettes de projet prêts à cloner
style-library/       12 styles de cartes motion (10-maison = le tien)
asset-library/       b-roll, logos, captures, banque de sound effects
scripts/             transcription, vérification, mastering, index des effets
video-projects/      vide : c'est là que ton travail atterrit
```

**Un souci ?** `npm run service:journal` montre ce que le hub a fait, ou relance-le avec
`npm run service:redemarrer`. Et sinon, poste ta question dans la communauté avec la
capture de ce que tu vois.
