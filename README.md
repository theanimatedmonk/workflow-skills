# Token Inspect — setup guide (any repo)

Standalone Chrome extension for inspecting and editing design tokens on localhost apps. Cursor skills in this repo work in **any** project once they are installed under `~/.cursor/skills/`.

| Skill | Purpose |
|-------|---------|
| **design-system-3-level** | Primitive → semantic → component tokens |
| **design-system-2-level** | Primitive → semantic tokens only |
| **css-modules** | Colocated CSS per component (`Button.css` / `.module.css`) |
| **token-inspect** | Wire config + Push writer (`~/.cursor/skills/token-inspect/`) |

Install (symlink into Cursor so every repo can invoke them):

```bash
chmod +x skills/install.sh
./skills/install.sh
```

In any repo chat: *“Set up a 3-level design system”*, *“Set up a 2-level design system”*, or *“Add CSS modules for this component”*.

```
~/Documents/Code files/token-inspect/
  extension/     ← Load unpacked in Chrome (this folder)
  core/          ← Shared token helpers
  scripts/       ← npm run sync (rebuild bundle)
  skills/        ← Cursor skills (install with skills/install.sh)
  README.md      ← this file
```

---

## One-time: install the Chrome extension

1. (Optional) Rebuild after you change extension source:

   ```bash
   cd "~/Documents/Code files/token-inspect"
   npm install
   npm run sync
   ```

2. Chrome → **Extensions** → enable **Developer mode** → **Load unpacked**

3. Select this folder:

   ```
   /Users/sajal.k/Documents/Code files/token-inspect/extension
   ```

4. Pin the extension. You only need to do this once — one install works for every repo.

When you edit extension code later: run `npm run sync` here, then click **Reload** on the extension card in Chrome.

---

## Per repo: design system + Token Inspect

Do this once per project (or ask Cursor: *“Set up design-system + token-inspect”*).

### Step 1 — Design tokens

Choose **3-level** (primitive → semantic → component) or **2-level** (primitive → semantic).

Create (or ask the **design-system** skill to create):

```
{cssRoot}/styles/tokens/primitives.css   # --primitive-*
{cssRoot}/styles/tokens/semantic.css     # --color-*, --space-*, …
```

Wire them in your app entry CSS:

```css
@import './styles/tokens/primitives.css';
@import './styles/tokens/semantic.css';
```

**Naming rules** (required so the extension can classify tokens):

| Layer | Examples |
|-------|----------|
| Primitive | `--primitive-brand-500`, `--primitive-space-4` |
| Semantic | `--color-text-primary`, `--space-stack-md`, `--radius-card` |
| Component (3-level) | `--button-bg` at the top of `Button.css` |

Component CSS should use semantic (or component) tokens — not naked hex / random `px` when a token exists.

Optional: add `Icon.tsx` + `Icon.css`, then wrap pasted SVG paths as named icons (see design-system templates).

### Step 2 — Project config

Add **`token-inspect.config.json`** at the **repo root**:

```json
{
  "layers": 3,
  "cssRoots": ["src"],
  "tokens": {
    "primitives": "src/styles/tokens/primitives.css",
    "semantic": "src/styles/tokens/semantic.css"
  },
  "writerPort": 7319,
  "devOrigins": ["http://localhost:5173", "http://127.0.0.1:5173"]
}
```

Adapt paths to your layout:

| Project shape | `cssRoots` | `tokens.*` example |
|---------------|------------|--------------------|
| Vite app `src/` | `["src"]` | `src/styles/tokens/primitives.css` |
| Monorepo frontend | `["apps/frontend/src"]` | `apps/frontend/src/styles/tokens/primitives.css` |

**Also copy** the same JSON to Vite’s public folder so the extension can fetch it:

```
public/token-inspect.config.json
```

(Paths inside that copy stay the same as the root config.)

### Step 3 — npm script (optional but handy)

In the project `package.json`:

```json
"token-inspect:writer": "node \"$HOME/.cursor/skills/token-inspect/scripts/writer.mjs\""
```

### Step 4 — Run three things

In separate terminals, from the **project root**:

```bash
# 1) App
npm run dev

# 2) Writer (must be running before Push)
npm run token-inspect:writer
# or:
node ~/.cursor/skills/token-inspect/scripts/writer.mjs
```

Writer listens on `http://127.0.0.1:7319` and only writes `.css` under `cssRoots`.

### Step 5 — Inspect

1. Open the app on localhost (must match `devOrigins` / extension host permissions).
2. Click the extension → **Start inspect**.
3. Click an element → panel opens (**CSS** and **Design** tabs).
4. Edit values (hover → edit icon, or Design layout controls).
5. Click **Push N changes** to write CSS (or icon path `d`) to disk. Vite HMR should pick it up.

**Change an icon:** Inspect → click the SVG → **Icon** → paste a path `d`, a `<path>`, or a full `<svg>` → **Preview icon** → **Push**. The writer finds that unique `d="…"` in TSX/JS/SVG under `cssRoots` (first path only).

**Esc** or panel **×** exits inspect mode. **Reset** discards previews without writing.

---

## Checklist (new repo)

```
- [ ] Tokens exist (primitives + semantic; component aliases if 3-level)
- [ ] Entry CSS imports tokens
- [ ] token-inspect.config.json at repo root
- [ ] public/token-inspect.config.json (Vite)
- [ ] Writer script / npm script available
- [ ] Chrome extension loaded from Code files/token-inspect/extension
- [ ] Dev server + writer running
- [ ] Inspect → edit → Push works
```

---

## What Push can and cannot do

| Allowed | Blocked |
|---------|---------|
| `.css` files under `cssRoots` | Paths outside `cssRoots` |
| Exact `property: from;` → `to` | Guessing / fuzzy replaces |
| Exact `--token: from;` → `to` | Non-unique path `d` (icon Push) |
| Unique `d="…"` in `.tsx` / `.js` / `.svg` (`kind: svg-path`) | Partial write on failure |
| All-or-nothing batch | |

If Push fails:

- Writer not running → start it
- File path unknown → reload the page (Vite `data-vite-dev-id`)
- `from` no longer matches the file → Reset and re-edit
- Path outside `cssRoots` → fix config

Health check:

```bash
curl -s http://127.0.0.1:7319/health
```

---

## Cursor shortcuts

In any repo chat (after `skills/install.sh`):

- *“Set up a 3-level design system”* → **design-system-3-level**
- *“Set up a 2-level design system”* → **design-system-2-level**
- *“Add CSS modules for this component”* → **css-modules**
- *“Wire Token Inspect for this repo”* → **token-inspect**
- *“Add an icon from this SVG path”* → the matching design-system skill (Icon templates)

---

## Folder map

| Path | Role |
|------|------|
| `extension/` | Unpacked Chrome extension |
| `extension/panel.css` | Panel UI styles |
| `core/` | Token registry helpers (synced into `extension/lib`) |
| `~/.cursor/skills/token-inspect/scripts/writer.mjs` | Portable Push writer |
| `~/.cursor/skills/design-system/templates/` | Token / Icon / CSS starters |

Prefer this **Code files** install over any in-repo copy so one extension serves every project.
