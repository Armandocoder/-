#!/usr/bin/env python3
"""Garde-fous de livraison — les défauts qui sont passés au travers, une fois.

Chaque vérification ici existe parce qu'un défaut réel a été livré et vu par
le créateur, pas parce qu'elle semblait prudente. `autoverify.py` vérifie le SON et
la parole ; celui-ci vérifie ce qui se voit et ce que le lint ne dit pas.

    python3 scripts/verif-montage.py --project <slug>
    python3 scripts/verif-montage.py --project <slug> --master

Sortie : une ligne par vérification, code de retour 1 si l'une échoue.
"""
import argparse, glob, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OK, KO, ATT = [], [], []

def ok(m):  OK.append(m);  print('  \033[32m✓\033[0m %s' % m)
def ko(m):  KO.append(m);  print('  \033[31m✗\033[0m %s' % m)
def att(m): ATT.append(m); print('  \033[33m!\033[0m %s' % m)

def ffprobe(args):
    return subprocess.run(['ffprobe', '-v', 'error'] + args,
                          capture_output=True, text=True).stdout.strip()

# --------------------------------------------------------------------------
def doctype(proj):
    """Un <!DOCTYPE html> en tête d'une composition casse data-composition-src.

    Mesuré le 02/09 : deux rendus du même chapitre à un caractère près, avec la
    déclaration toutes les sous-compositions disparaissent du rendu — sans
    erreur, sans avertissement au lint, et le master passait autoverify 20/20.
    Six animations manquaient au fichier livré.

    Seules comptent les compositions qui montent des sous-compositions ou qui en
    sont une : un chapitre rendu seul, sans data-composition-src (la 013 du
    06/10, sept chapitres en documents complets), n'a rien à casser.
    """
    fichiers = glob.glob(os.path.join(proj, 'compositions', '**', '*.html'), recursive=True)
    textes = {f: open(f, encoding='utf-8').read() for f in fichiers}
    montees = set()
    for t in textes.values():
        montees.update(os.path.basename(m) for m in re.findall(r'data-composition-src="([^"]+)"', t))
    coupables, seuls = [], []
    for f, t in textes.items():
        if not t.lstrip()[:400].lower().startswith('<!doctype'):
            continue
        if 'data-composition-src' in t or os.path.basename(f) in montees:
            coupables.append(os.path.relpath(f, proj))
        else:
            seuls.append(os.path.relpath(f, proj))
    if coupables:
        ko('DOCTYPE en tête de composition (casse les sous-compositions) : %s'
           % ', '.join(coupables))
    else:
        ok('aucun DOCTYPE là où il casse des sous-compositions'
           + (' (%d chapitre(s) autonome(s) avec DOCTYPE, sans risque)' % len(seuls) if seuls else ''))

# --------------------------------------------------------------------------
def depart_video(rendu):
    """Le flux vidéo doit démarrer à zéro, sinon le lecteur affiche du noir.

    Le démuxeur concat laisse volontiers la vidéo à start_pts=164 (10,7 ms)
    quand l'audio est à 0 : un lecteur posé sur t=0 n'a aucune image et montre
    du noir. Deux masters livrés avant que ça se voie.
    """
    v = ffprobe(['-select_streams', 'v:0', '-show_entries', 'stream=start_pts',
                 '-of', 'csv=p=0', rendu]).rstrip(',')
    a = ffprobe(['-select_streams', 'a:0', '-show_entries', 'stream=start_pts',
                 '-of', 'csv=p=0', rendu]).rstrip(',')
    if v and int(v) > 0:
        ko('la vidéo démarre à start_pts=%s (audio %s) → image noire au lancement. '
           'Corriger avec -bsf:v setts=ts=TS-%s' % (v, a, v))
    else:
        ok('vidéo et audio démarrent tous deux à zéro')

# --------------------------------------------------------------------------
def bandes_noires(rendu, n=40):
    """Jamais de bande noire à gauche ou à droite, et toujours du 16/9.

    Règle du 02/09 : « fais attention à ce que le ratio soit
    toujours bien de 16/9ème et qu'on ait jamais de bande noire sur la gauche
    et la droite ». On mesure les 10 colonnes de chaque bord.
    """
    w = ffprobe(['-select_streams', 'v:0', '-show_entries', 'stream=width,height',
                 '-of', 'csv=p=0', rendu]).split(',')
    if len(w) >= 2:
        lw, lh = int(w[0]), int(w[1])
        # 16/9 pour les longs, 9/16 pour les verticaux (reels, ads) — ajouté le
        # 07/09 : la première ad verticale passée ici sortait en « ÉCHEC ».
        if abs(lw / lh - 16 / 9) <= 0.005:
            ok('format %dx%d, 16/9 exact' % (lw, lh))
        elif abs(lw / lh - 9 / 16) <= 0.005:
            ok('format %dx%d, 9/16 exact (vertical)' % (lw, lh))
        else:
            ko('format %dx%d, ni 16/9 ni 9/16' % (lw, lh))
    d = float(ffprobe(['-show_entries', 'format=duration', '-of', 'csv=p=0', rendu]) or 0)
    noires = []
    for i in range(n):
        t = d * (i + 0.5) / n
        for bord, x in (('gauche', 0), ('droite', lw - 10)):
            r = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-ss', '%.3f' % t,
                                '-i', rendu, '-frames:v', '1',
                                '-vf', 'crop=10:%d:%d:0,format=gray' % (lh, x),
                                '-f', 'rawvideo', '-'], capture_output=True).stdout
            if r and sum(r) / len(r) < 3.0:
                noires.append((round(t, 1), bord))
    if noires:
        ko('bande noire sur %d image(s) : %s' % (len(noires), noires[:6]))
    else:
        ok('aucune bande noire sur %d images échantillonnées' % n)

