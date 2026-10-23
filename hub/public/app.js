/* Editing OS — le front.
   Un tournage porte des livrables, chaque livrable a un état lisible.
   Le disque déclare, le front affiche : rien n'est deviné ici. */
(function () {
  "use strict";

  var view = document.getElementById("view");
  var toastEl = document.getElementById("toast");

  // Ordre d'urgence : qui attend quoi. « retours » = le tour de Claude,
  // « à relire » = le tour.
  var ORDER = ["retours", "a-relire", "en-montage", "a-monter", "valide", "publie", "abandonne"];
  var COUNTERS = ["a-relire", "retours", "en-montage", "a-monter", "valide", "publie"];
  var LIBELLES = {
    "retours": "retours chez Claude", "a-relire": "à relire", "en-montage": "en montage",
    "a-monter": "à monter", "valide": "validé", "publie": "publié", "abandonne": "abandonné"
  };
  var TYPES = ["reel", "pub", "ugc", "youtube", "motion", "demo"];
  var DESTINATIONS = ["instagram", "meta-ads", "youtube", "skool", "linkedin", "client", "interne"];
  var ACTION_GROUPS = [
    ["montage", "Pendant le montage", "à chaque itération, tant qu'on corrige"],
    ["publication", "Pour publier", "quand le montage est validé, c'est le master qu'on envoie"]
  ];

  var stateCache = null;      // /api/state
  var compsCache = null;      // /api/compositions
  var ACTIONS = null;         // /api/actions
  var filters = { etat: null, type: "", q: "", archives: false, attente: false };
  var openLv = {};            // slug -> { livrableId: bool } sections dépliées
  var jobTimer = null, jobSince = 0, jobBusy = false;

  // =====================================================================
  // Réseau
  // =====================================================================
  function api(path) {
    return fetch(path, { headers: { accept: "application/json" } }).then(function (r) {
      if (!r.ok) {
        return r.json().catch(function () { return { error: "HTTP " + r.status }; })
          .then(function (b) { throw new Error(b.error || "HTTP " + r.status); });
      }
      return r.json();
    });
  }
  function postJSON(path, body, method) {
    return fetch(path, {
      method: method || "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; })
        .then(function (b) { throw new Error(b.error || "HTTP " + r.status); });
      return r.json();
    });
  }
  function loadState(force) {
    if (stateCache && !force) return Promise.resolve(stateCache);
    return api("/api/state").then(function (s) {
      stateCache = s;
      if (s.libelles) Object.keys(s.libelles).forEach(function (k) { LIBELLES[k] = s.libelles[k]; });
      if (s.types && s.types.length) TYPES = s.types;
      if (s.destinations && s.destinations.length) DESTINATIONS = s.destinations;
      return s;
    });
  }
  function loadActions() {
    if (ACTIONS) return Promise.resolve(ACTIONS);
    return api("/api/actions").then(function (r) { ACTIONS = r.actions || []; return ACTIONS; })
      .catch(function () { ACTIONS = []; return ACTIONS; });
  }
  function loadCompositions(force) {
    if (compsCache && !force) return Promise.resolve(compsCache);
    return api("/api/compositions").then(function (c) { compsCache = c; return c; });
  }

  // =====================================================================
  // Formats
  // =====================================================================
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtBytes(n) {
    if (n == null || n === 0) return "0 o";
    var u = ["o", "Ko", "Mo", "Go", "To"], i = Math.floor(Math.log(n) / Math.log(1024));
    i = Math.min(i, u.length - 1);
    var v = n / Math.pow(1024, i);
    return (v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)).toString().replace(".", ",") + " " + u[i];
  }
  function fmtDuration(ms) {
    if (ms == null) return "";
    var s = Math.round(ms / 1000), m = Math.floor(s / 60);
    s = s % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }
  function relTime(ms) {
    if (ms == null) return "inconnu";
    var diff = Date.now() - ms;
    if (diff < 0) diff = 0;
    var s = Math.floor(diff / 1000);
    if (s < 45) return "à l'instant";
    var m = Math.floor(s / 60);
    if (m < 1) return "à l'instant";
    if (m < 60) return "il y a " + m + " min";
    var h = Math.floor(m / 60);
    if (h < 24) return "il y a " + h + " h";
    var d = Math.floor(h / 24);
    if (d < 30) return "il y a " + d + (d === 1 ? " jour" : " jours");
    var mo = Math.floor(d / 30);
    if (mo < 12) return "il y a " + mo + " mois";
    var y = Math.floor(mo / 12);
    return "il y a " + y + " an" + (y > 1 ? "s" : "");
  }
  // « 13 oct. » : la date du dossier, sans l'année (elle est dans le slug).
  function fmtDayShort(iso) {
    if (!iso) return "";
    var d = new Date(String(iso).slice(0, 10) + "T12:00:00");
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  }
  function fmtDayLong(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  }
  function fmtClock(t) {
    var s = Math.floor(t || 0);
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }
  function baseName(file) { return String(file || "").replace(/^.*\//, "").replace(/\.[^.]+$/, ""); }
  // « v8 » depuis renders/reel-arcads-v8-master.mp4
  function versionOf(file) {
    var m = /[-_]v(\d+)/i.exec(baseName(file));
    return m ? "v" + parseInt(m[1], 10) : null;
  }
  // La version sans ses suffixes de qualité : deux rendus de la même version
  // (draft puis master) partagent cette clé.
  function versionKey(file) {
    var b = baseName(file);
    var m = /^(.*?[-_]v\d+)/i.exec(b);
    if (m) return m[1].toLowerCase();
    return b.replace(/-(master|draft|final|mobile|standard|high|\d{3,4}p)$/gi, "").toLowerCase();
  }
  // Le préfixe d'un rendu : son nom de base sans version ni suffixe.
  function prefixOf(file) {
    var b = baseName(file);
    b = b.replace(/[-_]v\d+.*$/i, "");
    b = b.replace(/-(master|draft|final|mobile|standard|high|\d{3,4}p)$/gi, "");
    b = b.replace(/[-_]\d{8,}.*$/, "");
    return b;
  }
  function plural(n, un, des) { return n + " " + (n > 1 ? des : un); }
  function libelle(etat) { return LIBELLES[etat] || etat || "inconnu"; }
  function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }
  function enc(s) { return encodeURIComponent(s); }
  function wsUrl(dossier, file) {
    return "/workspace/video-projects/" + enc(dossier) + "/" + String(file).split("/").map(enc).join("/");
  }
  function thumbUrl(dossier, file, mtime, kind) {
    return "/api/thumb/" + enc(dossier) + "?file=" + enc(file) + (kind ? "&kind=" + kind : "") + "&v=" + (mtime || 0);
  }
  function reviewUrl(dossier, file) {
    return "/review.html?project=" + enc(dossier) + "&render=" + enc(file);
  }
  function rank(etat) { var i = ORDER.indexOf(etat); return i === -1 ? 99 : i; }

  // =====================================================================
  // Petits composants
  // =====================================================================
  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    requestAnimationFrame(function () { toastEl.classList.add("show"); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
      setTimeout(function () { toastEl.hidden = true; }, 220);
    }, 2600);
  }
  function copyText(txt, done) {
    var ok = function () { toast(done || "Copié"); };
    var ko = function () {
      try {
        var ta = document.createElement("textarea");
        ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); ok();
      } catch (e) { toast("Impossible de copier"); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, ko);
    else ko();
  }
  function h(html) { view.innerHTML = html; window.scrollTo(0, 0); }
  function showError(e) {
    h('<div class="error-box"><b>Le serveur n\'a pas répondu comme prévu.</b><br><code>' + esc(e && e.message || e) + "</code>" +
      '<p style="margin:10px 0 0"><a href="#/">Retour aux projets</a></p></div>');
  }
  function stateHTML(etat, extraClass) {
    return '<span class="state st-' + esc(etat) + (extraClass ? " " + extraClass : "") + '"><span class="sdot st-' + esc(etat) + '"></span>' + esc(libelle(etat)) + "</span>";
  }
  function typeBadge(t) { return t ? '<span class="badge type type-' + esc(t) + '">' + esc(t) + "</span>" : ""; }

  // Une confirmation avant tout geste qui touche aux fichiers. On nomme
  // toujours ce qui bouge.
  function confirmDialog(title, bodyHTML, okLabel, danger) {
    return new Promise(function (resolve) {
      var back = document.createElement("div");
      back.className = "player-back";
      back.innerHTML =
        '<div class="confirm-box" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
          '<div class="confirm-head">' + esc(title) + "</div>" +
          '<div class="confirm-body">' + bodyHTML + "</div>" +
          '<div class="confirm-acts">' +
            '<button type="button" class="btn" data-no="1">Annuler</button>' +
            '<button type="button" class="btn ' + (danger ? "btn-ink" : "btn-primary") + '" data-yes="1">' + esc(okLabel) + "</button>" +
          "</div></div>";
      function close(v) { document.removeEventListener("keydown", onKey); back.remove(); resolve(v); }
      function onKey(e) { if (e.key === "Escape") close(false); }
      back.addEventListener("click", function (e) {
        if (e.target === back || e.target.getAttribute("data-no")) close(false);
        else if (e.target.getAttribute("data-yes")) close(true);
      });
      document.body.appendChild(back);
      document.addEventListener("keydown", onKey);
      var ok = back.querySelector("[data-yes]");
      if (ok) ok.focus();
    });
  }
  // Un petit formulaire : fields = [{name, label, type:'text'|'select', options:[{v,l}], value, placeholder}]
  function formDialog(title, fields, okLabel, intro) {
    return new Promise(function (resolve) {
      var back = document.createElement("div");
      back.className = "player-back";
      var body = (intro ? "<p>" + intro + "</p>" : "") + fields.map(function (f) {
        var ctl;
        if (f.type === "select") {
          ctl = '<select class="select" name="' + esc(f.name) + '">' + (f.options || []).map(function (o) {
            return '<option value="' + esc(o.v) + '"' + (String(o.v) === String(f.value == null ? "" : f.value) ? " selected" : "") + ">" + esc(o.l) + "</option>";
          }).join("") + "</select>";
        } else {
          ctl = '<input class="input" type="text" name="' + esc(f.name) + '" value="' + esc(f.value == null ? "" : f.value) + '" placeholder="' + esc(f.placeholder || "") + '">';
        }
        return '<div class="field"><label>' + esc(f.label) + "</label>" + ctl + "</div>";
      }).join("");
      back.innerHTML =
        '<form class="confirm-box" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
          '<div class="confirm-head">' + esc(title) + "</div>" +
          '<div class="confirm-body">' + body + "</div>" +
          '<div class="confirm-acts">' +
            '<button type="button" class="btn" data-no="1">Annuler</button>' +
            '<button type="submit" class="btn btn-primary">' + esc(okLabel) + "</button>" +
          "</div></form>";
      var form = back.querySelector("form");
      function close(v) { document.removeEventListener("keydown", onKey); back.remove(); resolve(v); }
      function onKey(e) { if (e.key === "Escape") close(null); }
      back.addEventListener("click", function (e) { if (e.target === back || e.target.getAttribute("data-no")) close(null); });
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var out = {};
        fields.forEach(function (f) { var el = form.elements[f.name]; out[f.name] = el ? el.value : ""; });
        close(out);
      });
      document.body.appendChild(back);
      document.addEventListener("keydown", onKey);
      var first = form.querySelector("input, select");
      if (first) first.focus();
    });
  }

  // =====================================================================
  // Vignettes (reprises de la v1 : une image par carte, la boucle au survol)
  // =====================================================================
  function thumbHTML(ap, alt) {
    var orient = ap && ap.orientation ? ap.orientation : "horizontal";
    if (!ap || !ap.file) {
      return '<div class="card-thumb none ' + esc(orient) + '"><span>aucun rendu</span></div>';
    }
    var poster = thumbUrl(ap.dossier, ap.file, ap.mtime);
    var loop = thumbUrl(ap.dossier, ap.file, ap.mtime, "loop");
    var tag = ap.master ? "master" : (versionOf(ap.file) || "rendu");
    return '<div class="card-thumb ' + esc(orient) + '" data-loop="' + esc(loop) + '">' +
      '<img class="th-bg" src="' + esc(poster) + '" alt="" aria-hidden="true" loading="lazy">' +
      '<img class="th-img" src="' + esc(poster) + '" alt="' + esc(alt || "") + '" loading="lazy">' +
      '<span class="th-tag">' + esc(tag) + "</span>" +
      (ap.ratio ? '<span class="th-tag right">' + esc(ap.ratio) + "</span>" : "") +
      "</div>";
  }
  function wireThumbs(scope) {
    var host = scope || document;
    Array.prototype.forEach.call(host.querySelectorAll(".card-thumb[data-loop]"), function (t) {
      var img = t.querySelector(".th-img"), bg = t.querySelector(".th-bg");
      if (!img) return;
      // en rafale (29 cartes), le serveur répond parfois 404 le temps
      // d'extraire l'image : on retente une fois avant de déclarer la vignette cassée
      var tries = 0, src0 = img.getAttribute("src");
      img.onerror = function () {
        if (tries++ < 1) { setTimeout(function () { img.src = src0 + "&r=" + tries; if (bg) bg.src = img.src; }, 1500); return; }
        t.classList.add("broken");
      };
      if (bg) bg.onerror = function () { bg.style.display = "none"; };
      var loop = t.getAttribute("data-loop"), poster = img.getAttribute("src"), loaded = false;
      var card = t.closest(".card") || t;
      card.addEventListener("mouseenter", function () {
        if (loaded || t.classList.contains("broken")) return;
        loaded = true;
        var pre = new Image();
        pre.onload = function () { img.src = loop; t.classList.add("live"); };
        pre.onerror = function () { img.src = poster; };
        pre.src = loop;
      });
    });
  }

  // =====================================================================
  // Écran Tournages
  // =====================================================================
  function openCount(r) { r = r || {}; return Math.max(0, (r.open || 0) - (r.depasses || 0)); }

  function livLineHTML(l) {
    var v = l.derniere ? versionOf(l.derniere.file) : null;
    var open = openCount(l.retours), old = (l.retours && l.retours.depasses) || 0;
    return '<div class="lv-line" title="' + esc(libelle(l.etat)) + '">' +
      '<span class="sdot st-' + esc(l.etat) + '"></span>' +
      '<span class="nm">' + esc(l.nom || l.id) + "</span>" +
      '<span class="meta">' + (v ? '<span class="tnum">' + esc(v) + "</span>" : "") +
        (open ? '<span class="open">' + plural(open, "retour", "retours") + " à traiter</span>" : "") +
        (old ? '<span class="old">' + plural(old, "retour plus ancien", "retours plus anciens") + (v ? " que la " + esc(v) : "") + "</span>" : "") +
      "</span></div>";
  }

  function cardHTML(t) {
    var st = t.etat || "a-monter";
    var lvs = (t.livrables || []).slice().sort(function (a, b) { return rank(a.etat) - rank(b.etat); });
    var multi = lvs.length > 1;
    var single = lvs[0];
    var body;
    if (multi) {
      var shown = lvs.slice(0, 6);
      body = '<div class="lv-lines">' + shown.map(livLineHTML).join("") +
        (lvs.length > 6 ? '<div class="lv-more">et ' + plural(lvs.length - 6, "autre livrable", "autres livrables") + "</div>" : "") + "</div>";
    } else {
      body = "";
    }
    var foot = "";
    if (!multi && single) {
      var v = single.derniere ? versionOf(single.derniere.file) : null;
      var open = openCount(single.retours), old = (single.retours && single.retours.depasses) || 0;
      foot = '<div class="lv-wait">' + stateHTML(single.etat) +
        (v ? '<span class="badge soft tnum">' + esc(v) + "</span>" : "") +
        (open ? '<span class="badge open">' + plural(open, "retour", "retours") + " à traiter</span>" : "") +
        (old ? '<span class="badge old">' + plural(old, "plus ancien", "plus anciens") + (v ? " que la " + esc(v) : "") + "</span>" : "") +
        "</div>";
    } else {
      foot = stateHTML(st);
    }
    return '<a class="card is-' + esc(st) + '" href="#/tournage/' + enc(t.slug) + '">' +
      thumbHTML(t.apercu, "Aperçu de " + (t.titre || t.slug)) +
      '<div class="card-body">' +
        '<div class="card-top"><div class="card-name">' + esc(t.titre || t.slug) + "</div></div>" +
        '<div class="card-sub">' +
          (t.date ? "<span>" + esc(fmtDayShort(t.date)) + "</span>" : "") +
          typeBadge(t.type) +
          (multi ? '<span class="dot-sep"></span><span>' + plural(lvs.length, "livrable", "livrables") + "</span>" : "") +
          (t.migration && t.migration.a_valider ? '<span class="badge verify" title="La déclaration vient d\'un script, pas de toi">à vérifier</span>' : "") +
          (t.archive ? '<span class="badge soft">archive</span>' : "") +
        "</div>" +
        body +
        '<div class="card-foot">' + foot + '<span class="when">' + esc(relTime(t.lastTouched)) + "</span></div>" +
      "</div></a>";
  }

  function matches(t) {
    if (t.archive && !filters.archives) return false;
    var lvs = t.livrables || [];
    if (filters.attente && !lvs.some(function (l) { return l.etat === "a-relire"; })) return false;
    if (filters.etat && !lvs.some(function (l) { return l.etat === filters.etat; }) && t.etat !== filters.etat) return false;
    if (filters.type && t.type !== filters.type) return false;
    if (filters.q) {
      var q = filters.q.toLowerCase();
      if ((t.titre || "").toLowerCase().indexOf(q) === -1 && (t.slug || "").toLowerCase().indexOf(q) === -1) return false;
    }
    return true;
  }

  function renderTournages() {
    h('<div class="view-head"><div><h1 class="view-title">Projets</h1><div class="view-sub">chargement…</div></div></div>');
    loadState().then(drawTournages).catch(showError);
  }

  function drawTournages(s) {
    var all = (s.tournages || []).slice().sort(function (a, b) { return (b.lastTouched || 0) - (a.lastTouched || 0); });
    var par = (s.summary && s.summary.parEtat) || {};
    var counters = COUNTERS.map(function (k) {
      var n = par[k] || 0;
      return '<button type="button" class="counter' + (k === "a-relire" ? " hero" : "") + (filters.etat === k ? " on" : "") + (n === 0 ? " zero" : "") +
        '" data-etat="' + k + '"><span class="sdot st-' + k + '"></span><span class="num tnum">' + n + "</span>" + esc(libelle(k)) + "</button>";
    }).join("");
    var nArch = all.filter(function (t) { return t.archive; }).length;
    h('<div class="view-head"><div>' +
        '<h1 class="view-title">Tes <span class="serif">projets</span><span class="count" id="count"></span></h1>' +
        '<div class="view-sub">' + plural(s.summary.tournages || all.length, "tournage", "tournages") + " · " + plural(s.summary.livrables || 0, "livrable", "livrables") +
          " · " + esc(fmtBytes(s.summary.renderBytes)) + " de rendus · relevé " + esc(relTime(s.summary.scannedAt)) + "</div>" +
      "</div></div>" +
      '<div class="counters">' + counters + "</div>" +
      '<div class="filters">' +
        '<input class="input" id="f-q" type="search" placeholder="Chercher un titre ou un dossier" value="' + esc(filters.q) + '">' +
        '<select class="select" id="f-type"><option value="">Tous les types</option>' + TYPES.map(function (t) {
          return '<option value="' + esc(t) + '"' + (filters.type === t ? " selected" : "") + ">" + esc(t) + "</option>";
        }).join("") + "</select>" +
        '<label class="switch' + (filters.attente ? " on" : "") + '"><input type="checkbox" id="f-attente"' + (filters.attente ? " checked" : "") + "> seulement les vidéos qui m'attendent</label>" +
        '<span class="spacer"></span>' +
        '<label class="switch' + (filters.archives ? " on" : "") + '"><input type="checkbox" id="f-arch"' + (filters.archives ? " checked" : "") + "> Voir les archives" + (nArch ? " (" + nArch + ")" : "") + "</label>" +
      "</div>" +
      '<div id="sections"></div>');

    Array.prototype.forEach.call(view.querySelectorAll(".counter"), function (b) {
      b.onclick = function () {
        var k = b.getAttribute("data-etat");
        filters.etat = filters.etat === k ? null : k;
        filters.attente = false;
        drawTournages(s);
      };
    });
    var q = document.getElementById("f-q"), qt = null;
    q.oninput = function () { filters.q = q.value; clearTimeout(qt); qt = setTimeout(function () { drawSections(all); }, 120); };
    document.getElementById("f-type").onchange = function () { filters.type = this.value; drawSections(all); };
    document.getElementById("f-attente").onchange = function () { filters.attente = this.checked; if (this.checked) filters.etat = null; drawTournages(s); };
    document.getElementById("f-arch").onchange = function () { filters.archives = this.checked; drawTournages(s); };
    drawSections(all);
  }

  function drawSections(all) {
    var box = document.getElementById("sections");
    if (!box) return;
    var kept = all.filter(matches);
    var count = document.getElementById("count");
    if (count) count.textContent = kept.length === all.length ? "" : kept.length + " / " + all.length;
    var cut = Date.now() - 14 * 86400000;
    var recent = kept.filter(function (t) { return (t.lastTouched || 0) >= cut; });
    var before = kept.filter(function (t) { return (t.lastTouched || 0) < cut; });
    function section(title, list) {
      if (!list.length) return "";
      return '<div class="sec-title">' + esc(title) + '<span class="n">' + list.length + "</span></div>" +
        '<div class="grid">' + list.map(cardHTML).join("") + "</div>";
    }
    var html = section("Cette semaine et la précédente", recent) + section("Avant", before);
    if (!kept.length) {
      html = '<div class="empty">' + (!all.length ? "Pas encore de projet. Ouvre Claude Code dans ce dossier et lance <code>/reel-format</code> : ton premier projet apparaîtra ici tout seul, avec ses rendus et ses retours."
        : filters.attente ? "Rien ne t'attend. Tout est chez Claude, validé ou publié." : "Aucun projet ne correspond à ces filtres.") + "</div>";
    }
    box.innerHTML = html;
    wireThumbs(box);
  }

  // =====================================================================
  // Écran Tournage
  // =====================================================================
  var current = null; // TournageDetail affiché

  function renderTournage(slug) {
    h('<div class="crumbs"><a href="#/">Tournages</a><span>›</span><span>' + esc(slug) + '</span></div><div class="view-sub">chargement…</div>');
    Promise.all([api("/api/tournage/" + enc(slug)), loadActions(), loadState()])
      .then(function (r) { current = r[0]; drawTournage(r[0]); })
      .catch(showError);
  }
  function refreshTournage(slug) {
    stateCache = null;
    return api("/api/tournage/" + enc(slug)).then(function (d) { current = d; drawTournage(d); return d; }).catch(function (e) { toast(e.message || "échec"); });
  }
  function applyDetail(d) { current = d; stateCache = null; drawTournage(d); }

  function phraseHTML(l) {
    var v = l.derniere ? versionOf(l.derniere.file) : null;
    var open = openCount(l.retours);
    switch (l.etat) {
      case "a-relire": return "À relire : à toi de regarder " + (v ? "la <span class=\"serif\">" + esc(v) + "</span>" : "la dernière version");
      case "retours": return "Retours chez Claude : " + plural(open, "retour", "retours") + " à traiter" + (v ? " sur la " + esc(v) : "");
      case "en-montage": return l.derniere ? "En montage : Claude travaille à la version suivante" : "En montage : la composition existe, pas encore de rendu";
      case "a-monter": return "À monter : aucun rendu pour l'instant";
      case "valide": return "Validé" + (l.valide && l.valide.le ? " le " + esc(fmtDayShort(l.valide.le)) : "") + (l.valide && l.valide.version ? " (" + esc(versionOf(l.valide.version) || baseName(l.valide.version)) + ")" : "");
      case "publie": return "Publié" + (l.publie && l.publie.le ? " le " + esc(fmtDayShort(l.publie.le)) : "") + (l.publie && l.publie.ou ? " sur " + esc(l.publie.ou) : "");
      case "abandonne": return "Abandonné";
      default: return esc(cap(libelle(l.etat)));
    }
  }

  function lotsFor(d, l) {
    var lots = (d.retours_fichiers && d.retours_fichiers[l.dossier]) || [];
    var pref = (l.prefixes || []).map(function (p) { return String(p).toLowerCase(); });
    return lots.filter(function (f) {
      if (!pref.length) return true;
      var r = String(f.render || "").toLowerCase();
      return pref.some(function (p) { return r.indexOf(p) === 0; });
    });
  }

  function newestOf(rendus) {
    var n = null;
    (rendus || []).forEach(function (r) { if (!n || (r.mtime || 0) > (n.mtime || 0)) n = r; });
    return n;
  }

  function verHTML(d, l, r, isRef) {
    var v = versionOf(r.file);
    var rt = r.retours || {};
    return '<div class="ver' + (isRef ? " ref" : "") + '">' +
      '<div class="f">' + esc(r.file.replace(/^renders\//, "")) +
        (r.master ? '<span class="badge master">master</span>' : "") +
        (rt.total ? '<span class="badge ' + (rt.open ? "open" : "soft") + '">' + plural(rt.total, "retour", "retours") + (rt.open ? " (" + rt.open + " à faire)" : " traités") + "</span>" : "") +
      "</div>" +
      '<div class="a">' +
        '<a class="btn btn-xs" target="_blank" rel="noopener" href="' + esc(reviewUrl(r.dossier || l.dossier, r.file)) + '">Relire</a>' +
        '<button type="button" class="btn btn-xs" data-copy="' + esc((d.absPaths[r.dossier || l.dossier] || "") + "/" + r.file) + '">Copier le chemin</button>' +
      "</div>" +
      '<div class="m"><span>' + esc(relTime(r.mtime)) + "</span><span>" + esc(fmtBytes(r.bytes)) + "</span>" +
        (r.durationMs ? "<span>" + esc(fmtDuration(r.durationMs)) + "</span>" : "") +
        (r.width ? "<span>" + r.width + "×" + r.height + "</span>" : "") + (v ? "<span>" + esc(v) + "</span>" : "") +
      "</div></div>";
  }

  function lotHTML(d, l, f, isOld, refV) {
    var n = f.notes || [];
    var open = n.filter(function (x) { return !x.done; }).length;
    var key = esc(l.dossier) + "|" + esc(f.render);
    return '<div class="fb-lot' + (f.done ? " done" : "") + (isOld ? " old" : "") + '" data-lot="' + key + '">' +
      '<div class="fb-lot-head"><span class="r">' + esc(f.render) + "</span>" +
        '<span class="c">' + plural(n.length, "retour", "retours") + (f.done ? " · traité" : open ? " · " + open + " à faire" : "") + "</span>" +
        (isOld ? '<span class="old-tag">plus ancien' + (n.length > 1 ? "s" : "") + " que la " + esc(refV) + "</span>" : "") +
        '<button type="button" class="btn btn-xs fb-all" data-dossier="' + esc(l.dossier) + '" data-render="' + esc(f.render) + '" data-done="' + (f.done ? "0" : "1") + '">' + (f.done ? "Rouvrir" : "Tout marquer traité") + "</button>" +
      "</div>" +
      n.map(function (x) {
        return '<label class="fb-note' + (x.done ? " done" : "") + '"><input type="checkbox" class="fb-one" data-dossier="' + esc(l.dossier) + '" data-render="' + esc(f.render) + '" data-id="' + esc(x.id) + '"' + (x.done ? " checked" : "") + ">" +
          '<span class="t' + (x.general ? " g" : "") + '">' + (x.general ? "note" : esc(fmtClock(x.t))) + "</span>" +
          '<span class="x"></span></label>';
      }).join("") +
      "</div>";
  }

  function videoHTML(dossier, r) {
    return '<video controls preload="none" playsinline poster="' + esc(thumbUrl(dossier, r.file, r.mtime)) + '" src="' + esc(wsUrl(dossier, r.file)) + '"></video>';
  }
  function mountVideo(sec) {
    var slot = sec.querySelector(".lv-video-slot");
    if (!slot) return;
    slot.outerHTML = videoHTML(slot.getAttribute("data-dossier"), { file: slot.getAttribute("data-file"), mtime: slot.getAttribute("data-mtime") });
  }

  function lvHTML(d, l, open) {
    var rendus = d.rendus && d.rendus[l.id] ? d.rendus[l.id] : [];
    var der = l.derniere;
    var orient = der && der.orientation ? der.orientation : "horizontal";
    var v = der ? versionOf(der.file) : null;
    var newest = newestOf(rendus);
    var refKey = newest ? versionKey(newest.file) : null;
    var refV = newest ? (versionOf(newest.file) || baseName(newest.file)) : "";
    var lots = lotsFor(d, l);
    var lotsNow = [], lotsOld = [];
    lots.forEach(function (f) {
      var old = newest && (f.updatedAt || 0) < (newest.mtime || 0) && versionKey(f.render) !== refKey;
      (old ? lotsOld : lotsNow).push(f);
    });
    var openNow = lotsNow.reduce(function (n, f) { return n + (f.done ? 0 : (f.notes || []).filter(function (x) { return !x.done; }).length); }, 0);
    var declared = !!l.etat_declare;

    // le lecteur n'est créé qu'à l'ouverture de la section : sur un tournage à
    // 29 livrables, demander 29 affiches d'un coup fait rater des vignettes
    var player = der
      ? (open ? videoHTML(l.dossier, der) : '<div class="lv-video-slot" data-dossier="' + esc(l.dossier) + '" data-file="' + esc(der.file) + '" data-mtime="' + esc(der.mtime) + '"></div>')
      : '<div class="none">Aucun rendu pour ce livrable' + (l.composition ? "<br><small>composition : " + esc(l.composition) + "</small>" : "") + "</div>";

    var acts =
      (der ? '<a class="btn ' + (l.etat === "a-relire" ? "btn-primary" : "") + '" target="_blank" rel="noopener" href="' + esc(reviewUrl(l.dossier, der.file)) + '">Relire cette version</a>' : "") +
      (der && l.etat !== "valide" && l.etat !== "publie" ? '<button type="button" class="btn" data-act="valider" data-lv="' + esc(l.id) + '">Valider cette version</button>' : "") +
      (l.etat !== "publie" ? '<button type="button" class="btn" data-act="publier" data-lv="' + esc(l.id) + '">Marquer publié</button>' : "") +
      (l.etat !== "abandonne" ? '<button type="button" class="btn btn-ghost btn-danger" data-act="abandonner" data-lv="' + esc(l.id) + '">Abandonner</button>' : "") +
      (declared ? '<button type="button" class="btn btn-ghost" data-act="deduit" data-lv="' + esc(l.id) + '">Revenir à l\'état déduit</button>' : "") +
      '<button type="button" class="btn btn-ghost" data-act="modifier" data-lv="' + esc(l.id) + '">Modifier</button>';

    var shownVers = rendus.slice(0, 5), moreVers = rendus.slice(5);
    var versions = rendus.length
      ? shownVers.map(function (r) { return verHTML(d, l, r, der && r.file === der.file); }).join("") +
        (moreVers.length ? '<div class="ver-hidden" hidden>' + moreVers.map(function (r) { return verHTML(d, l, r, false); }).join("") + "</div>" +
          '<div class="ver-more"><button type="button" class="btn-link ver-toggle">Voir les ' + moreVers.length + " autres versions</button></div>" : "")
      : '<div class="faint">Aucune version.</div>';

    var retours = (lotsNow.length || lotsOld.length)
      ? lotsNow.map(function (f) { return lotHTML(d, l, f, false, refV); }).join("") +
        (lotsOld.length ? '<div class="sec-title" style="margin:14px 0 6px;font-size:11px">Plus anciens que la ' + esc(refV) + '<span class="n">' + lotsOld.length + "</span></div>" + lotsOld.map(function (f) { return lotHTML(d, l, f, true, refV); }).join("") : "")
      : '<div class="faint">Aucun retour sur ce livrable.</div>';

    return '<section class="lv is-' + esc(l.etat) + (open ? " open" : "") + '" data-lv="' + esc(l.id) + '">' +
      '<div class="lv-head" role="button" tabindex="0" aria-expanded="' + (open ? "true" : "false") + '">' +
        '<svg class="chev" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 4l6 6-6 6"/></svg>' +
        "<div><h2>" + esc(l.nom || l.id) + "</h2>" +
          '<div class="sub">' + (v ? "<span>" + esc(v) + "</span>" : "") + (der && der.master ? "<span>master</span>" : "") +
            "<span>" + plural(l.versions || rendus.length, "version", "versions") + "</span>" +
            (l.destination ? "<span>" + esc(l.destination) + "</span>" : "") +
            (l.composition_memo ? "<span>disposition : " + esc(l.composition_memo) + "</span>" : "") +
          "</div></div>" +
        '<div class="right">' + (openNow ? '<span class="badge open">' + plural(openNow, "retour", "retours") + " à traiter</span>" : "") + stateHTML(l.etat) + "</div>" +
      "</div>" +
      '<div class="lv-body">' +
        '<div class="lv-main ' + esc(orient) + '">' +
          '<div class="lv-player ' + esc(orient) + '">' + player + "</div>" +
          '<div class="lv-side">' +
            '<div class="lv-state">' + stateHTML(l.etat, "lg") + '<div class="lv-phrase">' + phraseHTML(l) + "</div>" +
              (der && der.newerExists ? '<div class="lv-newer">Un rendu plus récent existe : <code>' + esc(der.newerFile) + "</code></div>" : "") +
            "</div>" +
            '<div class="lv-acts">' + acts + "</div>" +
            '<dl class="lv-facts">' +
              (der ? "<dt>Version de référence</dt><dd><code>" + esc(der.file) + "</code> · " + esc(relTime(der.mtime)) + (der.width ? " · " + der.width + "×" + der.height : "") + (der.durationMs ? " · " + esc(fmtDuration(der.durationMs)) : "") + "</dd>" : "") +
              "<dt>Dossier</dt><dd><code>" + esc(l.dossier) + "</code></dd>" +
              (l.composition ? "<dt>Composition</dt><dd><code>" + esc(l.composition) + "</code></dd>" : "") +
              "<dt>Destination</dt><dd>" + (l.destination ? esc(l.destination) : '<span class="faint">non renseignée</span>') + "</dd>" +
              "<dt>Disposition</dt><dd>" + (l.composition_memo ? '<a href="#/compositions">' + esc(l.composition_memo) + "</a>" : '<span class="faint">non renseignée</span>') + "</dd>" +
              (l.valide && l.valide.le && (l.etat === "valide" || l.etat === "publie") ? "<dt>Validé</dt><dd>" + esc(fmtDayLong(l.valide.le)) + (l.valide.par ? " par " + esc(l.valide.par) : "") + (l.valide.via ? ' <span class="faint">(' + esc(l.valide.via) + ")</span>" : "") + "</dd>" : "") +
              (l.publie && l.publie.le && l.etat === "publie" ? "<dt>Publié</dt><dd>" + esc(fmtDayLong(l.publie.le)) + (l.publie.ou ? " sur " + esc(l.publie.ou) : "") + (l.publie.url ? ' · <a target="_blank" rel="noopener" href="' + esc(l.publie.url) + '">lien</a>' : "") + "</dd>" : "") +
            "</dl>" +
          "</div>" +
        "</div>" +
        '<div class="lv-panels">' +
          '<div class="subpanel"><h3>Versions <span class="n">' + rendus.length + "</span></h3>" + versions + "</div>" +
          '<div class="subpanel"><h3>Retours <span class="n">' + (openNow ? openNow + " à traiter" : lotsNow.length ? "tout est traité" : "") + "</span></h3>" + retours + "</div>" +
        "</div>" +
      "</div>" +
    "</section>";
  }

  function actionsPanelHTML(d, lvs) {
    if (!ACTIONS || !ACTIONS.length) return "";
    var groups = ACTION_GROUPS.map(function (g) {
      var acts = ACTIONS.filter(function (a) { return (a.group || "montage") === g[0]; });
      if (!acts.length) return "";
      return '<div class="act-group"><div class="act-group-head"><span class="act-group-name">' + esc(g[1]) + '</span><span class="act-group-sub">' + esc(g[2]) + "</span></div>" +
        acts.map(function (a) {
          return '<div class="act-item' + (a.primary ? " primary" : "") + '">' +
            '<button type="button" class="btn btn-sm act' + (a.primary ? " btn-primary" : "") + '" data-action="' + esc(a.id) + '">' + esc(a.label) + "</button>" +
            '<span class="act-desc">' + esc(a.desc || a.hint || "") + "</span></div>";
        }).join("") + "</div>";
    }).join("");
    var first = lvs[0];
    var lvOpts = lvs.map(function (l) { return '<option value="' + esc(l.id) + '">' + esc(l.nom || l.id) + " · " + esc(l.dossier) + "</option>"; }).join("");
    return '<div class="panel" id="actions-panel">' +
      '<div class="panel-head"><h2>Actions</h2><span class="hint">lint, rendu, vérification et master, depuis ici ; un seul rendu à la fois</span>' +
        '<div class="right act-target"><span>sur</span><select class="select" id="act-lv">' + lvOpts + "</select>" +
        '<span>composition</span><select class="select" id="act-comp"></select></div></div>' +
      '<div class="act-groups">' + groups + "</div>" +
      '<div class="job" id="job" hidden><div class="job-head"><span class="job-label" id="job-label"></span><span class="job-step" id="job-step"></span>' +
        '<button type="button" class="btn btn-sm" id="job-stop">Arrêter</button></div><pre class="job-log" id="job-log"></pre></div>' +
      "</div>";
  }

  function drawTournage(d) {
    var lvs = (d.livrables || []).slice().sort(function (a, b) { return rank(a.etat) - rank(b.etat); });
    var opened = openLv[d.slug] || (openLv[d.slug] = {});
    var autoOpen = lvs.length <= 3;
    var folders = (d.dossiers || []).map(function (ds) {
      var abs = d.absPaths && d.absPaths[ds];
      var missing = (d.dossiers_manquants || []).indexOf(ds) !== -1;
      return '<div class="folder"><span class="path">' + esc(abs || ds) + "</span>" +
        (missing ? '<span class="badge soft">introuvable</span>' : '<button type="button" class="btn btn-xs" data-copy="' + esc(abs) + '">Copier</button>' +
        '<button type="button" class="btn btn-xs" data-reveal="' + esc(abs) + '">Ouvrir dans le Finder</button>') + "</div>";
    }).join("");
    var typeSel = '<select class="select" id="t-type">' + TYPES.map(function (t) {
      return '<option value="' + esc(t) + '"' + (d.type === t ? " selected" : "") + ">" + esc(t) + "</option>";
    }).join("") + (TYPES.indexOf(d.type) === -1 && d.type ? '<option value="' + esc(d.type) + '" selected>' + esc(d.type) + "</option>" : "") + "</select>";

    var orph = (d.rendus_orphelins || []);
    var orphHTML = orph.length ? '<div class="panel"><div class="panel-head"><h2>Rendus rattachés à aucun livrable</h2><span class="hint">' + plural(orph.length, "fichier", "fichiers") + ", à rattacher à un livrable par leur préfixe</span></div>" +
      '<div class="panel-body">' + orph.map(function (o, i) {
        return '<div class="orph"><span class="f">' + esc(o.dossier) + "/" + esc(o.file) + '</span><span class="faint">' + esc(fmtBytes(o.bytes)) + " · " + esc(relTime(o.mtime)) + "</span>" +
          '<select class="select orph-lv" data-i="' + i + '">' + lvs.filter(function (l) { return l.dossier === o.dossier; }).concat(lvs.filter(function (l) { return l.dossier !== o.dossier; })).map(function (l) {
            return '<option value="' + esc(l.id) + '">' + esc(l.nom || l.id) + "</option>";
          }).join("") + "</select>" +
          '<button type="button" class="btn btn-xs orph-go" data-i="' + i + '" data-prefix="' + esc(prefixOf(o.file)) + '">Rattacher (préfixe « ' + esc(prefixOf(o.file)) + " »)</button></div>";
      }).join("") + "</div></div>" : "";

    var docsHTML = (d.dossiers || []).map(function (ds) {
      var docs = (d.documents && d.documents[ds]) || [];
      var comps = (d.compositions && d.compositions[ds]) || [];
      return '<div class="dossier-block"><div class="dn">' + esc(ds) + "</div>" +
        (docs.length ? '<div class="doc-list">' + docs.map(function (f) { return '<a target="_blank" rel="noopener" href="' + esc(wsUrl(ds, f)) + '">' + esc(f) + "</a>"; }).join("") + "</div>" : '<div class="faint">Aucun document.</div>') +
        (comps.length ? '<div class="faint" style="margin-top:8px;font-size:12px">' + plural(comps.length, "composition", "compositions") + " : " + comps.map(esc).join(", ") + "</div>" : "") +
        '<div class="lv-acts" style="margin-top:10px">' +
          '<button type="button" class="btn btn-sm" data-prune="' + esc(ds) + '">Ne garder que les 3 derniers rendus</button>' +
          '<button type="button" class="btn btn-sm" data-studio="' + esc(ds) + '">Ouvrir le Studio HyperFrames</button>' +
        "</div></div>";
    }).join("");

    h('<div class="crumbs"><a href="#/">Projets</a><span>›</span><span>' + esc(d.slug) + "</span></div>" +
      '<div class="t-head"><div class="t-head-main">' +
        '<h1 class="t-title" id="t-title" title="Cliquer pour renommer">' + esc(d.titre || d.slug) + "</h1>" +
        '<div class="t-meta">' + stateHTML(d.etat) + (d.date ? "<span>" + esc(fmtDayLong(d.date)) + "</span>" : "") + typeSel +
          "<span>" + plural(lvs.length, "livrable", "livrables") + "</span>" +
          (d.archive ? '<span class="badge soft">archive</span>' : "") + "</div>" +
        '<div class="t-folders">' + folders + "</div>" +
      "</div>" +
      (d.migration && d.migration.a_valider ? '<div class="migr"><span><b>Déclaration à vérifier.</b> Les livrables ont été déclarés par un script' + (d.migration.remarque ? " (" + esc(d.migration.remarque) + ")" : "") + ", pas par toi. Si c'est juste, confirme.</span>" +
        '<button type="button" class="btn btn-sm btn-primary" id="migr-ok">C\'est bon</button></div>' : "") +
      "</div>" +
      '<div id="lvs">' + lvs.map(function (l, i) {
        var isOpen = opened[l.id] != null ? opened[l.id] : (autoOpen || i === 0);
        return lvHTML(d, l, isOpen);
      }).join("") + "</div>" +
      actionsPanelHTML(d, lvs) +
      orphHTML +
      '<div class="panel"><div class="panel-head"><h2>Dossiers et documents</h2><span class="hint">rangement, documents du dossier, Studio</span></div><div class="panel-body">' + docsHTML + "</div></div>");

    // texte des notes : par textContent, jamais innerHTML
    Array.prototype.forEach.call(view.querySelectorAll(".fb-note"), function (el) {
      var inp = el.querySelector("input"), x = el.querySelector(".x");
      var lots = (d.retours_fichiers && d.retours_fichiers[inp.getAttribute("data-dossier")]) || [];
      var lot = lots.filter(function (f) { return f.render === inp.getAttribute("data-render"); })[0];
      var note = lot && (lot.notes || []).filter(function (n) { return n.id === inp.getAttribute("data-id"); })[0];
      if (x && note) x.textContent = note.txt || "";
    });
    wireTournage(d, lvs);
  }

  function wireTournage(d, lvs) {
    var slug = d.slug;
    // dépliage des sections
    Array.prototype.forEach.call(view.querySelectorAll(".lv-head"), function (hd) {
      var sec = hd.parentNode, id = sec.getAttribute("data-lv");
      function toggle() {
        var on = !sec.classList.contains("open");
        sec.classList.toggle("open", on);
        if (on) mountVideo(sec);
        hd.setAttribute("aria-expanded", on ? "true" : "false");
        openLv[slug][id] = on;
      }
      hd.onclick = function (e) { if (e.target.closest("a, button, select, input")) return; toggle(); };
      hd.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } };
    });
    // titre éditable
    var tt = document.getElementById("t-title");
    tt.onclick = function () {
      var ta = document.createElement("textarea");
      ta.className = "t-title-edit"; ta.rows = 2; ta.value = d.titre || "";
      tt.replaceWith(ta); ta.focus(); ta.select();
      var done = false;
      function finish(save) {
        if (done) return; done = true;
        var val = ta.value.trim();
        if (save && val && val !== d.titre) {
          postJSON("/api/tournage/" + enc(slug), { patch: { titre: val } }).then(function (nd) { toast("Titre enregistré"); applyDetail(nd); })
            .catch(function (e) { toast(e.message || "échec"); drawTournage(d); });
        } else drawTournage(d);
      }
      ta.onkeydown = function (e) {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); finish(true); }
        if (e.key === "Escape") finish(false);
      };
      ta.onblur = function () { finish(true); };
    };
    document.getElementById("t-type").onchange = function () {
      postJSON("/api/tournage/" + enc(slug), { patch: { type: this.value } }).then(function (nd) { toast("Type enregistré"); applyDetail(nd); })
        .catch(function (e) { toast(e.message || "échec"); });
    };
    var mo = document.getElementById("migr-ok");
    if (mo) mo.onclick = function () {
      mo.disabled = true;
      postJSON("/api/tournage/" + enc(slug), { patch: { valider_migration: true } }).then(function (nd) { toast("Déclaration confirmée"); applyDetail(nd); })
        .catch(function (e) { toast(e.message || "échec"); mo.disabled = false; });
    };
    // copier / révéler
    Array.prototype.forEach.call(view.querySelectorAll("[data-copy]"), function (b) {
      b.onclick = function (e) { e.preventDefault(); copyText(b.getAttribute("data-copy"), "Chemin copié"); };
    });
    Array.prototype.forEach.call(view.querySelectorAll("[data-reveal]"), function (b) {
      b.onclick = function () {
        postJSON("/api/reveal", { path: b.getAttribute("data-reveal") }).then(function () { toast("Ouvert dans le Finder"); })
          .catch(function (e) { toast(e.message || "échec"); });
      };
    });
    // versions repliées
    Array.prototype.forEach.call(view.querySelectorAll(".ver-toggle"), function (b) {
      b.onclick = function () {
        var hid = b.closest(".subpanel").querySelector(".ver-hidden");
        if (!hid) return;
        hid.hidden = !hid.hidden;
        b.textContent = hid.hidden ? b.textContent.replace("Masquer", "Voir") : b.textContent.replace("Voir", "Masquer");
      };
    });
    // actions de livrable
    Array.prototype.forEach.call(view.querySelectorAll("[data-act]"), function (b) {
      b.onclick = function () { livrableAction(d, lvs, b.getAttribute("data-lv"), b.getAttribute("data-act"), b); };
    });
    // retours
    Array.prototype.forEach.call(view.querySelectorAll(".fb-one"), function (c) {
      c.onchange = function () {
        c.disabled = true;
        postJSON("/api/feedback/note", { slug: c.getAttribute("data-dossier"), render: c.getAttribute("data-render"), id: c.getAttribute("data-id"), done: c.checked })
          .then(function () { c.closest(".fb-note").classList.toggle("done", c.checked); c.disabled = false; refreshTournage(slug); })
          .catch(function (e) { toast(e.message || "échec"); c.checked = !c.checked; c.disabled = false; });
      };
    });
    Array.prototype.forEach.call(view.querySelectorAll(".fb-all"), function (b) {
      b.onclick = function () {
        b.disabled = true;
        postJSON("/api/feedback/done", { slug: b.getAttribute("data-dossier"), render: b.getAttribute("data-render"), done: b.getAttribute("data-done") === "1" })
          .then(function () { toast(b.getAttribute("data-done") === "1" ? "Lot marqué traité" : "Lot rouvert"); refreshTournage(slug); })
          .catch(function (e) { toast(e.message || "échec"); b.disabled = false; });
      };
    });
    // orphelins
    Array.prototype.forEach.call(view.querySelectorAll(".orph-go"), function (b) {
      b.onclick = function () {
        var i = b.getAttribute("data-i");
        var sel = view.querySelector('.orph-lv[data-i="' + i + '"]');
        var l = lvs.filter(function (x) { return x.id === sel.value; })[0];
        if (!l) return;
        var pref = b.getAttribute("data-prefix");
        var list = (l.prefixes || []).slice();
        if (list.indexOf(pref) === -1) list.push(pref);
        b.disabled = true;
        postJSON("/api/tournage/" + enc(slug) + "/livrable", { id: l.id, patch: { prefixes: list } })
          .then(function (nd) { toast("Rattaché à " + (l.nom || l.id)); applyDetail(nd); })
          .catch(function (e) { toast(e.message || "échec"); b.disabled = false; });
      };
    });
    // rangement
    Array.prototype.forEach.call(view.querySelectorAll("[data-prune]"), function (b) {
      b.onclick = function () { pruneDossier(b.getAttribute("data-prune"), slug); };
    });
    // studio
    Array.prototype.forEach.call(view.querySelectorAll("[data-studio]"), function (b) {
      b.onclick = function () {
        var ds = b.getAttribute("data-studio");
        confirmDialog("Ouvrir le Studio HyperFrames", "<p>Le Studio s'ouvre dans un nouvel onglet pour <b>" + esc(ds) + "</b>.</p><p>Il pèse 400 à 600 Mo de mémoire par projet ouvert, et il réécrit des attributs dans la composition (une sauvegarde est prise avant). Les rendus lancés depuis le Studio ne sont pas rattachés à un livrable : rends depuis cette page.</p>", "Ouvrir le Studio")
          .then(function (ok) {
            if (!ok) return;
            b.disabled = true; toast("Lancement du Studio…");
            postJSON("/api/studio/" + enc(ds), {}).then(function (r) {
              b.disabled = false;
              if (r.error) { toast(r.error); return; }
              if (r.url) window.open(r.url, "_blank", "noopener");
            }).catch(function (e) { b.disabled = false; toast(e.message || "échec"); });
          });
      };
    });
    wireActions(d, lvs);
  }

  function livrableAction(d, lvs, id, act, btn) {
    var slug = d.slug;
    var l = lvs.filter(function (x) { return x.id === id; })[0];
    if (!l) return;
    function patch(p, msg) {
      if (btn) btn.disabled = true;
      return postJSON("/api/tournage/" + enc(slug) + "/livrable", { id: id, patch: p })
        .then(function (nd) { if (msg) toast(msg); applyDetail(nd); })
        .catch(function (e) { toast(e.message || "échec"); if (btn) btn.disabled = false; });
    }
    if (act === "valider") {
      var v = versionOf(l.derniere.file) || baseName(l.derniere.file);
      confirmDialog("Valider cette version", "<p>Tu valides <b>" + esc(l.nom || l.id) + "</b> sur la <b>" + esc(v) + "</b> (<code>" + esc(l.derniere.file) + "</code>).</p><p>L'état passe à « validé » et reste déclaré tant que tu ne reviens pas à l'état déduit.</p>", "Valider")
        .then(function (ok) { if (ok) patch({ etat: "valide", valide: { version: l.derniere.file } }, "Version validée"); });
    } else if (act === "publier") {
      formDialog("Marquer publié", [
        { name: "ou", label: "Destination", type: "select", options: DESTINATIONS.map(function (x) { return { v: x, l: x }; }), value: l.destination || DESTINATIONS[0] },
        { name: "url", label: "Lien de la publication (facultatif)", type: "text", placeholder: "https://…" }
      ], "Marquer publié").then(function (r) {
        if (!r) return;
        var pub = { ou: r.ou };
        if (r.url) pub.url = r.url;
        patch({ etat: "publie", publie: pub }, "Marqué publié");
      });
    } else if (act === "abandonner") {
      confirmDialog("Abandonner ce livrable", "<p><b>" + esc(l.nom || l.id) + "</b> passe à « abandonné ». Rien n'est supprimé, et tu peux revenir à l'état déduit plus tard.</p>", "Abandonner", true)
        .then(function (ok) { if (ok) patch({ etat: "abandonne" }, "Livrable abandonné"); });
    } else if (act === "deduit") {
      patch({ etat: null }, "Retour à l'état déduit");
    } else if (act === "modifier") {
      loadCompositions().catch(function () { return { dispositions: [] }; }).then(function (c) {
        var disp = (c.dispositions || []).map(function (x) { return { v: x.id, l: x.nom + " (" + x.id + ")" }; });
        disp.unshift({ v: "", l: "non renseignée" });
        var dest = DESTINATIONS.map(function (x) { return { v: x, l: x }; });
        dest.unshift({ v: "", l: "non renseignée" });
        return formDialog("Modifier le livrable", [
          { name: "nom", label: "Nom", type: "text", value: l.nom || "" },
          { name: "destination", label: "Destination", type: "select", options: dest, value: l.destination || "" },
          { name: "composition_memo", label: "Disposition (mémoire de composition)", type: "select", options: disp, value: l.composition_memo || "" }
        ], "Enregistrer");
      }).then(function (r) {
        if (!r) return;
        var p = {};
        if (r.nom && r.nom !== l.nom) p.nom = r.nom;
        if ((r.destination || null) !== (l.destination || null)) p.destination = r.destination || null;
        if ((r.composition_memo || null) !== (l.composition_memo || null)) p.composition_memo = r.composition_memo || null;
        if (!Object.keys(p).length) { toast("Rien à changer"); return; }
        patch(p, "Livrable modifié");
      });
    }
  }

  function pruneDossier(ds, slug) {
    api("/api/prune/" + enc(ds) + "?keep=3").then(function (r) {
      var rm = r.remove || [];
      if (!rm.length) { toast("Rien à ranger : " + (r.kept || 0) + " rendus gardés"); return; }
      var body = "<p>Dans <b>" + esc(ds) + "</b>, " + plural(rm.length, "rendu part", "rendus partent") + " à la corbeille (" + esc(fmtBytes(r.freeBytes)) + " libérés). " +
        "Les 3 plus récents de chaque livrable restent" + (r.protected ? ", et " + plural(r.protected, "master est protégé", "masters sont protégés") : "") + ".</p>" +
        '<div class="confirm-list">' + rm.map(function (f) {
          return '<div class="ev"><span class="file">' + esc(f.file) + '</span><span class="mt">' + esc(fmtBytes(f.bytes)) + " · " + esc(relTime(f.mtime)) + "</span></div>";
        }).join("") + "</div>";
      return confirmDialog("Ne garder que les 3 derniers rendus", body, "Envoyer à la corbeille", true).then(function (ok) {
        if (!ok) return;
        return postJSON("/api/prune", { slug: ds, keep: 3 }).then(function (res) {
          toast(plural((res.moved || rm).length, "rendu envoyé", "rendus envoyés") + " à la corbeille");
          refreshTournage(slug);
        });
      });
    }).catch(function (e) { toast(e.message || "échec"); });
  }

  // --- Actions (pipeline depuis le navigateur), reprises de la v1 ---------
  function wireActions(d, lvs) {
    var selLv = document.getElementById("act-lv"), selComp = document.getElementById("act-comp");
    if (!selLv) return;
    function fillComps() {
      var l = lvs.filter(function (x) { return x.id === selLv.value; })[0];
      var comps = (l && d.compositions && d.compositions[l.dossier]) || [];
      selComp.innerHTML = comps.map(function (c) {
        return '<option value="' + esc(c) + '"' + (l && l.composition === c ? " selected" : "") + ">" + esc(c) + "</option>";
      }).join("") || '<option value="">(aucune)</option>';
    }
    selLv.onchange = fillComps;
    fillComps();
    Array.prototype.forEach.call(view.querySelectorAll(".act"), function (b) {
      b.onclick = function () {
        var l = lvs.filter(function (x) { return x.id === selLv.value; })[0];
        if (!l) return;
        runAction(d, l, selComp.value, b.getAttribute("data-action"));
      };
    });
    var stop = document.getElementById("job-stop");
    if (stop) stop.onclick = function () {
      if (!stop.getAttribute("data-job")) return;
      postJSON("/api/job-stop/" + enc(stop.getAttribute("data-job")), {}).catch(function () {});
    };
    setActionsBusy(jobBusy);
  }
  function runAction(d, l, comp, action) {
    if (jobBusy) { toast("Un rendu tourne déjà"); return; }
    setActionsBusy(true); jobBusy = true;
    var body = { slug: l.dossier, action: action };
    // le serveur attend l'id de compositions/<id>.html ; index.html = la racine
    var m = /^compositions\/(.+)\.html$/.exec(comp || "");
    if (m) body.composition = m[1];
    if (l.derniere) body.file = l.derniere.file;
    postJSON("/api/run", body).then(function (r) {
      jobSince = 0;
      showJob(r.job, true);
      pollJob(d.slug, r.job.id);
    }).catch(function (e) { setActionsBusy(false); jobBusy = false; toast(e.message || "action refusée"); });
  }
  function setActionsBusy(on) {
    Array.prototype.forEach.call(document.querySelectorAll(".act"), function (b) { b.disabled = on; });
  }
  function showJob(job, reset) {
    var box = document.getElementById("job"), log = document.getElementById("job-log");
    if (!box || !log) return;
    box.hidden = false;
    box.className = "job " + job.status;
    document.getElementById("job-label").textContent = job.label;
    document.getElementById("job-step").textContent =
      job.status === "running" ? "étape " + (job.step + 1) + "/" + job.stepCount + " · " + job.stepLabel
      : job.status === "done" ? "terminé"
      : job.status === "canceled" ? "arrêté" : "échec (code " + job.exitCode + ")";
    var stop = document.getElementById("job-stop");
    if (stop) { stop.setAttribute("data-job", job.id); stop.hidden = job.status !== "running"; }
    if (reset) log.textContent = "";
    if (job.lines && job.lines.length) { log.textContent += job.lines.join("\n") + "\n"; log.scrollTop = log.scrollHeight; }
  }
  function pollJob(slug, id) {
    clearTimeout(jobTimer);
    api("/api/job/" + enc(id) + "?since=" + jobSince).then(function (job) {
      jobSince = job.lineCount;
      showJob(job, false);
      if (job.status === "running") { jobTimer = setTimeout(function () { pollJob(slug, id); }, 900); return; }
      jobBusy = false; setActionsBusy(false);
      toast(job.label + " : " + (job.status === "done" ? "terminé" : job.status === "canceled" ? "arrêté" : "échec"));
      // le disque a changé : on redessine avec le nouveau rendu, en gardant le journal
      if (location.hash === "#/tournage/" + enc(slug)) {
        var keep = document.getElementById("job");
        var html = keep ? keep.outerHTML : null;
        refreshTournage(slug).then(function () {
          var fresh = document.getElementById("job");
          if (fresh && html) { fresh.outerHTML = html; var st = document.getElementById("job-stop"); if (st) st.hidden = true; }
        });
      }
    }).catch(function () { jobBusy = false; setActionsBusy(false); });
  }

  // =====================================================================
  // Sous-onglets : Ma DA (formats, style, animations) et Inspiration
  // (montage, motion design). Même menu partout, rien ne s'ouvre à part.
  // =====================================================================
  var SUBNAVS = {
    "ma-da": [["style", "Mon style", "#/ma-da/style"], ["animations", "Mes animations", "#/ma-da/animations"], ["formats", "Mes formats", "#/ma-da/formats"]],
    "inspiration": [["montage", "Montage", "#/inspiration/montage"], ["motion", "Motion design", "#/inspiration/motion"]]
  };
  function subnavHTML(group, active) {
    return '<nav class="subnav" aria-label="Sous-onglets">' + (SUBNAVS[group] || []).map(function (it) {
      return '<a class="subnav-link' + (it[0] === active ? " active" : "") + '" href="' + it[2] + '">' + esc(it[1]) + "</a>";
    }).join("") + "</nav>";
  }
  function parseQuery(s) {
    var o = {};
    (s || "").split("&").forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf("=");
      o[decodeURIComponent(i < 0 ? kv : kv.slice(0, i))] = i < 0 ? "" : decodeURIComponent(kv.slice(i + 1));
    });
    return o;
  }
  function qsLink(base, f, patch) {
    var n = {};
    Object.keys(f).forEach(function (k) { n[k] = f[k]; });
    Object.keys(patch || {}).forEach(function (k) { if (patch[k] === null || patch[k] === "" || patch[k] === false) delete n[k]; else n[k] = patch[k]; });
    var qs = Object.keys(n).map(function (k) { return enc(k) + "=" + enc(n[k]); }).join("&");
    return base + (qs ? "?" + qs : "");
  }
  function fxWs(rel) { return "/workspace/" + String(rel).split("/").map(enc).join("/"); }

  // =====================================================================
  // Les exemples concrets : des extraits de mes vidéos publiées
  // (donnees/exemples/exemples.json, extraits par npm run exemples)
  // =====================================================================
  var exemplesCache = null;
  function loadExemples() {
    if (exemplesCache) return Promise.resolve(exemplesCache);
    return fetch("/donnees/exemples/exemples.json", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : { videos: {}, exemples: [] }; })
      .then(function (j) { exemplesCache = j; return j; }).catch(function () { return { videos: {}, exemples: [] }; });
  }
  function exClip(e) { return "/donnees/exemples/clips/" + enc(e.id) + ".mp4"; }
  function exPoster(e) { return "/donnees/exemples/clips/" + enc(e.id) + ".jpg"; }
  function exTc(t) { var m = Math.floor(t / 60), s2 = Math.floor(t % 60); return m + ":" + (s2 < 10 ? "0" : "") + s2; }
  function exCardHTML(j, e) {
    var v = j.videos[e.video] || {};
    return '<article class="ex-card" data-ex="' + esc(e.id) + '" tabindex="0">' +
      '<div class="ex-media"><img loading="lazy" src="' + esc(exPoster(e)) + '" alt=""><span class="ex-tc">' + exTc(e.debut) + '</span><span class="ex-play">▶</span></div>' +
      '<div class="ex-body"><div class="ex-title">' + esc(e.titre) + '</div><div class="ex-sub">' + esc(v.titre ? v.titre.split(" · ")[0] : e.video) + " · " + exTc(e.debut) + " → " + exTc(e.fin) + "</div>" +
        '<div class="ex-txt">' + esc(e.ce_qu_on_voit || "") + "</div></div></article>";
  }
  function exWire(scope, j) {
    Array.prototype.forEach.call(scope.querySelectorAll(".ex-card:not([data-wired])"), function (c) {
      c.dataset.wired = "1";
      var e = (j.exemples || []).filter(function (x) { return x.id === c.getAttribute("data-ex"); })[0];
      if (!e) return;
      var box = c.querySelector(".ex-media"), v = null;
      c.addEventListener("mouseenter", function () {
        if (!v) { v = document.createElement("video"); v.muted = true; v.loop = true; v.playsInline = true; v.preload = "auto"; v.src = exClip(e); box.appendChild(v); }
        v.currentTime = 0; v.play().catch(function () {}); box.classList.add("live");
      });
      c.addEventListener("mouseleave", function () { if (v) v.pause(); box.classList.remove("live"); });
      c.addEventListener("click", function () { exOuvrir(j, e); });
      c.addEventListener("keydown", function (ev) { if (ev.key === "Enter") exOuvrir(j, e); });
    });
  }
  var exBig = null;
  function exFermer() { if (exBig) { exBig.remove(); exBig = null; document.removeEventListener("keydown", exKey); } }
  function exKey(ev) { if (ev.key === "Escape") exFermer(); }
  function exOuvrir(j, e) {
    exFermer();
    var v = j.videos[e.video] || {};
    var fam = (effetsCache && effetsCache.vocabulaire && (effetsCache.vocabulaire.familles || []).filter(function (x) { return x.id === e.famille; })[0]) || null;
    var eff = (effetsCache && effetsCache.vocabulaire && (effetsCache.vocabulaire.effets || []).filter(function (x) { return x.id === e.effet; })[0]) || null;
    var copie = ["Exemple de ma DA : " + e.titre, "Vidéo : " + (v.titre || e.video) + " · " + exTc(e.debut) + " → " + exTc(e.fin) + " (t=" + e.debut + " à " + e.fin + " s)",
      "Rendu : video-projects/" + v.dossier + "/" + v.rendu, "Ce qu'on voit : " + (e.ce_qu_on_voit || ""), "Comment c'est fait : " + (e.comment || "") + (v.code ? " · code du projet : " + v.code : ""),
      "Extrait : donnees/exemples/clips/" + e.id + ".mp4"].join("\n");
    exBig = document.createElement("div");
    exBig.className = "player-back";
    exBig.innerHTML = '<div class="fx-big" role="dialog" aria-modal="true" aria-label="' + esc(e.titre) + '">' +
      '<div class="fx-big-head"><div><div class="fx-big-title">' + esc(e.titre) + '</div><div class="fx-src">' + esc(v.titre || e.video) + " · " + exTc(e.debut) + " → " + exTc(e.fin) + "</div></div>" +
        '<div class="fx-big-acts"><button type="button" class="btn btn-sm btn-primary" data-excopy="1">Copier pour Claude</button>' +
          (v.tournage ? '<a class="btn btn-sm" href="#/tournage/' + enc(v.tournage) + '">Le projet</a>' : "") +
          '<button type="button" class="btn btn-sm" data-close="1">Fermer</button></div></div>' +
      '<div class="fx-big-body"><div class="ex-stage' + (v.court ? " court" : "") + '"><video controls autoplay playsinline src="' + esc(exClip(e)) + '" poster="' + esc(exPoster(e)) + '"></video></div>' +
        '<div class="fx-big-side"><div class="fx-tags">' + (fam ? '<span class="fx-tag soft">' + esc(fam.nom) + "</span>" : "") + (eff ? '<span class="fx-tag effet">' + esc(eff.nom) + "</span>" : "") + "</div>" +
          "<p><b>Ce qu'on voit.</b> " + esc(e.ce_qu_on_voit || "") + "</p>" +
          (e.comment ? "<p><b>Comment c'est fait.</b> " + esc(e.comment) + "</p>" : "") +
          '<dl class="lv-facts"><dt>Vidéo</dt><dd>' + esc(v.titre || e.video) + (v.publie ? " · " + esc(v.publie) : "") + "</dd>" +
            "<dt>Rendu</dt><dd><code>" + esc(v.rendu || "") + "</code></dd>" + (v.code ? "<dt>Code</dt><dd><code>" + esc(v.code) + "</code></dd>" : "") + "</dl>" +
        "</div></div></div>";
    exBig.addEventListener("click", function (ev) {
      if (ev.target === exBig || ev.target.getAttribute("data-close")) { exFermer(); return; }
      if (ev.target.getAttribute("data-excopy")) copyText(copie, "Copié pour Claude");
    });
    document.body.appendChild(exBig);
    document.addEventListener("keydown", exKey);
  }
  // remplit une case de la page avec les exemples qui passent le filtre
  function exRemplir(boxId, filtre, vide) {
    return loadExemples().then(function (j) {
      var box = document.getElementById(boxId);
      if (!box) return;
      var list = (j.exemples || []).filter(filtre);
      var court = function (e) { return !!(j.videos[e.video] || {}).court; };
      var longs = list.filter(function (e) { return !court(e); }), courts = list.filter(court);
      var deux = longs.length && courts.length;
      box.innerHTML = list.length
        ? (longs.length ? (deux ? '<div class="ex-sous">YouTube · 16:9</div>' : "") + '<div class="ex-grid">' + longs.map(function (e) { return exCardHTML(j, e); }).join("") + "</div>" : "") +
          (courts.length ? (deux ? '<div class="ex-sous">Reels · 9:16</div>' : "") + '<div class="ex-grid court">' + courts.map(function (e) { return exCardHTML(j, e); }).join("") + "</div>" : "")
        : (typeof vide === "function" ? vide(j) : (vide || ""));
      exWire(box, j);
    });
  }

  // =====================================================================
  // Ma DA › Mes formats : la mémoire de composition, avec un vrai exemple
  // =====================================================================
  function schemaSVG(c) {
    var w = (c.cadre && c.cadre.w) || 1080, hh = (c.cadre && c.cadre.h) || 1920;
    var vertical = hh > w;
    var s = vertical ? 340 / hh : 380 / w;
    var W = Math.round(w * s), H = Math.round(hh * s);
    var fs = Math.round(11 / s), pad = Math.round(6 / s);
    var light = /crème|creme|clair/i.test(c.fond || "");
    var pid = "hatch-" + String(c.id).replace(/[^a-z0-9-]/gi, "");
    var out = '<svg class="schema" width="' + W + '" height="' + H + '" viewBox="0 0 ' + w + " " + hh + '" role="img" aria-label="Schéma de ' + esc(c.nom) + '">' +
      '<defs><pattern id="' + pid + '" patternUnits="userSpaceOnUse" width="' + Math.round(14 / s) + '" height="' + Math.round(14 / s) + '" patternTransform="rotate(45)">' +
        '<rect width="' + Math.round(14 / s) + '" height="' + Math.round(14 / s) + '" fill="rgba(229,56,43,0.10)"/><line x1="0" y1="0" x2="0" y2="' + Math.round(14 / s) + '" stroke="rgba(229,56,43,0.6)" stroke-width="' + Math.round(2 / s) + '"/></pattern></defs>' +
      '<rect class="frame' + (light ? " light" : "") + '" x="0" y="0" width="' + w + '" height="' + hh + '" rx="' + Math.round(10 / s) + '" stroke-width="' + Math.round(1.5 / s) + '"/>';
    (c.zones || []).forEach(function (z) {
      var zw = z.w != null ? z.w : w, zh = z.h != null ? z.h : hh, zx = z.x || 0, zy = z.y || 0;
      out += '<rect class="zone" x="' + zx + '" y="' + zy + '" width="' + zw + '" height="' + zh + '" rx="' + Math.round(6 / s) + '" stroke-width="' + Math.round(1.2 / s) + '"/>';
      if (zh >= fs * 1.4) out += '<text class="zone-label" x="' + (zx + pad) + '" y="' + (zy + pad + fs * 0.9) + '" font-size="' + fs + '">' + esc(z.id) + "</text>";
    });
    (c.interdits || []).forEach(function (z) {
      if (z.h != null && z.h > 0) {
        var zw = z.w != null ? z.w : w, zx = z.x || 0;
        out += '<rect class="forbid" x="' + zx + '" y="' + (z.y || 0) + '" width="' + zw + '" height="' + z.h + '" fill="url(#' + pid + ')" stroke-width="' + Math.round(1 / s) + '"/>';
        out += '<text class="forbid-label" x="' + (zx + zw - pad) + '" y="' + ((z.y || 0) + z.h - pad) + '" text-anchor="end" font-size="' + Math.round(fs * 0.85) + '">' + esc(z.id) + "</text>";
      } else if (z.y != null) {
        out += '<line class="headline" x1="0" y1="' + z.y + '" x2="' + w + '" y2="' + z.y + '" stroke-width="' + Math.round(1.5 / s) + '"/>';
        out += '<text class="headline-label" x="' + (w - pad) + '" y="' + (z.y + pad + fs * 0.8) + '" text-anchor="end" font-size="' + Math.round(fs * 0.85) + '">' + esc(z.id) + "</text>";
      }
    });
    out += "</svg>";
    return out;
  }

  function renderFormats(id) {
    setActiveNav("ma-da");
    h(subnavHTML("ma-da", "formats") + '<div class="view-head"><div><h1 class="view-title">Mes <span class="serif">formats</span></h1><div class="view-sub">chargement…</div></div></div>');
    Promise.all([loadCompositions(true), loadState()]).then(function (r) { drawFormats(r[0], r[1], id); }).catch(showError);
  }
  // L'exemple d'un format : le rendu de référence du projet canon, sinon le
  // dernier rendu d'un livrable qui déclare cette disposition.
  function exempleDe(x, s) {
    var byDossier = {};
    (s.tournages || []).forEach(function (t) { (t.dossiers || []).forEach(function (d) { byDossier[d] = t; }); });
    var cands = [];
    if (x.canon && x.canon.dossier && byDossier[x.canon.dossier]) cands.push(byDossier[x.canon.dossier]);
    (x.utilisee_par || []).forEach(function (u) { if (byDossier[u.dossier] && cands.indexOf(byDossier[u.dossier]) === -1) cands.push(byDossier[u.dossier]); });
    for (var i = 0; i < cands.length; i++) if (cands[i].apercu && cands[i].apercu.file) return cands[i];
    return null;
  }
  function drawFormats(c, s, id) {
    var disp = c.dispositions || [];
    var cur = disp.filter(function (x) { return x.id === id; })[0] || disp[0];
    var tabs = '<div class="fmt-tabs">' + disp.map(function (x) {
      var on = cur && x.id === cur.id;
      return '<a class="fmt-tab' + (on ? " on" : "") + '" href="#/ma-da/formats/' + enc(x.id) + '"><span class="nm">' + esc(x.nom) + '</span><span class="or">' + esc(x.orientation || "") + (x.cadre ? " · " + x.cadre.w + "×" + x.cadre.h : "") + "</span></a>";
    }).join("") + "</div>";
    var panel = "";
    if (cur) {
      var ex = exempleDe(cur, s);
      var vertical = cur.cadre && cur.cadre.h > cur.cadre.w;
      var used = cur.utilisee_par || [];
      var seen = {}, usedList = used.filter(function (u) { var k = u.tournage + "|" + u.livrable; if (seen[k]) return false; seen[k] = true; return true; });
      var zones = (cur.zones || []).map(function (z) {
        return '<div class="z"><span class="sw"></span><span class="id">' + esc(z.id) + '</span><span class="r">' + esc(z.role || "") + "</span></div>";
      }).concat((cur.interdits || []).map(function (z) {
        return '<div class="z f"><span class="sw"></span><span class="id">' + esc(z.id) + '</span><span class="r">' + esc(z.role || "") + "</span></div>";
      })).join("");
      var exHTML = ex
        ? '<div class="fmt-ex' + (vertical ? " vert" : "") + '"><video controls preload="none" playsinline poster="' + esc(thumbUrl(ex.apercu.dossier, ex.apercu.file, ex.apercu.mtime)) + '" src="' + esc(wsUrl(ex.apercu.dossier, ex.apercu.file)) + '"></video>' +
          '<div class="fmt-ex-cap">L\'exemple : <a href="#/tournage/' + enc(ex.slug) + '">' + esc(ex.titre || ex.slug) + "</a>" + (ex.apercu.master ? ' <span class="badge master">master</span>' : "") + ' <span class="faint">' + esc(ex.apercu.file.replace(/^renders\//, "")) + "</span></div></div>"
        : '<div class="fmt-ex none"><div>Aucun exemple rendu pour ce format.<br><small>Il apparaîtra dès qu\'un livrable déclarera cette disposition et aura un rendu.</small></div></div>';
      panel = '<article class="fmt-panel">' +
        '<div class="fmt-top"><h2>' + esc(cur.nom) + '</h2><div class="phrase">' + esc(cur.phrase || "") + "</div>" +
          '<div class="facts"><span class="badge soft">' + esc(cur.orientation || "") + "</span>" +
            (cur.cadre ? '<span class="badge soft tnum">' + cur.cadre.w + "×" + cur.cadre.h + (cur.cadre.fps ? " · " + cur.cadre.fps + " i/s" : "") + "</span>" : "") +
            (cur.fond ? '<span class="badge soft">fond : ' + esc(cur.fond) + "</span>" : "") +
            '<span class="badge soft mono" style="text-transform:none">' + esc(cur.id) + "</span></div></div>" +
        '<div class="fmt-main">' + exHTML +
          '<div class="fmt-schema"><div class="fmt-schema-head">Le schéma : où va quoi</div>' + schemaSVG(cur) +
            '<div class="comp-zones">' + (zones || '<span class="faint">Aucune zone déclarée : seul le cadre compte.</span>') + "</div></div>" +
        "</div>" +
        '<div class="ex-zone"><div class="fmt-schema-head">Les animations de ce format, dans mes vidéos</div><div id="ex-format"><span class="faint">chargement…</span></div></div>' +
        '<div class="fmt-foot">' + (cur.structure ? "<div><b>Structure.</b> " + esc(cur.structure) + "</div>" : "") +
          (cur.notes && cur.notes.length ? "<ul>" + cur.notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>" : "") +
          '<div class="comp-usage"><h3>Utilisé par <span class="n">' + usedList.length + "</span></h3>" +
            (usedList.length ? "<ul>" + usedList.map(function (u) {
              return '<li><span class="sdot st-' + esc(u.etat) + '"></span><a href="#/tournage/' + enc(u.tournage) + '" title="' + esc(u.titre) + '">' + esc(u.titre || u.tournage) + '</a><span class="lvn">' + esc(u.nom || u.livrable) + "</span></li>";
            }).join("") + "</ul>" : '<span class="faint">Aucun livrable ne le déclare encore.</span>') + "</div>" +
          (cur.source ? '<div class="src">source : ' + esc(cur.source) + "</div>" : "") +
        "</div></article>";
    }
    h(subnavHTML("ma-da", "formats") +
      '<div class="view-head"><div><h1 class="view-title">Mes <span class="serif">formats</span></h1>' +
        '<div class="view-sub">' + esc(c.a_propos || "Comment tes vidéos sont composées : un format = une façon de poser les éléments dans le cadre.") + "</div></div></div>" +
      tabs + panel);
    if (cur) exRemplir("ex-format", function (e) { return e.format === cur.id; }, '<span class="faint">Pas encore d\'extrait relevé pour ce format. On l\'ajoute dans <code>donnees/exemples/exemples.json</code> à la prochaine vidéo publiée.</span>');
  }

  // =====================================================================
  // Ma DA › Mes animations, et Inspiration › Montage : les cartes jouables
  // =====================================================================
  var effetsCache = null;
  var FX_PAGE = 60;
  var fxShown = FX_PAGE;
  function loadEffets(force) {
    if (effetsCache && !force) return Promise.resolve(effetsCache);
    return api("/api/effets").then(function (i) { effetsCache = i; return i; });
  }
  function fxNomEffet(idx, id) { var e = (idx.vocabulaire.effets || []).filter(function (x) { return x.id === id; })[0]; return e ? e.nom : id; }
  function fxNomChaine(idx, id) { var c = (idx.chaines || []).filter(function (x) { return x.id === id; })[0]; return c ? c.nom : id; }
  function fxChaine(idx, id) { return (idx.chaines || []).filter(function (x) { return x.id === id; })[0] || null; }
  function fxEntry(idx, id) { return (idx.entrees || []).filter(function (x) { return x.id === id; })[0] || null; }
  function fxHay(x) {
    return [x.id, x.titre, x.titre_traitement, x.traitement, x.mecanique, x.resume, (x.slots || []).join(" "), x.effet, (x.effets_secondaires || []).join(" "), x.purpose].join(" ").toLowerCase();
  }
  function fxFamille(idx, effetId) { var e = (idx.vocabulaire.effets || []).filter(function (x) { return x.id === effetId; })[0]; return e ? e.famille || "" : ""; }
  function fxNomFamille(idx, id) { var fm = (idx.vocabulaire.familles || []).filter(function (x) { return x.id === id; })[0]; return fm ? fm.nom : id; }
  function fxOk(x, f, idx) {
    if (f.famille && idx && fxFamille(idx, x.effet) !== f.famille) return false;
    if (f.format && x.format !== f.format) return false;
    if (f.charte && x.charte !== f.charte) return false;
    if (f.effet && x.effet !== f.effet && (x.effets_secondaires || []).indexOf(f.effet) === -1) return false;
    if (f.q) {
      var hay = fxHay(x);
      if (!f.q.toLowerCase().split(/\s+/).every(function (w) { return !w || hay.indexOf(w) !== -1; })) return false;
    }
    return true;
  }

  // Le texte qu'on colle à Claude : tout ce qu'il faut pour retrouver et monter
  // la carte, et surtout si elle est à monter telle quelle ou à refaire.
  function fxCopieClaude(idx, x) {
    var L = [];
    L.push("Effet : " + fxNomEffet(idx, x.effet) + " (" + x.effet + ") · chaîne " + fxNomChaine(idx, x.chaine) + " · " + x.format + " · " + (x.charte === "neutre" ? "neutre" : "habillé") + (x.niveau ? " · " + x.niveau : ""));
    L.push(x.dans_ma_charte
      ? "Ma DA : oui" + (x.charte_via === "carte" ? " (carte adoptée" + (x.charte_note ? " : " + x.charte_note : "") + ")" : "") + " → à monter telle quelle"
      : "Ma DA : non, c'est de l'inspiration → reprendre la mécanique et la refaire dans la charte (crème quadrillé, jaune, Garet), ne pas monter telle quelle");
    L.push("Carte : " + x.id + (x.titre ? " — " + x.titre : ""));
    if (x.fichier) L.push("Fichier : " + x.fichier);
    if (x.slots && x.slots.length) L.push("Slots : " + x.slots.join(", "));
    if (x.effets_secondaires && x.effets_secondaires.length) L.push("Aussi : " + x.effets_secondaires.map(function (e) { return fxNomEffet(idx, e); }).join(", "));
    if (x.mecanique) L.push("Mécanique : " + x.mecanique);
    if (x.variantes) L.push("Variantes : " + x.variantes.n + " fichiers dans " + (x.fichier || "").replace(/\/[^/]+$/, "/") + " (le traitement nomme chaque déclinaison)");
    L.push("Index : donnees/effets/INDEX.md");
    return L.join("\n");
  }

  function fxBadges(idx, x, ctx) {
    return (ctx.montrerDA && x.dans_ma_charte ? '<span class="fx-tag t-charte" title="' + esc(x.charte_via === "carte" ? "carte adoptée" : "ta charte") + '">dans ma DA</span>' : "") +
      (ctx.montrerChaine ? '<a class="fx-tag chaine" href="' + ctx.chaineHref(x.chaine) + '">' + esc(fxNomChaine(idx, x.chaine)) + "</a>" : "") +
      '<a class="fx-tag effet" href="' + ctx.effetHref(x.effet) + '">' + esc(fxNomEffet(idx, x.effet)) + "</a>" +
      (x.effets_secondaires || []).slice(0, 2).map(function (e) { return '<a class="fx-tag sec" href="' + ctx.effetHref(e) + '">' + esc(fxNomEffet(idx, e)) + "</a>"; }).join("") +
      '<span class="fx-tag soft">' + esc(x.format) + "</span>" +
      '<span class="fx-tag ' + (x.charte === "neutre" ? "neutre" : "habille") + '" title="' + (x.charte === "neutre" ? "la mécanique ne dépend pas du look" : "porte la palette et la typo de sa chaîne") + '">' + (x.charte === "neutre" ? "neutre" : "habillé") + "</span>" +
      "" +
      (x.variantes ? '<span class="fx-tag soft tnum">' + x.variantes.n + " variantes</span>" : "");
  }
  // Mettre dans ma DA / Retirer : une carte d'inspiration s'adopte seule ; une
  // carte adoptée se retire ; une carte de la charte n'a pas de bouton.
  function fxCharteBtn(x, size) {
    if (!x.dans_ma_charte) return '<button type="button" class="btn ' + size + '" data-charte-carte="' + esc(x.id) + '" data-dans="1" title="Cette carte entre dans mes animations, à monter telle quelle">Mettre dans ma DA</button>';
    if (x.charte_via === "carte") return '<button type="button" class="btn ' + size + ' btn-ghost" data-charte-carte="' + esc(x.id) + '" data-dans="0">Retirer de ma DA</button>';
    return "";
  }
  function fxCardHTML(idx, x, ctx) {
    var vert = x.format === "9:16";
    var live = x.apercu && x.apercu.live ? fxWs(x.apercu.live) : "";
    var poster = x.apercu && x.apercu.poster ? fxWs(x.apercu.poster) : "";
    var w = (x.apercu && x.apercu.w) || 1920, hh = (x.apercu && x.apercu.h) || 1080;
    return '<article class="fx-card' + (vert ? " vert" : "") + (x.dans_ma_charte ? " c-charte" : " c-inspi") + '" data-id="' + esc(x.id) + '">' +
      '<div class="fx-media' + (vert ? " vert" : "") + '" data-live="' + esc(live) + '" data-w="' + w + '" data-h="' + hh + '" title="' + esc(x.titre || x.id) + '">' +
        (poster ? '<img class="fx-poster" loading="lazy" decoding="async" src="' + esc(poster) + '" alt="">' : "") +
        '<button type="button" class="fx-zoom" data-open="' + esc(x.id) + '" title="Voir en grand">Voir en grand</button>' +
      "</div>" +
      '<div class="fx-body">' +
        '<div class="fx-title">' + esc(x.titre || x.id) + "</div>" +
        '<div class="fx-src">' + esc(fxNomChaine(idx, x.chaine)) + " · " + esc(fxNomFamille(idx, fxFamille(idx, x.effet))) + " · " + esc(fxNomEffet(idx, x.effet)) + "</div>" +
        '<div class="fx-id mono">' + esc(x.id) + "</div>" +
        '<div class="fx-tags">' + fxBadges(idx, x, ctx) + "</div>" +
        (x.mecanique ? '<div class="fx-meca">' + esc(x.mecanique) + "</div>" : "") +
        (x.slots && x.slots.length ? '<div class="fx-slots mono">slots : ' + esc(x.slots.join(", ")) + "</div>" : "") +
        (x.charte_via === "carte" && x.charte_note ? '<div class="fx-note">' + esc(x.charte_note) + "</div>" : "") +
        '<div class="fx-acts">' + fxCharteBtn(x, "btn-xs") +
          '<button type="button" class="btn btn-xs" data-claude="' + esc(x.id) + '">Copier pour Claude</button>' +
        "</div>" +
      "</div></article>";
  }

  // --- jouer une carte dans une iframe à l'échelle ---------------------------
  // Les cartes s'enregistrent en pause (contrat de rendu). Ici c'est une galerie :
  // on les pose sur une image parlante (40 % de la timeline), et on les joue en
  // boucle au survol. Au plus FX_LIVE_MAX iframes montées, les autres attendent
  // d'entrer dans la fenêtre.
  var FX_LIVE_MAX = 36;
  var fxMounted = 0;
  function fxDrive(frame, mode) {
    var w = frame.contentWindow, tries = 0;
    (function go() {
      var t; try { t = w && w.__timelines; } catch (e) { return; }
      var keys = t ? Object.keys(t) : [];
      if (!keys.length) { if (tries++ < 120 && frame.isConnected) setTimeout(go, 90); return; }
      keys.forEach(function (k) {
        var tl = t[k];
        try {
          if (mode === "loop") {
            tl.eventCallback("onComplete", function () { setTimeout(function () { if (frame.isConnected && frame.dataset.mode === "loop") tl.restart(); }, 900); });
            tl.pause(0); tl.play(0);
          } else {
            tl.eventCallback("onComplete", null);
            tl.pause(Math.min(tl.duration() * 0.4, Math.max(0, tl.duration() - 0.05)));
          }
        } catch (e) { /* une carte cassée ne doit pas casser la grille */ }
      });
    })();
  }
  function fxFit(box, f) {
    var w = +box.getAttribute("data-w") || 1920, hh = +box.getAttribute("data-h") || 1080;
    var s = Math.min(box.clientWidth / w, box.clientHeight / hh);
    f.style.width = w + "px"; f.style.height = hh + "px";
    f.style.transform = "translate(" + ((box.clientWidth - w * s) / 2) + "px," + ((box.clientHeight - hh * s) / 2) + "px) scale(" + s + ")";
  }
  function fxMount(box) {
    if (box.dataset.mounted || !box.getAttribute("data-live")) return;
    if (fxMounted >= FX_LIVE_MAX) return;
    box.dataset.mounted = "1"; fxMounted++;
    var f = document.createElement("iframe");
    f.setAttribute("scrolling", "no"); f.setAttribute("tabindex", "-1"); f.setAttribute("title", "aperçu"); f.setAttribute("loading", "lazy");
    f.dataset.mode = "pose";
    f.addEventListener("load", function () { fxFit(box, f); box.classList.add("live"); fxDrive(f, f.dataset.mode); });
    fxFit(box, f);
    f.src = box.getAttribute("data-live");
    box.appendChild(f);
  }
  function fxUnmount(box) {
    if (!box.dataset.mounted) return;
    var f = box.querySelector("iframe");
    if (f) f.remove();
    delete box.dataset.mounted; box.classList.remove("live"); fxMounted = Math.max(0, fxMounted - 1);
  }
  var fxObserver = null;
  function fxWireMedia(scope) {
    if (!fxObserver && "IntersectionObserver" in window) {
      fxObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) fxMount(en.target); else fxUnmount(en.target); });
      }, { rootMargin: "120px 0px" });
    }
    Array.prototype.forEach.call((scope || document).querySelectorAll(".fx-media[data-live]:not([data-wired])"), function (box) {
      if (!box.getAttribute("data-live")) return;
      box.dataset.wired = "1";
      if (fxObserver) fxObserver.observe(box); else fxMount(box);
      var host = box.closest(".ch-card") || box;
      host.addEventListener("mouseenter", function () {
        fxMount(box);
        var f = box.querySelector("iframe");
        if (f) { f.dataset.mode = "loop"; fxDrive(f, "loop"); }
      });
      host.addEventListener("mouseleave", function () {
        var f = box.querySelector("iframe");
        if (f) { f.dataset.mode = "pose"; fxDrive(f, "pose"); }
      });
    });
  }

  // --- en grand -------------------------------------------------------------------
  var fxBig = null;
  function fxCloseBig() { if (!fxBig) return; fxBig.remove(); fxBig = null; document.removeEventListener("keydown", fxBigKey); }
  function fxBigKey(e) { if (e.key === "Escape") fxCloseBig(); }
  function fxOpenBig(idx, x, ctx) {
    fxCloseBig();
    var w = (x.apercu && x.apercu.w) || 1920, hh = (x.apercu && x.apercu.h) || 1080;
    var scale = Math.min(Math.min(1100, window.innerWidth - 440) / w, (window.innerHeight - 150) / hh);
    var W = Math.round(w * scale), H = Math.round(hh * scale);
    var live = x.apercu && x.apercu.live ? fxWs(x.apercu.live) : "";
    var stage = live
      ? '<div class="fx-stage" style="width:' + W + "px;height:" + H + 'px"><iframe scrolling="no" title="carte" style="width:' + w + "px;height:" + hh + "px;transform:scale(" + scale + ')"></iframe></div>'
      : '<div class="fx-stage none" style="width:' + W + "px;height:" + H + 'px">Aucun aperçu local</div>';
    var variantes = x.variantes ? '<div class="fx-vars"><h4>' + x.variantes.n + ' variantes, cliquer pour la jouer</h4><div class="fx-varlist">' + x.variantes.cartes.map(function (v, i) {
      return '<button type="button" class="fx-var' + (i === 0 ? " on" : "") + '" data-src="' + esc(fxWs(v.fichier)) + '" data-vid="' + esc(v.id) + '" title="' + esc(v.id) + '">' + esc(v.traitement) + "</button>";
    }).join("") + "</div></div>" : "";
    fxBig = document.createElement("div");
    fxBig.className = "player-back";
    fxBig.innerHTML =
      '<div class="fx-big" role="dialog" aria-modal="true" aria-label="' + esc(x.titre || x.id) + '">' +
        '<div class="fx-big-head"><div><div class="fx-big-title">' + esc(x.titre || x.id) + '</div><div class="fx-id mono">' + esc(x.id) + "</div></div>" +
          '<div class="fx-big-acts">' +
            (live ? '<button type="button" class="btn btn-sm" data-replay="1">Rejouer</button><a class="btn btn-sm" href="' + esc(live) + '" target="_blank" rel="noopener">Onglet</a>' : "") +
            fxCharteBtn(x, "btn-sm") +
            '<button type="button" class="btn btn-sm btn-primary" data-claude="' + esc(x.id) + '">Copier pour Claude</button>' +
            '<button type="button" class="btn btn-sm" data-close="1">Fermer</button>' +
          "</div></div>" +
        '<div class="fx-big-body">' + stage +
          '<div class="fx-big-side">' +
            '<div class="fx-tags">' + fxBadges(idx, x, ctx) + "</div>" +
            (x.mecanique ? "<p><b>Mécanique.</b> " + esc(x.mecanique) + "</p>" : "") +
            "<dl class=\"lv-facts\">" +
              (x.fichier ? "<dt>Fichier</dt><dd><code>" + esc(x.fichier) + '</code> <button type="button" class="btn-link" data-copy="' + esc("" + x.fichier) + '">Copier</button></dd>' : "") +
              (x.slots && x.slots.length ? "<dt>Slots</dt><dd>" + esc(x.slots.join(", ")) + "</dd>" : "") +
              (x.duree ? "<dt>Durée</dt><dd>" + esc(x.duree.min) + (x.duree.max !== x.duree.min ? " à " + esc(x.duree.max) : "") + " s</dd>" : "") +
              (x.dimensions ? "<dt>Cadre</dt><dd>" + x.dimensions.w + "×" + x.dimensions.h + "</dd>" : "") +
            "</dl>" +
            (x.charte_note ? '<div class="fx-note">' + esc(x.charte_note) + "</div>" : "") +
          "</div></div>" + variantes +
      "</div>";
    fxBig.addEventListener("click", function (e) {
      if (e.target === fxBig || e.target.getAttribute("data-close")) { fxCloseBig(); return; }
      if (e.target.getAttribute("data-replay")) { var fr = fxBig.querySelector("iframe"); if (fr) fxDrive(fr, "loop"); }
      var v = e.target.closest(".fx-var");
      if (v) {
        Array.prototype.forEach.call(fxBig.querySelectorAll(".fx-var"), function (b) { b.classList.toggle("on", b === v); });
        var fr2 = fxBig.querySelector("iframe");
        if (fr2) fr2.src = v.getAttribute("data-src");
        fxBig.querySelector(".fx-id").textContent = v.getAttribute("data-vid");
      }
      var cp = e.target.closest("[data-copy]");
      if (cp) copyText(cp.getAttribute("data-copy"), "Chemin copié");
    });
    document.body.appendChild(fxBig);
    document.addEventListener("keydown", fxBigKey);
    var fr0 = fxBig.querySelector("iframe");
    if (fr0) { fr0.dataset.mode = "loop"; fr0.addEventListener("load", function () { fxDrive(fr0, "loop"); }); fr0.src = live; }
    wireFxActions(idx, ctx, fxBig);
  }

  // --- adopter, copier, voir en grand (communs aux deux pages) ----------------------
  function fxAdopter(type, id, dans, btn, note) {
    if (btn) btn.disabled = true;
    var body = { type: type, id: id, dans: dans };
    if (typeof note === "string") body.note = note;
    return postJSON("/api/ma-charte", body).then(function () {
      toast(type === "chaine" ? (dans ? "Référence notée" : "Référence retirée") : (dans ? "Carte adoptée dans ma DA" : "Retirée de ma DA"));
      fxCloseBig();
      effetsCache = null;
      route();
    }).catch(function (e) { toast(e.message || "échec"); if (btn) btn.disabled = false; });
  }
  function wireFxActions(idx, ctx, scope) {
    Array.prototype.forEach.call((scope || view).querySelectorAll("[data-charte-carte]:not([data-wired])"), function (b) {
      b.dataset.wired = "1";
      b.onclick = function (e) { e.preventDefault(); e.stopPropagation(); fxAdopter("carte", b.getAttribute("data-charte-carte"), b.getAttribute("data-dans") === "1", b); };
    });
    Array.prototype.forEach.call((scope || view).querySelectorAll("[data-claude]:not([data-wired])"), function (b) {
      b.dataset.wired = "1";
      b.onclick = function () { var x = fxEntry(idx, b.getAttribute("data-claude")); if (x) copyText(fxCopieClaude(idx, x), "Copié pour Claude"); };
    });
    Array.prototype.forEach.call((scope || view).querySelectorAll("[data-open]:not([data-wired])"), function (b) {
      b.dataset.wired = "1";
      b.onclick = function (e) { e.preventDefault(); var x = fxEntry(idx, b.getAttribute("data-open")); if (x) fxOpenBig(idx, x, ctx); };
    });
  }

  // Les sections par type d'effet, dans l'ordre du vocabulaire. Un effet choisi
  // n'en laisse qu'une. Au-delà de FX_PAGE cartes, « Afficher plus ».
  function fxEffetsOrdonnes(idx) {
    var familles = (idx.vocabulaire.familles || []).map(function (x) { return x.id; });
    return (idx.vocabulaire.effets || []).slice().sort(function (a, b) { return familles.indexOf(a.famille) - familles.indexOf(b.famille); });
  }
  function fxSectionsHTML(idx, cards, f, ctx) {
    var effets = fxEffetsOrdonnes(idx);
    var n = 0, cap = fxShown;
    var html = effets.map(function (e) {
      var list = cards.filter(function (x) { return x.effet === e.id || (f.effet === e.id && (x.effets_secondaires || []).indexOf(e.id) !== -1); });
      if (!list.length) return "";
      var shown = list.slice(0, Math.max(0, cap - n));
      n += shown.length;
      if (!shown.length) return "";
      return '<section class="anim-sec" id="fx-' + esc(e.id) + '"><div class="sec-title"><span class="fam">' + esc(fxNomFamille(idx, e.famille)) + ' ›</span> ' + esc(e.nom) + '<span class="n">' + list.length + '</span><span class="hint">' + esc(e.description) + "</span></div>" +
        '<div class="fx-grid">' + shown.map(function (x) { return fxCardHTML(idx, x, ctx); }).join("") + "</div></section>";
    }).join("");
    if (cards.length > n) html += '<div class="fx-more"><button type="button" class="btn" id="fx-more">Afficher ' + Math.min(FX_PAGE, cards.length - n) + " de plus (" + (cards.length - n) + " restantes)</button></div>";
    return html;
  }
  function fxChipsHTML(idx, cards, f, base) {
    var familles = idx.vocabulaire.familles || [];
    var effets = idx.vocabulaire.effets || [];
    var parFam = {}, parEff = {};
    cards.forEach(function (x) { parEff[x.effet] = (parEff[x.effet] || 0) + 1; var fm = fxFamille(idx, x.effet); parFam[fm] = (parFam[fm] || 0) + 1; });
    var html = '<div class="fx-chips"><a class="fx-chip' + (!f.famille && !f.effet ? " on" : "") + '" href="' + qsLink(base, f, { famille: null, effet: null }) + '">Tout <span class="tnum">' + cards.length + "</span></a>" +
      familles.map(function (fm) {
        if (!parFam[fm.id] && f.famille !== fm.id) return "";
        return '<a class="fx-chip' + (f.famille === fm.id ? " on" : "") + '" href="' + qsLink(base, f, { famille: f.famille === fm.id ? null : fm.id, effet: null }) + '" title="' + esc(fm.description) + '">' + esc(fm.nom) + ' <span class="tnum">' + (parFam[fm.id] || 0) + "</span></a>";
      }).join("") + "</div>";
    if (f.famille) {
      html += '<div class="fx-chips sub">' + effets.filter(function (e) { return e.famille === f.famille && (parEff[e.id] || f.effet === e.id); }).map(function (e) {
        return '<a class="fx-chip small' + (f.effet === e.id ? " on" : "") + '" href="' + qsLink(base, f, { effet: f.effet === e.id ? null : e.id }) + '" title="' + esc(e.description) + '">' + esc(e.nom) + ' <span class="tnum">' + (parEff[e.id] || 0) + "</span></a>";
      }).join("") + "</div>";
    }
    return html;
  }
  function fxFiltersHTML(f, placeholder) {
    return '<div class="filters fx-filters">' +
      '<input class="input" id="fx-q" type="search" placeholder="' + esc(placeholder || "Chercher : compteur, verre, zoom, un slot…") + '" value="' + esc(f.q || "") + '">' +
      '<select class="select" id="fx-format"><option value="">Tous les formats</option><option value="16:9"' + (f.format === "16:9" ? " selected" : "") + '>16:9 horizontal</option><option value="9:16"' + (f.format === "9:16" ? " selected" : "") + '>9:16 vertical</option></select>' +
      '<select class="select" id="fx-charte"><option value="">Neutres et habillés</option><option value="neutre"' + (f.charte === "neutre" ? " selected" : "") + '>Neutres (mécanique seule)</option><option value="habille"' + (f.charte === "habille" ? " selected" : "") + '>Habillés (look de la chaîne)</option></select>' +
      "</div>";
  }
  function fxWireFilters(base, f, render, idx, ctx, cards) {
    var q = document.getElementById("fx-q"), qt = null;
    if (q) q.oninput = function () {
      clearTimeout(qt);
      qt = setTimeout(function () {
        history.replaceState(null, "", qsLink(base, f, { q: q.value.trim() || null }));
        render(location.hash.split("?")[1] || "").then(function () {
          var nq = document.getElementById("fx-q");
          if (nq) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); }
        });
      }, 260);
    };
    var fs = document.getElementById("fx-format");
    if (fs) fs.onchange = function () { location.hash = qsLink(base, f, { format: this.value || null }); };
    var cs = document.getElementById("fx-charte");
    if (cs) cs.onchange = function () { location.hash = qsLink(base, f, { charte: this.value || null }); };
    var more = document.getElementById("fx-more");
    if (more) more.onclick = function () {
      fxShown += FX_PAGE;
      var box = document.getElementById("fx-sections");
      if (!box) return;
      box.innerHTML = fxSectionsHTML(idx, cards, f, ctx);
      fxWireMedia(box); wireFxActions(idx, ctx, box);
      fxWireFilters(base, f, render, idx, ctx, cards);
    };
    fxWireMedia(view);
    wireFxActions(idx, ctx, view);
  }

  // --- Ma DA › Mes animations -----------------------------------------------------
  function renderAnimations(query) {
    setActiveNav("ma-da");
    var f = parseQuery(query);
    fxShown = FX_PAGE;
    if (!effetsCache) h(subnavHTML("ma-da", "animations") + '<div class="view-head"><div><h1 class="view-title">Mes <span class="serif">animations</span></h1><div class="view-sub">chargement…</div></div></div>');
    return loadEffets().then(function (idx) { drawAnimations(idx, f); }).catch(showError);
  }
  function drawAnimations(idx, f) {
    var base = "#/ma-da/animations";
    var mine = (idx.entrees || []).filter(function (x) { return x.dans_ma_charte; });
    var kept = mine.filter(function (x) { return fxOk(x, f, idx); });
    var ctx = { montrerDA: false, montrerChaine: false, effetHref: function (id) { return qsLink(base, f, { famille: fxFamille(idx, id), effet: f.effet === id ? null : id }); }, chaineHref: function (id) { return id === "maison" ? base : "#/inspiration/montage/" + enc(id); } };
    var refs = (idx.chaines || []).filter(function (c) { return c.reference; });
    var vides = (idx.vocabulaire.effets || []).filter(function (e) { return !mine.some(function (x) { return x.effet === e.id; }); });
    var adoptees = mine.filter(function (x) { return x.charte_via === "carte"; }).length;
    var vocabNote = idx.vocabulaire.valide ? "" : ' · <span class="fx-warn" title="Les 16 mots des types d\'effets sont une proposition tant que tu ne les as pas validés">types d\'effets proposés, à valider</span>';
    h(subnavHTML("ma-da", "animations") +
      '<div class="view-head"><div><h1 class="view-title">Mes <span class="serif">animations</span></h1>' +
        '<div class="view-sub">' + mine.length + " cartes qu'on monte telles quelles dans tes vidéos : ta charte <code>10-maison</code>" + (adoptees ? " et " + plural(adoptees, "carte adoptée", "cartes adoptées") + " depuis l'inspiration" : "") + ", rangées par famille puis par type d'effet. Survole pour lire, clique pour explorer." + vocabNote +
          ' · <a href="/donnees/effets/INDEX.md" target="_blank" rel="noopener">INDEX.md</a></div></div>' +
        '<div class="topbar-right"><a class="btn" href="#/inspiration/montage">Chercher dans l\'inspiration</a></div></div>' +
      fxFiltersHTML(f) + fxChipsHTML(idx, mine.filter(function (x) { return fxOk(x, { format: f.format, charte: f.charte, q: f.q }, idx); }), f, base) +
      '<section class="ex-part"><h2 class="part-title">Dans mes vidéos <span class="hint">des extraits réels, survole pour lire, clique pour voir en grand avec le son</span></h2><div id="ex-anim"><span class="faint">chargement…</span></div></section>' +
      '<h2 class="part-title">Les cartes de ma charte <span class="hint">prêtes à monter, jouées en direct au survol</span></h2>' +
      '<div id="fx-sections">' + (kept.length ? fxSectionsHTML(idx, kept, f, ctx) : '<div class="empty">Rien ne correspond. <a href="' + base + '">Tout effacer</a></div>') + "</div>" +
      (refs.length ? '<div class="panel"><div class="panel-head"><h2>Mes références de montage</h2><span class="hint">des chaînes d\'inspiration que tu as notées : on y regarde la mécanique, on la refait dans ta charte</span></div><div class="panel-body refs">' +
        refs.map(function (c) { return '<a class="ref" href="#/inspiration/montage/' + enc(c.id) + '"><b>' + esc(c.nom) + '</b><span class="serif">' + esc(c.reference_note || "") + "</span></a>"; }).join("") + "</div></div>" : "") +
      (vides.length ? '<div class="faint" style="margin:16px 4px 0;font-size:12.5px">Pas encore d\'animation à toi pour : ' + vides.map(function (e) { return esc(e.nom); }).join(", ") + ". Adopte-en une dans l'inspiration, ou on l'invente dans ta charte.</div>" : ""));
    fxWireFilters(base, f, renderAnimations, idx, ctx, kept);
    exRemplir("ex-anim", function (e) {
      if (f.famille && e.famille !== f.famille) return false;
      if (f.effet && e.effet !== f.effet) return false;
      var court = !!((exemplesCache && exemplesCache.videos[e.video]) || {}).court;
      if (f.format === "9:16" && !court) return false;
      if (f.format === "16:9" && court) return false;
      if (f.q && (e.titre + " " + e.ce_qu_on_voit + " " + e.comment).toLowerCase().indexOf(f.q.toLowerCase()) === -1) return false;
      return true;
    }, function (j) { return (j.exemples || []).length ? '<span class="faint">Aucun extrait pour ce filtre.</span>'
      : '<div class="empty">Pas encore d\'extrait de tes vidéos. Après ta première vidéo publiée, demande à Claude : « relève les animations marquantes de cette vidéo dans donnees/exemples/exemples.json et lance npm run exemples ». Elles apparaîtront ici, jouées au survol.</div>'; });
  }

  // --- Inspiration › Montage : les autres chaînes, puis une chaîne ----------------
  function renderMontage(chaine, query) {
    setActiveNav("inspiration");
    var f = parseQuery(query);
    fxShown = FX_PAGE;
    if (!effetsCache) h(subnavHTML("inspiration", "montage") + '<div class="view-head"><div><h1 class="view-title">Inspiration <span class="serif">montage</span></h1><div class="view-sub">chargement…</div></div></div>');
    return loadEffets().then(function (idx) { if (chaine) drawChaine(idx, chaine, f); else drawChaines(idx); }).catch(showError);
  }
  function paletteHTML(p) {
    if (!p) return "";
    return '<span class="pal-row">' + Object.keys(p).filter(function (k) { return k !== "notes" && /^#/.test(String(p[k])); }).slice(0, 6).map(function (k) {
      return '<span class="chip" title="' + esc(k + " " + p[k]) + '" style="background:' + esc(p[k]) + '"></span>';
    }).join("") + "</span>";
  }
  function premiereCarte(idx, chaineId) {
    var cards = (idx.entrees || []).filter(function (x) { return x.chaine === chaineId && x.apercu && x.apercu.live && !x.variantes; });
    cards.sort(function (a, b) { return (a.tier === "tier1" ? 0 : 1) - (b.tier === "tier1" ? 0 : 1); });
    return cards[0] || null;
  }
  function drawChaines(idx) {
    var chaines = (idx.chaines || []).filter(function (c) { return c.id !== "maison"; });
    chaines.sort(function (a, b) { return (b.reference ? 1 : 0) - (a.reference ? 1 : 0) || a.ordre - b.ordre; });
    var nCartes = (idx.entrees || []).filter(function (x) { return !x.dans_ma_charte; }).length;
    h(subnavHTML("inspiration", "montage") +
      '<div class="view-head"><div><h1 class="view-title">Inspiration <span class="serif">montage</span></h1>' +
        '<div class="view-sub">' + plural(chaines.length, "chaîne", "chaînes") + " et " + nCartes + " cartes : les styles des autres, à regarder pour leur mécanique et à refaire dans ta charte. Une carte qui te plaît s'adopte d'un clic (« Mettre dans ma DA ») et passe dans tes animations. Encadré jaune = ta référence notée.</div></div></div>" +
      '<div class="ch-grid">' + chaines.map(function (c) {
        var first = premiereCarte(idx, c.id);
        var vert = c.format_defaut === "9:16";
        var media = first
          ? '<div class="fx-media' + (vert ? " vert" : "") + '" data-live="' + esc(fxWs(first.apercu.live)) + '" data-w="' + first.apercu.w + '" data-h="' + first.apercu.h + '"></div>'
          : '<div class="fx-media"></div>';
        return '<a class="ch-card' + (c.reference ? " ref" : "") + '" href="#/inspiration/montage/' + enc(c.id) + '">' + media +
          '<div class="ch-body"><div class="ch-name">' + esc(c.nom) + "" + "</div>" +
            '<div class="ch-sub">' + esc(c.format_defaut) + " · " + c.n_cartes + " cartes" + (c.n_variantes ? " + " + c.n_variantes + " variantes" : "") + "</div>" +
            (c.resume ? '<div class="ch-resume">' + esc(c.resume) + "</div>" : "") +
            paletteHTML(c.palette) +
            (c.reference ? '<div class="fx-note">' + esc(c.reference_note || "ma référence") + "</div>" : "") +
          "</div></a>";
      }).join("") + "</div>");
    fxWireMedia(view);
  }
  function drawChaine(idx, id, f) {
    var c = fxChaine(idx, id);
    if (!c || id === "maison") { h(subnavHTML("inspiration", "montage") + '<div class="error-box">Chaîne inconnue : <code>' + esc(id) + '</code>. <a href="#/inspiration/montage">Retour</a></div>'); return; }
    var base = "#/inspiration/montage/" + enc(id);
    var cards = (idx.entrees || []).filter(function (x) { return x.chaine === id; });
    var kept = cards.filter(function (x) { return fxOk(x, f, idx); });
    var ctx = { montrerDA: true, montrerChaine: false, effetHref: function (e) { return qsLink(base, f, { famille: fxFamille(idx, e), effet: f.effet === e ? null : e }); }, chaineHref: function (ch) { return "#/inspiration/montage/" + enc(ch); } };
    h(subnavHTML("inspiration", "montage") +
      '<div class="crumbs"><a href="#/inspiration/montage">Inspiration montage</a><span>›</span><span>' + esc(c.nom) + "</span></div>" +
      '<div class="view-head"><div><h1 class="view-title">' + esc(c.nom) + "" + "</h1>" +
        '<div class="view-sub">' + esc(c.resume || "") + (c.note ? ' <span class="faint">· ' + esc(c.note) + "</span>" : "") + "<br>" + paletteHTML(c.palette) +
          ' <span class="faint">' + esc(c.format_defaut) + " · " + c.n_cartes + " cartes" + (c.n_variantes ? " + " + c.n_variantes + " variantes repliées" : "") + "</span>" +
          (c.design ? ' · <a href="' + esc(fxWs(c.design)) + '" target="_blank" rel="noopener">DESIGN.md</a>' : "") + "</div>" +
        (c.reference ? '<div class="fx-note" style="margin-top:8px">' + esc(c.reference_note || "") + "</div>" : "") + "</div>" +
        '<div class="topbar-right">' +
          (c.reference ? '<button type="button" class="btn" id="ch-ref-edit">Modifier ma note</button><button type="button" class="btn btn-ghost" id="ch-ref-off">Retirer la référence</button>'
            : '<button type="button" class="btn" id="ch-ref-on">Ma référence pour…</button>') +
        "</div></div>" +
      fxFiltersHTML(f) + fxChipsHTML(idx, cards.filter(function (x) { return fxOk(x, { format: f.format, charte: f.charte, q: f.q }, idx); }), f, base) +
      '<div id="fx-sections">' + (kept.length ? fxSectionsHTML(idx, kept, f, ctx) : '<div class="empty">Rien ne correspond. <a href="' + base + '">Tout effacer</a></div>') + "</div>");
    function noteDialog(initial) {
      return formDialog("Ma référence : " + c.nom, [{ name: "note", label: "Pourquoi je la regarde, pour quel usage", type: "text", value: initial || "", placeholder: "ex. mon style pour le YouTube long" }], "Enregistrer",
        "La note sert à Claude avant un storyboard. Ça ne copie aucune carte dans ta DA : une référence se regarde, une carte s'adopte.");
    }
    var on = document.getElementById("ch-ref-on"), ed = document.getElementById("ch-ref-edit"), off = document.getElementById("ch-ref-off");
    if (on) on.onclick = function () { noteDialog("").then(function (r) { if (r) fxAdopter("chaine", id, true, on, r.note || ""); }); };
    if (ed) ed.onclick = function () { noteDialog(c.reference_note).then(function (r) { if (r) fxAdopter("chaine", id, true, ed, r.note || ""); }); };
    if (off) off.onclick = function () { fxAdopter("chaine", id, false, off); };
    fxWireFilters(base, f, function (qq) { return renderMontage(id, qq); }, idx, ctx, kept);
  }

  // =====================================================================
  // Inspiration › Motion design : la vitrine, dans le hub, sur noir
  // =====================================================================
  var vitrineCache = null;
  var vt = { data: null, byId: {}, order: [], f: {}, ov: null, cur: -1 };
  function loadVitrine(force) {
    if (vitrineCache && !force) return Promise.resolve(vitrineCache);
    return api("/api/vitrine").then(function (d) { vitrineCache = d; return d; });
  }
  function vtNomEffet(id) { var e = (vt.data.effets || []).filter(function (x) { return x.id === id; })[0]; return e ? e.nom : id; }
  function vtHash() {
    var f = vt.f, parts = [];
    if (f.q) parts.push("q=" + enc(f.q));
    if (f.usage) parts.push("usage=" + enc(f.usage));
    if (f.pins) parts.push("epingles=1");
    if (vt.ov && vt.cur >= 0) parts.push("voir=" + enc(vt.order[vt.cur]));
    history.replaceState(null, "", "#/inspiration/motion" + (parts.length ? "?" + parts.join("&") : ""));
  }
  function vtMatches(r) {
    var f = vt.f;
    if (f.pins && !r.epingle) return false;
    if (f.usage && r.usages.indexOf(f.usage) === -1) return false;
    if (f.q) {
      var m = r.mecanique || {};
      var hay = [r.titre, r.titre_original, r.resume, r.auteur, r.source_nom, r.ideal_pour, m.transitions, m.rythme, m.texte, (m.techniques || []).join(" "), (r.effets || []).map(vtNomEffet).join(" "), r.prompt].join(" ").toLowerCase();
      if (!f.q.toLowerCase().split(/\s+/).every(function (w) { return !w || hay.indexOf(w) !== -1; })) return false;
    }
    return true;
  }
  function vtTileHTML(r) {
    var a = r.apercu || {};
    var img = a.thumb || a.poster ? fxWs(a.thumb || a.poster) : "";
    var mp4 = a.mp4 ? fxWs(a.mp4) : "";
    return '<article class="vt-tile' + (r.epingle ? " pinned" : "") + '" tabindex="0" data-id="' + esc(r.id) + '">' +
      '<div class="vt-media" data-mp4="' + esc(mp4) + '">' +
        (img ? '<img loading="lazy" decoding="async" src="' + esc(img) + '" alt="">' : '<div class="vt-ph">aperçu absent</div>') +
        "" +
        (r.format ? '<span class="vt-fmt">' + esc(r.format) + "</span>" : "") +
        (r.epingle ? '<span class="vt-pin" title="' + (r.favori_par === "claude" ? "Favori proposé par Claude" : "Ton favori") + '">♥</span>' : "") +
      "</div>" +
      '<div class="vt-cap"><div class="t">' + esc(r.titre) + '</div><div class="s"><b>' + esc(r.source === "prompt-motion" ? r.auteur : r.source_nom) + "</b>" +
        (r.mecanique && r.mecanique.techniques.length ? "<span>" + esc(r.mecanique.techniques.slice(0, 2).join(" · ")) + "</span>" : "") + "</div></div>" +
    "</article>";
  }
  function vtWireHover(scope) {
    Array.prototype.forEach.call(scope.querySelectorAll(".vt-media[data-mp4]:not([data-wired])"), function (box) {
      box.dataset.wired = "1";
      var mp4 = box.getAttribute("data-mp4");
      if (!mp4) return;
      var v = null, tile = box.closest(".vt-tile");
      tile.addEventListener("mouseenter", function () {
        if (!v) { v = document.createElement("video"); v.muted = true; v.loop = true; v.playsInline = true; v.preload = "metadata"; v.src = mp4; box.appendChild(v); }
        v.play().catch(function () {}); box.classList.add("live");
      });
      tile.addEventListener("mouseleave", function () { if (v) v.pause(); box.classList.remove("live"); });
    });
  }
  function renderMotion(query) {
    setActiveNav("inspiration");
    var q = parseQuery(query);
    vt.f = { q: q.q || "", usage: q.usage || "", pins: q.epingles === "1" };
    if (!vitrineCache) h(subnavHTML("inspiration", "motion") + '<div class="view-head"><div><h1 class="view-title">Inspiration <span class="serif">motion design</span></h1><div class="view-sub">chargement…</div></div></div>');
    return loadVitrine().then(function (d) {
      if (d.absent) {
        h(subnavHTML("inspiration", "motion") + '<div class="view-head"><div><h1 class="view-title">Inspiration <span class="serif">motion design</span></h1>' +
          '<div class="view-sub">La bibliothèque motion n\'est pas encore téléchargée sur cette machine.</div></div></div>' +
          '<div class="empty">Dans un terminal, à la racine du dossier :<br><code>npm run motion:import</code> puis <code>npm run vitrine</code><br>et recharge la page. Ça récupère ~270 exemples de motion design avec leur démo et leur prompt.</div>');
        return;
      }
      vt.data = d; vt.byId = {};
      // les styles de la style-library sont dans Montage : ici le motion design seul
      d.references.forEach(function (r) { if (r.source !== "styles") vt.byId[r.id] = r; });
      drawMotion();
      if (q.voir && vt.byId[q.voir]) { var i = vt.order.indexOf(q.voir); if (i >= 0) vtOpenAt(i); }
    }).catch(showError);
  }
  function drawMotion() {
    var d = vt.data, f = vt.f;
    var refs = Object.keys(vt.byId).map(function (k) { return vt.byId[k]; });
    var filtered = !!(f.q || f.usage || f.pins);
    vt.order = [];
    var rangees = d.rangees.map(function (row) { return { id: row.id, nom: row.nom, hint: row.hint, refs: row.refs.filter(function (id) { return vt.byId[id]; }) }; }).filter(function (r) { return r.refs.length; });
    var chips = '<div class="vt-chips"><button type="button" class="vt-chip' + (!f.usage ? " on" : "") + '" data-usage="">Tout</button>' +
      rangees.filter(function (r) { return r.id !== "favoris"; }).map(function (r) { return '<button type="button" class="vt-chip' + (f.usage === r.id ? " on" : "") + '" data-usage="' + esc(r.id) + '" title="' + esc(r.hint || "") + '">' + esc(r.nom) + '<span class="n tnum">' + r.refs.length + "</span></button>"; }).join("") + "</div>";
    var body;
    if (!filtered) {
      body = rangees.map(function (row) {
        var list = row.refs.map(function (id) { return vt.byId[id]; });
        list.forEach(function (r) { if (vt.order.indexOf(r.id) === -1) vt.order.push(r.id); });
        return '<section class="vt-row"><div class="vt-row-head"><h2>' + (row.id === "favoris" ? '<span class="star">♥</span>' : "") + esc(row.nom) + "</h2>" +
          '<span class="hint">' + esc(row.hint || "") + '</span><span class="n tnum">' + list.length + "</span></div>" +
          '<div class="vt-strip">' + list.map(vtTileHTML).join("") + "</div></section>";
      }).join("");
    } else {
      var list = refs.filter(vtMatches).sort(function (a, b) { return (a.epingle ? 0 : 1) - (b.epingle ? 0 : 1); });
      vt.order = list.map(function (r) { return r.id; });
      body = '<div class="vt-count tnum">' + list.length + " référence" + (list.length > 1 ? "s" : "") + ' · <a href="#/inspiration/motion">tout effacer</a></div>' +
        (list.length ? '<div class="vt-grid">' + list.map(vtTileHTML).join("") + "</div>" : '<div class="vt-empty">Rien ne correspond.</div>');
    }
    var nPep = refs.filter(function (r) { return r.epingle; }).length;
    h(subnavHTML("inspiration", "motion") +
      '<div class="vt">' +
        '<div class="vt-top">' +
          '<div class="vt-title">Inspiration <em>motion design</em><span class="n tnum">' + refs.length + " références · " + nPep + " favoris" + (d.resume.faibles ? " · " + d.resume.faibles + " faibles écartées" : "") + "</span></div>" +
          '<input class="vt-search" id="vt-q" type="search" placeholder="Chercher une mécanique, un mot : compteur, verre, zoom, terminal…" value="' + esc(f.q) + '" autocomplete="off">' +
          '<label class="vt-sw' + (f.pins ? " on" : "") + '"><input type="checkbox" id="vt-pins"' + (f.pins ? " checked" : "") + "> ♥ mes favoris seulement</label>" +
          '<span class="vt-hint"><b>♥ Favoris</b> : les tiens, plus ceux que Claude a trouvés les plus forts ; retire d\'un clic ce qui ne te parle pas. Pocinho et Prompt Motion se regardent et s\'imitent, rien ne se monte tel quel. Fiche au clic, flèches pour naviguer, Échap pour fermer.</span>' +
        "</div>" + chips + '<div class="vt-main">' + body + "</div>" +
      "</div>");
    var main = view.querySelector(".vt-main");
    vtWireHover(main);
    Array.prototype.forEach.call(view.querySelectorAll(".vt-chip"), function (b) { b.onclick = function () { vt.f.usage = b.getAttribute("data-usage"); vtHash(); drawMotion(); }; });
    var qi = document.getElementById("vt-q"), qt = null;
    qi.oninput = function () { clearTimeout(qt); var v = qi.value; qt = setTimeout(function () { vt.f.q = v.trim(); vtHash(); drawMotion(); var nq = document.getElementById("vt-q"); if (nq) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); } }, 220); };
    document.getElementById("vt-pins").onchange = function () { vt.f.pins = this.checked; vtHash(); drawMotion(); };
    main.onclick = function (e) { var t = e.target.closest(".vt-tile"); if (!t) return; var i = vt.order.indexOf(t.getAttribute("data-id")); if (i >= 0) vtOpenAt(i); };
    main.onkeydown = function (e) { var t = e.target.closest(".vt-tile"); if (!t || (e.key !== "Enter" && e.key !== " ")) return; e.preventDefault(); var i = vt.order.indexOf(t.getAttribute("data-id")); if (i >= 0) vtOpenAt(i); };
    document.removeEventListener("keydown", vtKey);
    document.addEventListener("keydown", vtKey);
  }
  function vtKey(e) {
    if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName) && e.key !== "Escape") return;
    if (e.key === "Escape") { if (vt.ov) { e.preventDefault(); vtClose(); } }
    else if (vt.ov && e.key === "ArrowRight") { e.preventDefault(); vtOpenAt(vt.cur + 1); }
    else if (vt.ov && e.key === "ArrowLeft") { e.preventDefault(); vtOpenAt(vt.cur - 1); }
    else if (!vt.ov && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      var row = document.querySelector(".vt-row:hover .vt-strip"); if (row) { e.preventDefault(); row.scrollBy({ left: (e.key === "ArrowRight" ? 1 : -1) * 640, behavior: "smooth" }); }
    }
  }
  function vtTeardown() { document.removeEventListener("keydown", vtKey); if (vt.ov) { vt.ov.remove(); vt.ov = null; vt.cur = -1; document.body.style.overflow = ""; } }
  function vtClose() { vtTeardown(); vtHash(); }
  function vtOpenAt(i) {
    if (i < 0 || i >= vt.order.length) return;
    vt.cur = i;
    var r = vt.byId[vt.order[i]], d = vt.data;
    if (!r) return;
    var a = r.apercu || {};
    var demo = a.demo || a.mp4 ? fxWs(a.demo || a.mp4) : "";
    var vert = r.format === "9:16";
    var m = r.mecanique;
    if (!vt.ov) {
      vt.ov = document.createElement("div"); vt.ov.className = "vt-ov";
      vt.ov.addEventListener("click", function (e) { if (e.target === vt.ov) vtClose(); });
      document.body.appendChild(vt.ov);
      document.body.style.overflow = "hidden";
    }
    vt.ov.innerHTML =
      '<button type="button" class="vt-nav prev" data-nav="-1" title="Précédente (←)">‹</button><button type="button" class="vt-nav next" data-nav="1" title="Suivante (→)">›</button>' +
      '<div class="vt-pos tnum">' + (i + 1) + " / " + vt.order.length + " · flèches pour naviguer · Échap pour fermer</div>" +
      '<div class="vt-sheet' + (vert ? " vert" : "") + '" role="dialog" aria-modal="true" aria-label="' + esc(r.titre) + '">' +
        '<button type="button" class="vt-close" data-close="1" title="Fermer (Échap)">×</button>' +
        "<div>" +
          '<div class="vt-stage">' + (demo ? '<video controls autoplay muted loop playsinline preload="auto" src="' + esc(demo) + '"' + (a.poster ? ' poster="' + esc(fxWs(a.poster)) + '"' : "") + "></video>"
            : '<div class="vt-ph">Aucun aperçu local' + (a.distant ? ' · <a href="' + esc(a.distant) + '" target="_blank" rel="noopener">voir en ligne</a>' : "") + "</div>") + "</div>" +
          (a.planche ? '<div class="vt-planche"><h4>La planche, 12 images sur toute la vidéo</h4><img loading="lazy" src="' + esc(fxWs(a.planche)) + '" alt="Planche de 12 images"></div>' : "") +
        "</div>" +
        '<div class="vt-side">' +
          (r.epingle ? '<span class="vt-niv pepite">♥ ' + (r.favori_par === "claude" ? "Favori proposé par Claude" : "Ton favori") + "</span>" : "") +
          "<h2>" + esc(r.titre) + "</h2>" +
          '<div class="by">' + (r.titre_original ? "« " + esc(r.titre_original) + " » · " : "") + esc(r.auteur) + " · " + (r.url ? '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.source_nom) + "</a>" : esc(r.source_nom)) + (r.format ? " · " + esc(r.format) : "") + (r.duree ? " · " + r.duree + " s" : "") + (r.tech ? " · " + esc(r.tech) : "") + "</div>" +
          (r.resume ? "<p>" + esc(r.resume) + "</p>" : "") +
          (r.pourquoi ? '<p class="why">' + esc(r.pourquoi) + "</p>" : "") +
          (r.note_epingle ? '<div class="vt-note">' + esc(r.note_epingle) + "</div>" : "") +
          '<div class="vt-acts">' +
            '<button type="button" class="vt-btn' + (r.epingle ? " on" : "") + '" data-pin="' + esc(r.id) + '">' + (r.epingle ? "Retirer de mes favoris" : "♡ Ajouter à mes favoris") + "</button>" +
            '<button type="button" class="vt-btn primary" data-copy-prompt="1">Copier le prompt</button>' +
            (r.fiche ? '<a class="vt-btn" href="' + esc(fxWs(r.fiche)) + '" target="_blank" rel="noopener">Fiche .md</a>' : "") +
          "</div>" +
          (m ? '<div class="vt-meca"><h4>La mécanique à reprendre</h4><dl>' +
              "<dt>Transitions</dt><dd>" + esc(m.transitions) + "</dd><dt>Rythme</dt><dd>" + esc(m.rythme) + "</dd><dt>Texte</dt><dd>" + esc(m.texte) + "</dd></dl>" +
              '<div class="vt-tags">' + m.techniques.map(function (t) { return '<button type="button" class="vt-tag" data-q="' + esc(t) + '">' + esc(t) + "</button>"; }).join("") + "</div>" +
              ((r.effets || []).length ? '<div class="vt-tags">' + r.effets.map(function (e) { return '<a class="vt-tag fx" href="#/ma-da/animations?effet=' + enc(e) + '" title="Mes animations de ce type">' + esc(vtNomEffet(e)) + "</a>"; }).join("") + "</div>" : "") +
            "</div>" : "") +
          '<dl class="vt-facts">' +
            (r.ideal_pour ? "<dt>Idéal pour</dt><dd>" + esc(r.ideal_pour) + "</dd>" : "") +
            (r.difficulte ? "<dt>Rendu HTML</dt><dd>" + esc(r.difficulte) + "</dd>" : "") +
            (r.usages.length ? "<dt>Usages</dt><dd>" + esc(r.usages.map(function (u) { return d.usages[u] ? d.usages[u].label : u; }).join(", ")) + "</dd>" : "") +
            (r.fiche ? "<dt>Fiche</dt><dd><code>" + esc(r.fiche) + "</code></dd>" : "") +
          "</dl>" +
          '<div class="vt-prompt"><h4>' + (r.prompt_type === "skill" ? "Skill" : "Prompt") + "</h4>" +
            (r.prompt_generique ? '<div class="note">Consigne virale générique : elle ne décrit pas cette vidéo, la mécanique ci-dessus en dit plus.</div>' : r.prompt_court ? '<div class="note">Très court : l\'essentiel est dans la vidéo.</div>' : "") +
            "<pre>" + esc(r.prompt || "(pas de prompt)") + "</pre></div>" +
        "</div>" +
      "</div>";
    vt.ov.querySelector("[data-close]").onclick = vtClose;
    Array.prototype.forEach.call(vt.ov.querySelectorAll("[data-nav]"), function (b) { b.onclick = function () { vtOpenAt(vt.cur + (+b.getAttribute("data-nav"))); }; });
    vt.ov.querySelector("[data-copy-prompt]").onclick = function () { copyText(r.prompt || "", "Prompt copié"); };
    Array.prototype.forEach.call(vt.ov.querySelectorAll(".vt-tag[data-q]"), function (b) { b.onclick = function () { vtTeardown(); vt.f.q = b.getAttribute("data-q"); vt.f.usage = ""; vtHash(); drawMotion(); }; });
    var pin = vt.ov.querySelector("[data-pin]");
    pin.onclick = function () {
      pin.disabled = true;
      postJSON("/api/epingle", { id: r.id, epingle: !r.epingle }).then(function (res) {
        r.epingle = !!(res.epingle && res.epingle.epingle); r.note_epingle = res.epingle && res.epingle.note || "";
        pin.disabled = false; pin.classList.toggle("on", r.epingle); pin.textContent = r.epingle ? "Retirer de mes favoris" : "♡ Ajouter à mes favoris"; r.favori_par = r.epingle ? "toi" : null;
        var t = document.querySelector('.vt-tile[data-id="' + r.id.replace(/"/g, "") + '"]'); if (t) t.classList.toggle("pinned", r.epingle);
        toast(r.epingle ? "Ajouté à tes favoris" : "Retiré de tes favoris");
      }).catch(function (e) { pin.disabled = false; toast(e.message || "échec"); });
    };
    vt.ov.querySelector(".vt-sheet").scrollTop = 0;
    vtHash();
  }

  // =====================================================================
  // Ma DA › Mon style : la charte
  // =====================================================================
  function renderStyle() {
    setActiveNav("ma-da");
    h(subnavHTML("ma-da", "style") + '<div class="view-head"><div><h1 class="view-title">Mon <span class="serif">style</span></h1><div class="view-sub">chargement…</div></div></div>');
    api("/api/charte").then(function (c) {
      var cols = c.couleurs || {};
      function hex(name) { return cols[name] ? cols[name].hex : name; }
      var pal = Object.keys(cols).map(function (k) {
        return '<div class="sw-card"><span class="chip" style="background:' + esc(cols[k].hex) + '"></span><div><div class="nm">' + esc(k) + '</div><div class="hx">' + esc(cols[k].hex) + '</div><div class="ro">' + esc(cols[k].role || "") + "</div></div></div>";
      }).join("");
      var regs = c.registres || {};
      function regHTML(id, r) {
        if (!r) return "";
        var dark = id === "sombre";
        return '<div class="reg ' + esc(id) + '">' +
          "<h3>Registre " + esc(id) + "</h3>" +
          "<div>Un titre en Garet, un mot en <span class=\"em\">italique</span>" + (dark ? "" : ", un <span class=\"hl\">surligné</span>") + "</div>" +
          (dark ? '<div class="sub">UN SOUS-TITRE</div>' : "") +
          '<div class="support">' + esc(r.support || "") + "</div>" +
          "<dl><dt>fond</dt><dd>" + esc(r.fond) + " " + esc(hex(r.fond)) + "</dd><dt>texture</dt><dd>" + esc(r.texture || "") + "</dd><dt>texte</dt><dd>" + esc(r.texte) + "</dd><dt>emphase</dt><dd>" + esc(r.emphase || "") + "</dd><dt>usage</dt><dd>" + esc(r.usage || "") + "</dd></dl>" +
          (r.interdits && r.interdits.length ? '<div class="interdits">Interdit : ' + r.interdits.map(esc).join(" · ") + "</div>" : "") +
          "</div>";
      }
      var typo = c.typo || {};
      var sd = c["sound-design"] || {};
      var sdRows = Object.keys(sd).filter(function (k) { return k !== "fichiers"; }).map(function (k) { return "<tr><td>" + esc(k) + "</td><td>" + esc(sd[k]) + "</td></tr>"; }).join("");
      var formes = c.formes || {};
      var shapes = Object.keys(formes).filter(function (k) { return /^rayon/.test(k); }).map(function (k) {
        return '<div class="shape"><div class="bx" style="border-radius:' + (formes[k] / 2) + 'px"></div><span>' + esc(k) + " · " + esc(formes[k]) + " px</span></div>";
      }).join("") + (formes["ombre-douce"] ? '<div class="shape"><div class="bx" style="border-radius:14px;box-shadow:' + esc(formes["ombre-douce"]) + '"></div><span>ombre douce</span></div>' : "");
      var srcs = c.sources || {};
      h(subnavHTML("ma-da", "style") + '<div class="view-head"><div><h1 class="view-title">Mon <span class="serif">style</span></h1><div class="view-sub">' + esc(c.nom || "") + " · les couleurs, les polices, les deux registres, le sound design et les règles apprises par retours</div></div></div>" +
        '<div class="charte">' +
          '<div class="lead">' + esc(c.decision || "") + "</div>" +

          '<div class="panel"><div class="panel-head"><h2>Palette</h2><span class="hint">le jaune remplit, l\'or écrit</span></div><div class="panel-body pal">' + pal + "</div></div>" +
          '<div class="panel"><div class="panel-head"><h2>Deux registres</h2><span class="hint">clair pour ce qui explique, sombre pour le fond des reels</span></div><div class="panel-body charte-row">' + regHTML("clair", regs.clair) + regHTML("sombre", regs.sombre) + "</div></div>" +
          '<div class="charte-row">' +
            '<div class="panel"><div class="panel-head"><h2>Typographie</h2>' + (typo.fichiers ? '<span class="hint mono">' + esc(typo.fichiers) + "</span>" : "") + '</div><div class="panel-body spec">' +
              '<div class="s"><div class="k"><b>Titre</b>' + esc((typo.titre || {}).famille || "Garet") + " " + esc((typo.titre || {}).graisse || "") + (typo.titre && typo.titre.note ? " · " + esc(typo.titre.note) : "") + '</div><div class="titre">Génération IA</div></div>' +
              '<div class="s"><div class="k"><b>Emphase</b>' + esc((typo.emphase || {}).famille || "Instrument Serif") + " italique" + (typo.emphase && typo.emphase.soulignement ? " · " + esc(typo.emphase.soulignement) : "") + '</div><div class="emph">la méthode</div></div>' +
              '<div class="s"><div class="k"><b>Corps</b>' + esc((typo.corps || {}).famille || "Garet") + " " + esc((typo.corps || {}).graisse || "") + '</div><div class="corps">Une pub IA montrée joue en entier, et une pub finit sur moi en direct.</div></div>' +
              (typo.mono ? '<div class="s"><div class="k"><b>Mono</b>' + esc(typo.mono.famille) + '</div><div class="monosp">renders/reel-v08-master.mp4</div></div>' : "") +
              (typo["sous-titre-reel"] ? '<div class="s"><div class="k"><b>Sous-titre de reel</b>' + esc(typo["sous-titre-reel"].famille) + " " + esc(typo["sous-titre-reel"].graisse) + " · " + esc(typo["sous-titre-reel"].mots_par_groupe) + " mots" + (typo["sous-titre-reel"].mots_jaunes === false ? " · jamais de mot jaune" : "") + '</div><div><span class="soustitre">ET LÀ, TU VOIS</span></div></div>' : "") +
            "</div></div>" +
            '<div><div class="panel"><div class="panel-head"><h2>Formes</h2></div><div class="panel-body shapes">' + shapes + "</div></div>" +
            '<div class="panel" style="margin-top:18px"><div class="panel-head"><h2>Sound design</h2>' + (sd.fichiers ? '<span class="hint mono">' + esc(sd.fichiers) + "</span>" : "") + '</div><div class="panel-body"><table class="table"><thead><tr><th>Son</th><th>Quand</th></tr></thead><tbody>' + sdRows + "</tbody></table></div></div></div>" +
          "</div>" +
          '<div class="panel"><div class="panel-head"><h2>Règles</h2><span class="hint">apprises par retours</span></div><div class="panel-body"><ol class="rules">' + (c.regles || []).map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ol></div></div>" +
          '<div class="panel"><div class="panel-head"><h2>Sources</h2></div><div class="panel-body srcs">' + Object.keys(srcs).map(function (k) { return '<div><span class="k">' + esc(k.replace(/_/g, " ")) + '</span><span class="v">' + esc(srcs[k]) + "</span></div>"; }).join("") + "</div></div>" +
        "</div>");
    }).catch(showError);
  }

  // =====================================================================
  // Santé (pied de page)
  // =====================================================================
  var healthData = null, healthPop = null;
  function pollHealth() {
    var el = document.getElementById("health"), txt = document.getElementById("health-txt");
    api("/api/health").then(function (hd) {
      healthData = hd;
      el.classList.remove("ko"); el.classList.add("ok");
      var up = hd.uptimeSec || 0;
      var ups = up < 3600 ? Math.round(up / 60) + " min" : up < 86400 ? Math.round(up / 3600) + " h" : Math.round(up / 86400) + " j";
      txt.textContent = "Santé : serveur en marche depuis " + ups + (hd.tournages != null ? " · " + plural(hd.tournages, "tournage", "tournages") : "");
    }).catch(function () {
      healthData = null;
      el.classList.remove("ok"); el.classList.add("ko");
      txt.textContent = "Santé : le serveur ne répond pas";
    });
  }
  document.getElementById("health").onclick = function () {
    if (healthPop) { healthPop.remove(); healthPop = null; return; }
    var hd = healthData;
    healthPop = document.createElement("div");
    healthPop.className = "health-pop";
    healthPop.innerHTML = hd
      ? "<dl><dt>Nom</dt><dd>" + esc(hd.nom || "Editing OS") + " " + esc(hd.version || "") + "</dd>" +
        "<dt>Port</dt><dd>" + esc(hd.port) + " (pid " + esc(hd.pid) + ")</dd>" +
        "<dt>En marche depuis</dt><dd>" + esc(Math.round((hd.uptimeSec || 0) / 60)) + " min</dd>" +
        "<dt>Tournages</dt><dd>" + esc(hd.tournages != null ? hd.tournages : "pas encore relevés") + "</dd>" +
        "<dt>Dernier relevé</dt><dd>" + esc(hd.scannedAt ? relTime(hd.scannedAt) : "aucun") + "</dd>" +
        "<dt>Espace de travail</dt><dd><code>" + esc(hd.espace || "") + "</code></dd>" +
        "<dt>Journal</dt><dd><code>" + esc(hd.journal || "") + "</code> <button type=\"button\" class=\"btn-link\" id=\"copy-journal\">Copier</button></dd>" +
        "<dt>Node</dt><dd>" + esc(hd.node || "") + "</dd></dl>"
      : "Le serveur ne répond pas. Relance-le : <code>node hub/server.mjs</code> dans EditingOS-v2.";
    document.body.appendChild(healthPop);
    var cj = document.getElementById("copy-journal");
    if (cj) cj.onclick = function () { copyText(hd.journal, "Chemin du journal copié"); };
    setTimeout(function () {
      document.addEventListener("click", function off(e) {
        if (healthPop && !healthPop.contains(e.target) && e.target.id !== "health" && !e.target.closest("#health")) { healthPop.remove(); healthPop = null; }
        if (!healthPop) document.removeEventListener("click", off);
      });
    }, 0);
  };
  pollHealth();
  setInterval(pollHealth, 60000);

  document.getElementById("rescan").onclick = function () {
    var b = this; b.disabled = true;
    postJSON("/api/rescan", {}).then(function () { stateCache = null; compsCache = null; effetsCache = null; vitrineCache = null; toast("Disque relu"); route(); })
      .catch(function (e) { toast(e.message || "échec"); }).then(function () { b.disabled = false; });
  };

  // =====================================================================
  // Routeur
  // =====================================================================
  function setActiveNav(r) {
    Array.prototype.forEach.call(document.querySelectorAll(".nav-link"), function (a) {
      a.classList.toggle("active", a.getAttribute("data-route") === r);
    });
  }
  function route() {
    clearTimeout(jobTimer);
    fxCloseBig();
    vtTeardown();
    if (healthPop) { healthPop.remove(); healthPop = null; }
    var hsh = location.hash || "#/";
    var m;
    // l'ancienne adresse de review (dashboard v1, citée par les skills) : on ouvre la review du hub
    if ((m = /^#\/review\/([^/?]+)/.exec(hsh))) { location.replace("/review.html?project=" + m[1]); return; }
    if ((m = /^#\/tournage\/(.+)$/.exec(hsh))) { setActiveNav("projets"); renderTournage(decodeURIComponent(m[1])); return; }
    // les anciennes adresses de la première livraison
    if (hsh.indexOf("#/compositions") === 0) { location.replace("#/ma-da/formats"); return; }
    if (hsh.indexOf("#/charte") === 0) { location.replace("#/ma-da/style"); return; }
    if (hsh.indexOf("#/effets") === 0) { location.replace("#/ma-da/animations"); return; }
    if ((m = /^#\/ma-da\/formats(?:\/([^?]+))?/.exec(hsh))) { renderFormats(m[1] ? decodeURIComponent(m[1]) : null); return; }
    if (hsh.indexOf("#/ma-da/style") === 0) { renderStyle(); return; }
    if ((m = /^#\/ma-da\/animations(?:\?(.*))?$/.exec(hsh))) { renderAnimations(m[1] || ""); return; }
    if (hsh.indexOf("#/ma-da") === 0) { location.replace("#/ma-da/style"); return; }
    if ((m = /^#\/inspiration\/montage(?:\/([^?]+))?(?:\?(.*))?$/.exec(hsh))) { renderMontage(m[1] ? decodeURIComponent(m[1]) : null, m[2] || ""); return; }
    if ((m = /^#\/inspiration\/motion(?:\?(.*))?$/.exec(hsh))) { renderMotion(m[1] || ""); return; }
    if (hsh.indexOf("#/inspiration") === 0) { location.replace("#/inspiration/montage"); return; }
    setActiveNav("projets");
    renderTournages();
  }
  window.addEventListener("hashchange", route);
  route();
})();
