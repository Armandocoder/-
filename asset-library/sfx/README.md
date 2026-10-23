# SFX — sound design du style maison

Pack réel fourni au tournage le 2026-08-17 (ses sons de montage habituels).
Les noms de fichiers sont des RÔLES : pour changer un son, remplacer le
fichier en gardant le nom, rien d'autre ne bouge.

## Mapping son ↔ animation (convention du style)

| Fichier | Durée | Source | Se déclenche sur | Volume |
| --- | --- | --- | --- | --- |
| `whoosh.wav` | 0.64s | Whoosh | glare sweep, balayage hors champ, transition whip, ouverture du split | 0.2 |
| `pop.wav` | 0.75s | Plop | pop d'une carte/pill/badge/logo (`back.out`) | 0.2 |
| `click.wav` | 0.14s | Mouse Click | clic d'envoi, sélection, flip discret | 0.15 |
| `typing.wav` | 6.5s | clavier | typewriter (caler `data-duration` sur la durée de frappe) | 0.15 |
| `shutter.wav` | 0.83s | CameraShutter | punch-in jump cut, freeze frame | 0.18 |
| `cash.wav` | 3.3s | Cash | chiffre/compteur qui tombe, livrable révélé (Finder), victoire | 0.15 |
| `impact.wav` | 3.5s | Boom Cinematic | mot-clé massif qui claque (CTA), slam du hook | 0.22 |
| `riser.wav` | 5.3s | Riser | montée vers un moment fort (démarrer ~1.3s avant l'impact, trim via data-duration) | 0.15 |
| `horloge.wav` | 9.6s | Horloge | attente, compte à rebours, tension (boucle d'ambiance courte) | 0.10 |
| `buzzer.wav` | 2.9s | Wrong Buzzer | rejet, erreur, « ni X ni Y » (trim 0.5s via data-duration) | 0.13 |
| `whoosh-2.wav` | 0.67s | Whoosh variante | alterner avec whoosh.wav quand deux balayages se suivent | 0.2 |

## Règles

- Clips `<audio>` : `data-start` = timestamp de l'animation soulignée,
  `data-duration` pour trimmer les sons longs, `data-track-index` dédié (≥ 10).
- La voix reste à 1.0. Jamais un SFX au-dessus de 0.25.
- Registre LONG : SFX rares (transitions de section). Registre COURT : chaque
  événement visuel majeur peut sonner, jamais les swaps karaoké.
- Pas plus de 2 SFX simultanés.

