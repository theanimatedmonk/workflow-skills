---
name: design-system-3-level
description: >-
  Scaffold a 3-level CSS design-token system (primitive → semantic → component)
  in any repo: token files, entry CSS imports, Icon, and token-inspect.config.json
  with layers 3. Use when the user asks for a 3-level design system, primitive
  semantic component tokens, or Token Inspect with three layers.
---

# 3-level design system (any project)

Personal skill. Pair with **css-modules** for per-component CSS and **token-inspect** for the Chrome panel + Push writer.

## Model

```
Primitive  →  Semantic  →  Component
(--primitive-*)  (--color-*, --space-*)  (--button-bg in Button.css)
```

- Components **never** use `--primitive-*` directly.
- Each component CSS file may define scoped aliases that point at **semantic** tokens, then consume those aliases.

## Ask first (if unclear)

1. **CSS root:** e.g. `src/`, `apps/frontend/src/`
2. **Stack:** React + Vite unless the user says otherwise
3. **Theming:** light-only or `data-theme` light/dark

## Checklist

```
- [ ] 1. Confirm CSS root + stack
- [ ] 2. Create primitives.css + semantic.css from templates/
- [ ] 3. Import primitives then semantic in entry CSS
- [ ] 4. Add Icon + Icon.css
- [ ] 5. Write token-inspect.config.json with "layers": 3
- [ ] 6. First component CSS → run **css-modules** (3-level pattern)
```

### 1. Token files

Copy from this skill:

| File | Template |
|------|----------|
| `{cssRoot}/styles/tokens/primitives.css` | [templates/primitives.css](templates/primitives.css) |
| `{cssRoot}/styles/tokens/semantic.css` | [templates/semantic.css](templates/semantic.css) |
| Config | [templates/token-inspect.config.json](templates/token-inspect.config.json) |

Adapt paths to the project. Import order:

```css
@import './styles/tokens/primitives.css';
@import './styles/tokens/semantic.css';
```

### 2. Naming (required for Token Inspect)

| Layer | Prefix examples |
|-------|-----------------|
| Primitive | `--primitive-brand-500`, `--primitive-space-4`, `--primitive-radius-md` |
| Semantic | `--color-*`, `--space-*`, `--font-*`, `--radius-*`, `--shadow-*`, `--duration-*`, `--ease-*`, `--icon-size-*` |
| Component | `--button-bg`, `--row-border` — defined at the **top** of that component’s CSS |

### 3. Component CSS (3-level)

Use **css-modules** for new files. Pattern:

```css
.button {
  --button-bg: var(--color-primary);
  --button-fg: var(--color-text-on-primary);
  --button-radius: var(--radius-control);

  background: var(--button-bg);
  color: var(--button-fg);
  border-radius: var(--button-radius);
  padding: var(--space-stack-sm) var(--space-inline-md);
}
```

Example: [templates/component.css](templates/component.css).

Hard rules:

- No naked `#hex` / `rgb()` in component CSS (except `transparent` / `currentColor`)
- No raw spacing like `16px` / `1rem` when a `--space-*` exists
- Prefer tokens; use `0`, `1px`, `%`, `auto` when appropriate

### 4. Icon

Copy [templates/Icon.tsx](templates/Icon.tsx) and [templates/Icon.css](templates/Icon.css). Named icons: [templates/ExampleIcon.tsx](templates/ExampleIcon.tsx).

If the user pastes a full SVG: keep `viewBox` and shape children; drop hardcoded fill/stroke so Icon tokens control color.

### 5. Token Inspect

Write **project-root** `token-inspect.config.json` from the template (`"layers": 3`). For Vite, also copy to `public/token-inspect.config.json`. Then tell the user to run **token-inspect**.

## Extending

- New raw value → primitive, then semantic alias, then component alias if needed
- Do not invent a second naming scheme in the same repo
