# SlimVG Token Inspect — Chrome Extension

Click-to-inspect for design tokens — like DevTools, but for your token tree.

```
Component CSS  →  Semantic token  →  Primitive token  →  raw value
.icon-btn--download
  background: var(--color-bg-inverse)
    → --color-bg-inverse
      → --primitive-brand-800 = #262626
```

The **npm audit** (`npm run audit:tokens`) stays separate for CI. This extension no longer audits; it only inspects.

## Install

1. Bundle:

   ```bash
   npm run sync:token-audit
   ```

2. Chrome → **Extensions** → **Developer mode** → **Load unpacked** (or **Reload**)

   Select: `extensions/token-audit`

3. Run the app: `npm run dev:frontend` → open `http://localhost:5173`

4. Click the extension → **Start inspect**

5. Click any element on the page. Expand a token chip to see the full chain.

**Esc** or the panel **×** exits inspect mode.

## What you see

| UI | Meaning |
|----|---------|
| Blue dashed box | Hover target |
| Blue solid box | Selected element |
| Panel header | Primary selector (e.g. `.icon-btn--download`) |
| Property row | Declared CSS value |
| Token chip + ▸ | Click to expand semantic → primitive → hex/rem |
| Layer badges | `component` / `semantic` / `primitive` |
| Edit icon (on hover) | Reassign / edit value (temporary browser preview) |

## Reassign tokens (temporary preview)

Hover an editable value to reveal the edit icon, then click it:

| Edit point | Dropdown | Effect |
|------------|----------|--------|
| Property chip (e.g. `background` → `--color-bg-elevated`) | Matching **semantic** tokens | Overrides that property on the selector |
| Expanded **semantic** row | Matching **primitive** tokens | Overrides that custom property on `:root` |
| Expanded **component** token | Matching semantic/primitive | Overrides that component custom property |
| Expanded **primitive** raw value | Hex / rem / text input (+ color picker) | Overrides the primitive on `:root` |
| Literal props (`display`, `flex-direction`, `width`…) | Keyword dropdown or size suggestions + custom input | Overrides that property on the selector |
| `grid-template-columns` / `rows` | Full track list editor (edit `2fr 4fr 1fr` ratios, keep `var(...)` tracks) | Overrides the whole template on the selector |

### Push changes to the codebase (local writer)

Preview edits stay in the browser until you push them with the **Push N changes** button.

1. In a separate terminal (repo root):

   ```bash
   npm run token-inspect:writer
   ```

   This starts `http://127.0.0.1:7319` and only writes under `apps/frontend/src/**/*.css`.

2. Make preview edits in the extension.

3. Click **Push N changes** — the writer applies exact `from → to` replacements (CSS only). Vite HMR picks them up.

Hard rules enforced by the writer:

- Allowlisted paths only (`apps/frontend/src/**/*.css`)
- Exact declaration match required (`property: from;` / `--token: from;`)
- All-or-nothing: if any edit fails, nothing is written
- No JS/TS/HTML files

Use **Reset** to discard previews without writing.

## Shared core

Token resolution lives in `packages/token-audit-core/`. After editing it:

```bash
npm run sync:token-audit
```

Then reload the extension in Chrome.

## Limitations

- **localhost only**
- Pseudo-states (`:hover`) are matched in a simplified way — hover styles may not always appear
- Cross-origin stylesheets cannot be read
