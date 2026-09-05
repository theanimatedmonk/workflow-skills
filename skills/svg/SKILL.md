---
name: svg
description: >-
  Add icons from pasted SVG path data with size xs, sm, md, lg
  (16x16px, 20x20, 24x24px, 32x32px). Use when the user pastes an SVG path,
  asks for an Icon component, or wants to set icon size/scale.
---

# SVG icons (any project)

Paste SVG path data. Set `size` to control scale.

should be xs, sm, md, lg.
size 16x16px, 20x20, 24x24px, 32x32px

I should just paste svg path data...and set size..to control the size./scale.

| `size` | Pixels |
|--------|--------|
| `xs` | 16×16px |
| `sm` | 20×20px |
| `md` | 24×24px (default) |
| `lg` | 32×32px |

## Checklist

```
- [ ] 1. Ensure Icon.tsx + Icon.css exist (copy templates if missing)
- [ ] 2. Ensure --icon-size-xs|sm|md|lg tokens (or CSS fallbacks)
- [ ] 3. Create a named icon from the pasted path / SVG
- [ ] 4. Pass size to control scale — do not invent other sizes
```

## Base Icon

If the project has no `Icon` yet, copy [templates/Icon.tsx](templates/Icon.tsx) and [templates/Icon.css](templates/Icon.css) next to other components (e.g. `{cssRoot}/components/Icon.tsx`).

If `Icon` already exists, add `xs` and the four sizes — do not add a second icon primitive.

Semantic tokens (add if missing):

```css
--icon-size-xs: 16px;
--icon-size-sm: 20px;
--icon-size-md: 24px;
--icon-size-lg: 32px;
```

CSS already falls back to those px values if tokens are absent.

## Paste path → named icon

User pastes a `d` string, a `<path>`, or a full `<svg>`.

```tsx
import Icon, { type IconProps } from '../Icon';

type Props = Omit<IconProps, 'viewBox' | 'children'>;

export default function CloseIcon(props: Props) {
  return (
    <Icon viewBox="0 0 24 24" {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  );
}
```

Template: [templates/ExampleIcon.tsx](templates/ExampleIcon.tsx).

- File name: `{Name}Icon.tsx` under `icons/` next to `Icon`.
- `viewBox` from the source SVG (default `0 0 24 24` if only a `d` is pasted).
- Keep shape children (`path`, `circle`, `rect`, …). Drop hardcoded `fill` / `stroke` on shapes so `Icon` tokens control color.
- Default `stroke="currentColor"` or `fill="currentColor"` on `Icon` from the source style.
- Spread `...props` so callers set `size`, `label`, etc.

## Set size / scale

```tsx
<CloseIcon size="xs" />
<CloseIcon size="sm" />
<CloseIcon size="md" />
<CloseIcon size="lg" />
```

Do not use raw `width` / `height` / `16px` on the icon to scale it. Only `size="xs" | "sm" | "md" | "lg"`.

## Do not

- Add sizes other than xs / sm / md / lg
- Put path `d` inline in random components when a named icon file is appropriate
- Scaffold a full design-token system here (use **design-system-2-level** or **design-system-3-level**)
