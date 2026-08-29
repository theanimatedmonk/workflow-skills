---
name: css-modules
description: >-
  Create or convert per-component CSS colocated with the component (Button.tsx +
  Button.css or Button.module.css), using design tokens only. Use when the user
  asks for CSS modules per component, component CSS files, colocated styles, or
  to style a new UI component with tokens.
---

# CSS modules per component (any project)

Works in any repo. Pair with **design-system-3-level** or **design-system-2-level** for tokens. Pair with **token-inspect** if the user wants Push from the Chrome panel.

## Ask first (if unclear)

1. **Token layers already in this repo?** Read `token-inspect.config.json` `layers`, or token file naming. If neither exists, stop and run the matching design-system skill first.
2. **CSS convention:** If the project already uses `*.module.css` / `import styles from`, keep that. Otherwise default to colocated `Component.css` imported from the component (`import './Button.css'`).
3. **CSS root** from config `cssRoots` or existing `src/` layout.

## Checklist

```
- [ ] 1. Confirm tokens exist (primitives + semantic)
- [ ] 2. Match existing CSS module vs plain CSS convention
- [ ] 3. Add Component.css (or .module.css) next to the component
- [ ] 4. Import it from the component file
- [ ] 5. Token-only values (3-level aliases or 2-level semantic vars)
```

## File layout

```
{cssRoot}/components/Button.tsx
{cssRoot}/components/Button.css          # default
# or
{cssRoot}/components/Button.module.css  # if the project already uses CSS modules
```

**React + plain CSS:**

```tsx
import './Button.css';

export default function Button({ children }: { children: React.ReactNode }) {
  return <button type="button" className="button">{children}</button>;
}
```

**React + CSS modules** (only if the repo already does this):

```tsx
import styles from './Button.module.css';

export default function Button({ children }: { children: React.ReactNode }) {
  return <button type="button" className={styles.button}>{children}</button>;
}
```

Do not mix hashed CSS modules and global class names on the same component unless the project already does.

## Token patterns

**3-level** (`layers: 3`) — aliases at the top of **this** file, then consume them:

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

Template: [templates/component-3-level.css](templates/component-3-level.css).

**2-level** (`layers: 2`) — semantic tokens only:

```css
.button {
  background: var(--color-primary);
  color: var(--color-text-on-primary);
  border-radius: var(--radius-control);
  padding: var(--space-stack-sm) var(--space-inline-md);
}
```

Template: [templates/component-2-level.css](templates/component-2-level.css).

## Hard rules

- One CSS file per component (or clearly named partials the component owns). Do not dump new component styles into a global dump file.
- No `--primitive-*` in component CSS.
- No naked `#hex` / `rgb()` (except `transparent` / `currentColor`).
- No raw `16px` / `1rem` when a `--space-*` exists.
- Prefer existing BEM-ish names (`.button`, `.button__label`) unless CSS modules hash classes.

## Converting an existing component

1. Move inline/`style={{}}` and scattered global rules into the colocated file.
2. Replace hex/spacing with tokens; add semantic (and primitive) tokens if a value is missing — do not invent a parallel palette.
3. Keep class names stable if other files import them.

## Do not

- Create a design-token system in this skill (delegate to 2-level or 3-level).
- Put component styles in `tokens/` files.
- Use Tailwind utility classes as a substitute when the user asked for CSS modules / colocated CSS.
