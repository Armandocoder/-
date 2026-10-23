#!/usr/bin/env python3
"""
Master audio de publication (demandé au tournage le 17/08 : « faut s'assurer
que le niveau audio soit bon pour être publié »).

Normalise un rendu aux standards des plateformes (Instagram / TikTok /
YouTube) : -14 LUFS intégré, true peak -1 dBTP, via loudnorm en deux passes
(mesure, puis application des valeurs mesurées). La vidéo est copiée telle
quelle, seul l'audio est réencodé — donc c'est rapide et sans perte d'image.

Un mix brut sort vers -23 LUFS : envoyé tel quel, il paraît deux fois moins
fort que tout ce qui l'entoure dans le fil.

Usage :
    python3 scripts/master.py video-projects/<slug>/renders/reel-v19.mp4
    python3 scripts/master.py --project <slug>        # dernier rendu non-master
    python3 scripts/master.py <src> <dst>
"""
import argparse, glob, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECTS = os.path.join(ROOT, "video-projects")
MASTER_RE = re.compile(r"-master\.(mp4|mov|webm)$", re.I)
TARGET_I, TARGET_TP, TARGET_LRA = -14.0, -1.0, 11.0

# Queue de chaîne, ajoutée le 26/08 en montant le spot naali.
#
# loudnorm travaille et SORT en 192 kHz. Sans rééchantillonnage explicite,
# ffmpeg redescend à 48 kHz juste avant l'encodeur — donc APRÈS le calcul de
# loudnorm — et cette redescente recrée des crêtes inter-échantillons. Mesuré
# sur ce spot : -1,0 dBTP annoncé par loudnorm, +0,2 dBTP dans le fichier livré.
# La source (parole à -26 LUFS, crête -11 dBTP) demande +12 dB de gain, ce qui
# amplifie d'autant le phénomène.
#
# On rééchantillonne donc à 48 kHz NOUS-MÊMES, puis on limite. Le limiteur est
# ainsi le dernier maillon : plus rien derrière lui ne peut relever les crêtes.
# Il ne mord que si loudnorm dépasse, et l'intégré ne bouge que de ~0,1 LU.
#
# Ajout du 16/09 (spot Cherico) : le limiteur tenait -1,4 dBTP en sortie de
# filtre (vérifié en WAV float ET s16), mais le fichier livré ressortait à
# -0,1 dBTP. Bissection : l'encodeur aac natif nourri en float32 depuis la
# chaîne de filtres ajoute +1,3 dB de crête ; nourri en s16, il en ajoute 0,1.
# Un WAV s16 réencodé à part était propre, le même filtre suivi directement de
# l'encodeur ne l'était pas. Donc on force s16 entre le limiteur et l'encodeur.
TAIL = ("aresample=48000,"
        "alimiter=level_in=1:level_out=1:limit=0.85:attack=5:release=60:level=disabled,"
        "aformat=sample_fmts=s16")


def measure(path):
    out = subprocess.run(["ffmpeg", "-v", "info", "-i", path, "-af",
                          f"loudnorm=I={TARGET_I}:TP={TARGET_TP}:LRA={TARGET_LRA}:print_format=json",
                          "-f", "null", "-"], capture_output=True, text=True).stderr
    return json.loads(out[out.rindex("{"):out.rindex("}") + 1])


def newest_source(proj_dir):
    """Le dernier rendu qui n'est pas déjà un master."""
    files = [f for f in glob.glob(os.path.join(proj_dir, "renders", "*.mp4"))
             if not MASTER_RE.search(f)]
    return max(files, key=os.path.getmtime) if files else None


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("src", nargs="?", help="rendu à masteriser")
    ap.add_argument("dst", nargs="?", help="sortie (défaut : <src>-master.mp4)")
    ap.add_argument("--project", help="slug du projet (prend le dernier rendu non-master)")
    args = ap.parse_args()

    if args.project:
        proj_dir = os.path.join(PROJECTS, args.project)
        if not os.path.isdir(proj_dir):
            sys.exit(f"projet inconnu : {args.project}")
        src = newest_source(proj_dir)
        if not src:
            sys.exit(f"aucun rendu à masteriser dans {args.project}")
    elif args.src:
        src = os.path.abspath(args.src)
        if not os.path.isfile(src):
            sys.exit(f"fichier introuvable : {src}")
    else:
        ap.error("donner un chemin de rendu ou --project <slug>")

    dst = os.path.abspath(args.dst) if args.dst else re.sub(r"\.mp4$", "-master.mp4", src)
    if MASTER_RE.search(src):
        print(f"! {os.path.basename(src)} est déjà un master — on le re-masterise quand même")

    print(f"source : {os.path.relpath(src, ROOT)}")
    m = measure(src)
    print(f"avant  : {m['input_i']} LUFS · true peak {m['input_tp']} dBTP · LRA {m['input_lra']}")

    # Le flux vidéo d'un fichier assemblé par le démuxeur concat ne commence
    # pas toujours à zéro : sur la 007 il démarre à 164 (10,7 ms), l'audio à 0.
    # Un lecteur posé sur t=0 n'a alors aucune image à afficher et montre du
    # NOIR — c'est le « la vidéo commence par un écran noir », et
    # c'était déjà vrai sur le master précédent. Aucun remux standard ne le
    # corrige (`-avoid_negative_ts`, `-muxdelay 0`, `-copyts` : essayés,
    # mesurés, sans effet ou pires). Le filtre de flux `setts` réécrit les
    # horodatages sans réencoder.
    decalage = int(subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=start_pts", "-of", "csv=p=0", src],
        capture_output=True, text=True).stdout.strip().rstrip(",") or 0)
    recale = ["-bsf:v", f"setts=ts=TS-{decalage}"] if decalage > 0 else []
    if decalage:
        print(f"recalage : le flux vidéo démarrait à {decalage} — ramené à zéro")

    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src, "-af",
                    (f"loudnorm=I={TARGET_I}:TP={TARGET_TP}:LRA={TARGET_LRA}"
                     f":measured_I={m['input_i']}:measured_TP={m['input_tp']}"
                     f":measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}"
                     f":offset={m['target_offset']},{TAIL}"),
                    "-c:v", "copy", *recale, "-c:a", "aac", "-b:a", "256k",
                    "-ar", "48000", "-movflags", "+faststart", dst], check=True)

    v = measure(dst)
    i, tp = float(v["input_i"]), float(v["input_tp"])
    print(f"après  : {v['input_i']} LUFS · true peak {v['input_tp']} dBTP → {os.path.relpath(dst, ROOT)}")
    ok = abs(i - TARGET_I) <= 1.5 and tp <= -0.8
    print("MASTER OK" if ok else f"ÉCHEC : cible {TARGET_I} LUFS / {TARGET_TP} dBTP non atteinte")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