# --------------------------------------------------------------------------
def eclats(proj):
    """Aucun plan trop court ET isolé dans la source.

    Deux éclats de 0,12 s et 0,33 s, pris à deux endroits sans rapport du rush,
    ont survécu jusqu'au master livré. Le critère « ne porte aucun mot du
    transcript » ne les attrapait pas : le transcript couvre presque toute la
    timeline, un éclat de 0,12 s chevauche forcément un mot.
    """
    edls = sorted(glob.glob(os.path.join(proj, 'assets', 'rushes', '*-edl-v2.json')) +
                  glob.glob(os.path.join(proj, 'assets', 'rushes', '*-assemblage-v2.json')))
    if not edls:
        att('aucune EDL v2 trouvée — vérification des éclats non applicable')
        return
    total = 0
    for p in edls:
        e = json.load(open(p))
        par = {}
        for x in e:
            f, a, b = (x[0], x[1], x[2]) if len(x) == 3 else (0, x[0], x[1])
            par.setdefault(f, []).append((a, b))
        for v in par.values():
            for i, (a, b) in enumerate(v):
                if b - a >= 0.60: continue
                av = v[i-1][1] if i > 0 else -1e9
                ap = v[i+1][0] if i + 1 < len(v) else 1e9
                if (a - av > 0.40) and (ap - b > 0.40):
                    total += 1
                    if total <= 5:
                        ko('éclat isolé de %.2f s dans %s (source %.2f)'
                           % (b - a, os.path.basename(p), a))
    if total == 0:
        ok('aucun éclat isolé dans %d EDL' % len(edls))
    else:
        ko('%d éclat(s) au total' % total)

# --------------------------------------------------------------------------
def cartes_visibles(proj):
    """Toute sous-composition déclarée doit se VOIR dans le rendu du chapitre.

    Filet de sécurité derrière la vérification du DOCTYPE : si une carte ne
    rend pas pour une autre raison, l'image au milieu de sa fenêtre ressemble
    à celle d'avant son entrée. On compare, et on alerte — c'est un
    avertissement, pas un échec : un chapitre peut légitimement peu changer.
    """
    vus = 0
    for f in glob.glob(os.path.join(proj, 'compositions', '*.html')):
        base = os.path.splitext(os.path.basename(f))[0]
        rendu = os.path.join(proj, 'renders', base + '-std.mp4')
        if not os.path.exists(rendu): continue
        html = open(f, encoding='utf-8').read()
        for m in re.finditer(r'data-composition-src="[^"]*/([^"/]+)\.html"\s*\n?\s*'
                             r'data-start="([\d.]+)"\s+data-duration="([\d.]+)"', html):
            nom, t0, dur = m.group(1), float(m.group(2)), float(m.group(3))
            vus += 1
            av = max(0.0, t0 - 1.5)
            ded = t0 + dur * 0.5
            def gris(t):
                return subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-ss', '%.3f' % t,
                    '-i', rendu, '-frames:v', '1', '-vf', 'scale=48:27,format=gray',
                    '-f', 'rawvideo', '-'], capture_output=True).stdout
            a, b = gris(av), gris(ded)
            if len(a) != len(b) or not a:
                att('%s : image illisible pour %s' % (base, nom)); continue
            ecart = sum(abs(x - y) for x, y in zip(a, b)) / len(a)
            if ecart < 12:
                att('%s : la carte « %s » ne change presque rien à l\'image '
                    '(écart %.1f) — vérifier qu\'elle rend' % (base, nom, ecart))
            else:
                ok('%s : carte « %s » visible (écart %.0f)' % (base, nom, ecart))
    if not vus:
        att('aucune sous-composition déclarée dans les chapitres rendus')

# --------------------------------------------------------------------------
def dernier_rendu(proj, master):
    mot = 'master' if master else ''
    c = [p for p in glob.glob(os.path.join(proj, 'renders', '*.mp4'))
         if (mot in os.path.basename(p)) and 'egalise' not in p]
    if not c: sys.exit('aucun rendu %s dans %s/renders' % (mot or '', proj))
    return max(c, key=os.path.getmtime)

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--project', required=True)
    ap.add_argument('--master', action='store_true')
    ap.add_argument('rendu', nargs='?')
    a = ap.parse_args()
    proj = os.path.join(ROOT, 'video-projects', a.project)
    rendu = a.rendu or dernier_rendu(proj, a.master)
    print('projet : %s\nrendu  : %s\n' % (a.project, os.path.relpath(rendu, ROOT)))
    print('— ce que le lint ne dit pas')
    doctype(proj)
    eclats(proj)
    print('\n— ce qui se voit')
    depart_video(rendu)
    bandes_noires(rendu)
    print('\n— les animations')
    cartes_visibles(proj)
    print('\n%s — %d ok, %d problème(s), %d avertissement(s)'
          % ('ÉCHEC' if KO else 'PASS', len(OK), len(KO), len(ATT)))
    sys.exit(1 if KO else 0)
