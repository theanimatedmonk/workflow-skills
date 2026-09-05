# workflow-skills

Cursor skills, Chrome Token Inspect extension, and Push writer for **any** repo.

Repo: [theanimatedmonk/workflow-skills](https://github.com/theanimatedmonk/workflow-skills)

---

## 1. Install the Cursor skills

Clone once, then symlink into `~/.cursor/skills/` so every project can use them.

```bash
git clone https://github.com/theanimatedmonk/workflow-skills.git
cd workflow-skills
chmod +x skills/install.sh
./skills/install.sh
```

If a skill folder already exists and is **not** a symlink, the installer skips it. To replace:

```bash
rm -rf ~/.cursor/skills/design-system-3-level \
       ~/.cursor/skills/design-system-2-level \
       ~/.cursor/skills/css-modules \
       ~/.cursor/skills/token-inspect \
       ~/.cursor/skills/svg
./skills/install.sh
```

**Update later:**

```bash
cd /path/to/workflow-skills
git pull
# symlinks already point here; no need to reinstall unless install.sh gained new skills
```

Start a **new Cursor chat** after installing so the agent sees the skills.

### What you can ask in any repo

| Say this | Skill |
|----------|--------|
| *Set up a 3-level design system* | `design-system-3-level` |
| *Set up a 2-level design system* | `design-system-2-level` |
| *Add CSS modules for this component* | `css-modules` |
| *Wire Token Inspect for this repo* | `token-inspect` |
| *Add this SVG path as an icon* (`size` xs/sm/md/lg) | `svg` |

---

## 2. Chrome extension (once, all repos)

Load **one** unpacked extension from this clone. Do not copy `extension/` into each app.

```bash
cd /path/to/workflow-skills
npm install
npm run sync
```

Then in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select `extension/` inside this clone (the folder that contains `manifest.json`)

Pin the extension. After you change extension source:

```bash
cd /path/to/workflow-skills
npm run sync
```

Then click **Reload** on the extension card.

---

## 3. Writer (per repo, while you Push)

The writer is a small local HTTP server. It must run from the **app repo root** (the folder that has `token-inspect.config.json`). It only writes files under `cssRoots`.

After skills install:

```bash
# from the app you are inspecting
cd /path/to/your-app
node ~/.cursor/skills/token-inspect/scripts/writer.mjs
```

Without installing the skill, run the same file from this clone (still `cd` into the **app** first):

```bash
cd /path/to/your-app
node /path/to/workflow-skills/skills/token-inspect/scripts/writer.mjs
```

Optional npm script in **that** app’s `package.json`:

```json
"token-inspect:writer": "node \"$HOME/.cursor/skills/token-inspect/scripts/writer.mjs\""
```

```bash
cd /path/to/your-app
npm run token-inspect:writer
```

Health check:

```bash
curl -s http://127.0.0.1:7319/health
```

Override config path or port:

```bash
TOKEN_INSPECT_CONFIG=./token-inspect.config.json node ~/.cursor/skills/token-inspect/scripts/writer.mjs
```

---

## 4. Wire Token Inspect on a new repo

Do this in the **app** (or ask Cursor: *Wire Token Inspect for this repo*).

### Config at app root

`token-inspect.config.json`:

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

Use `"layers": 2` if you used the 2-level skill. Point `cssRoots` and `tokens.*` at the real CSS tree (e.g. `apps/frontend/src` in a monorepo).

**Vite:** also copy the same JSON to `public/token-inspect.config.json` so the extension can fetch it from the page origin.

You still need tokens (`--primitive-*` and `--color-*` / `--space-*`, …). Scaffold with the 2-level or 3-level skill if they are missing.

### Daily loop

Three processes:

```bash
# Terminal A — app
cd /path/to/your-app
npm run dev

# Terminal B — writer (must be up before Push)
cd /path/to/your-app
node ~/.cursor/skills/token-inspect/scripts/writer.mjs
```

Then:

1. Open the app on a `devOrigins` URL (usually `http://localhost:5173`).
2. Extension → **Start inspect**.
3. The small **tree icon** on the side of the panel lists every primitive, semantic, and component token (tree or table). Filter by layer or search.
4. Click an element → **CSS** / **Design** tabs → edit (preview only).
5. **Push N changes** writes to disk. Vite HMR should refresh.

**Esc** or panel **×** exits inspect. **Reset** drops previews without writing.

**Icons:** inspect an SVG → **Icon** → paste `d`, `<path>`, or full `<svg>` → **Preview** → **Push**. The writer needs a unique `d="…"` under `cssRoots`.

---

## Checklist (new app)

```
- [ ] skills/install.sh run (once per machine)
- [ ] Chrome extension loaded from workflow-skills/extension
- [ ] Tokens exist (primitives + semantic)
- [ ] token-inspect.config.json at app root
- [ ] public/token-inspect.config.json (Vite)
- [ ] Dev server running
- [ ] Writer running from app root
- [ ] Inspect → edit → Push works
```

---

## Push rules

| Allowed | Blocked |
|---------|---------|
| `.css` under `cssRoots` | Paths outside `cssRoots` |
| Exact `property: from;` → `to` | Fuzzy replace |
| Unique `d="…"` in `.tsx` / `.js` / `.svg` | Non-unique icon path |

If Push fails: writer not running, reload the page (Vite `data-vite-dev-id`), `from` drifted (Reset and re-edit), or path not in `cssRoots`.

---

## Repo layout

```
workflow-skills/
  extension/                 Chrome Load unpacked (once)
  core/                      Shared helpers (npm run sync)
  scripts/sync.mjs           Rebuild extension/lib + content.bundle.js
  skills/
    install.sh               Symlink skills into ~/.cursor/skills
    design-system-3-level/
    design-system-2-level/
    css-modules/
    token-inspect/           SKILL.md + writer + config template
    svg/                     Paste path data; size xs/sm/md/lg
  README.md
```
