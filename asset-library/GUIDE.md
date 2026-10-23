# Asset Library — the b-roll / visual-asset database (Agent 4)

The shared, growing pool of visual assets Agent 4 (`insert-broll`) draws from to lay
cutaways and overlays over a talking-head edit. Mirrors `style-library/` in spirit:
a curated local database + a generated `registry.json` the agent queries.

Two ways assets land here:
1. **Curated** — we drop clips/images/logos in by hand (the "stock assets we use").
2. **Fetched** — provider adapters (Pexels, Pixabay, Unsplash, Openverse, Wikimedia,
   Clearbit/Simple Icons, local Playwright screenshots, Firecrawl, …) pull an asset for
   a moment and **cache it here**, so the library compounds with every video.

## Structure

```
asset-library/
├── GUIDE.md            ← this file (the contract)
├── registry.json       ← generated master index (Agent 4 queries this)
├── clips/              ← video b-roll (.mp4/.mov/.webm)
├── images/             ← photos / stills (.jpg/.png/.webp)
├── logos/              ← brand & tool logos (.svg/.png)
├── screenshots/        ← cached web screenshots (reusable across videos)
└── icons/              ← icon sets / glyphs (.svg)
```

## Asset contract — sidecar metadata

Every asset file *may* have a sidecar `<filename>.json` next to it carrying its
metadata. `build-registry.mjs` reads the sidecar; for files without one it infers
minimal metadata (filename → tags, dimensions/duration via ffprobe).

```json
{
  "tags": ["robot", "automation", "factory", "arm"],
  "description": "Robotic arm assembling on a factory line, slow pan",
  "source": "pexels",                 // local | pexels | pixabay | unsplash | openverse
                                       // | wikimedia | clearbit | simple-icons
                                       // | screenshot | firecrawl | nasa | ...
  "sourceUrl": "https://www.pexels.com/video/...",
  "license": "pexels",                // CC0 | public-domain | pexels | unsplash
                                       // | cc-by | unknown
  "attribution": "Pexels · Author Name",
  "fetchedAt": "2026-06-09"
}
```

Fetched assets get their sidecar written by the adapter automatically. Curated
drop-ins: add a sidecar (at least `tags` + `description` + `license`) so matching works.

## Registry schema (generated — do not hand-edit)

```json
{
  "generated_by": "scripts/asset-library/build-registry.mjs",
  "assetCount": 0,
  "types": ["clip", "image", "logo", "screenshot", "icon"],
  "assets": [
    {
      "id": "clips/robot-arm-pan",     // path-derived, stable
      "type": "clip",
      "file": "clips/robot-arm-pan.mp4",
      "tags": ["robot", "automation"],
      "description": "…",
      "source": "pexels", "license": "pexels", "attribution": "…",
      "sourceUrl": "…",
      "width": 1920, "height": 1080, "duration": 12.4,   // duration: clips only
      "fetchedAt": "2026-06-09"
    }
  ]
}
```

## How Agent 4 uses it

1. `detect-broll.mjs` finds visual moments in the transcript (entities, named tools/URLs,
   visual-cue phrases, pacing gaps) and suggests a `sourceType` + `placement` per moment.
2. Review gate: the agent/user confirm moments, pick a real asset from this registry by
   tag match, OR trigger a provider adapter to fetch one (which caches it here).
3. The assembler comps each asset as a cutaway (full-frame, narration continues) or an
   overlay (PiP, speaker stays visible) into the HyperFrames composition.

## Licensing discipline (this feeds paid course content)

- Prefer **CC0 / public-domain / Pexels / Pixabay / Unsplash** assets for anything in a
  final published frame. Their `license` is clean for commercial use.
- **Firecrawl-scraped** web images and arbitrary screenshots have **unknown** licensing —
  use for internal/reference/comp only, not final frames, unless cleared.
- Logos via Clearbit/Simple Icons are for nominative/editorial reference; keep usage fair.
- `build-registry.mjs` surfaces any asset whose `license` is `unknown` so they're easy to audit.

## Tooling

- `scripts/asset-library/build-registry.mjs` — scan folders, read sidecars, rebuild `registry.json`.
- Provider adapters (added incrementally) live under `scripts/asset-library/providers/` and
  share one interface: `search(query, opts) → [{url, type, license, attribution, width, height, duration}]`
  and `fetch(result) → { file, sidecar }` (downloads into the right folder + writes the sidecar).

## Repo note

Small assets (images, logos, icons, screenshots) commit fine. Large video **clips** can
bloat the repo — if `clips/` grows heavy, switch it to git-lfs or gitignore the binaries
and keep only sidecars. Decide once it actually grows.
