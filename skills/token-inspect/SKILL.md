---
name: token-inspect
description: >-
  Wire SlimVG Token Inspect (Chrome extension) to any project: write
  token-inspect.config.json, run the portable CSS Push writer, and align token
  paths with the design-system skill. Use when the user mentions Token Inspect,
  the Chrome token plugin, Push CSS changes, token-inspect writer, or inspecting
  design tokens in the browser.
---

# Token Inspect (any project)

Works with **design-system-3-level**, **design-system-2-level**, and **css-modules**. The Chrome extension reads live CSS on localhost; the **writer** pushes preview edits into allowlisted CSS files.

## Prerequisites

1. Design tokens exist (run **design-system-3-level** or **design-system-2-level** if not).
2. Naming uses `--primitive-*` and semantic prefixes (`--color-*`, `--space-*`, …).
3. App runs on localhost (Vite or similar).
4. Chrome extension loaded unpacked from this clone’s `extension/` folder (the folder that contains `manifest.json`). One install works for every app.

## Setup checklist

```
- [ ] 1. Ensure token-inspect.config.json at project root (+ public/ copy for Vite)
- [ ] 2. Add npm script for the writer
- [ ] 3. Load/reload Chrome extension from this clone’s `extension/` folder
- [ ] 4. Start writer + app
- [ ] 5. Inspect → edit → Push
```

### 1. Config

Copy [templates/token-inspect.config.json](templates/token-inspect.config.json) to the **project root**. Adapt:

| Field | Meaning |
|-------|---------|
| `layers` | `2` or `3` (must match the design-system skill you ran) |
| `cssRoots` | Relative dirs the writer may modify (e.g. `["src"]`, `["apps/frontend/src"]`) |
| `tokens.primitives` / `tokens.semantic` | Paths to token CSS files |
| `writerPort` | Default `7319` |
| `devOrigins` | Localhost origins for the app |

Also copy config into Vite `public/token-inspect.config.json` so the extension can fetch token paths from the page origin.

### 2. npm script

In the project `package.json`:

```json
"token-inspect:writer": "node \"$HOME/.cursor/skills/token-inspect/scripts/writer.mjs\""
```

Or from repo root:

```bash
node ~/.cursor/skills/token-inspect/scripts/writer.mjs
```

The writer reads `./token-inspect.config.json` (cwd = project root).

Override:

```bash
TOKEN_INSPECT_CONFIG=./token-inspect.config.json node ~/.cursor/skills/token-inspect/scripts/writer.mjs
```

### 3. Chrome extension

**Canonical location:** this clone’s `extension/` folder (not a copy inside each app).

1. Chrome → Extensions → Developer mode → Load unpacked → select `extension/`.
2. After editing extension sources: `npm run sync` in the clone, then **Reload** the extension.
3. Open the app on an allowlisted localhost origin.
4. Popup → **Start inspect** → click elements → Design/CSS tabs → edit → **Push**.

SlimVG may still keep a copy under `extensions/token-audit/` for monorepo sync; prefer the Code files install for day-to-day use.

### 4. How reads / writes work

| Action | Source of truth |
|--------|-----------------|
| Inspect / token tree | Live page CSSOM + fetched token CSS (primitives/semantic) |
| Preview edits | In-browser override stylesheet only |
| **Push** | POST `http://127.0.0.1:{writerPort}/apply` → exact `from → to` in allowlisted files under `cssRoots` |

Writer hard rules:

- Only paths under configured `cssRoots`
- CSS edits: `.css` only; `from` may be CSSOM form (`0px`) matching authored (`0`); selectors ignore extra whitespace/newlines
- Icon edits (`kind: svg-path`): unique `d="…"` in `.tsx` / `.ts` / `.jsx` / `.js` / `.svg` (first path only)
- All-or-nothing batch

## Agent duties

When the user asks to enable Token Inspect on a repo:

1. Confirm or create `token-inspect.config.json` matching real token paths + cssRoots.
2. Add the npm script if missing.
3. Remind them to run the writer **and** the dev server, then reload the extension.
4. Do **not** point the writer at `node_modules`, `.git`, or non-CSS trees.

When Push fails:

- Writer not running
- Path outside `cssRoots`
- Vite path unresolved (reload page so `data-vite-dev-id` is present)
- `from` value no longer matches file (edit drifted)

## SlimVG / monorepo example

```json
{
  "layers": 3,
  "cssRoots": ["apps/frontend/src"],
  "tokens": {
    "primitives": "apps/frontend/src/styles/tokens/primitives.css",
    "semantic": "apps/frontend/src/styles/tokens/semantic.css"
  },
  "writerPort": 7319,
  "devOrigins": ["http://localhost:5173"]
}
```

## Related

- Scaffold tokens / Icon / CSS modules → **design-system-3-level**, **design-system-2-level**, **css-modules**, **svg**
- Writer implementation → [scripts/writer.mjs](scripts/writer.mjs)
