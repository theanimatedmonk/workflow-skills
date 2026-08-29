export const ALLOWED_LITERALS = new Set([
  '0',
  '1px',
  '2px',
  '100%',
  '50%',
  'auto',
  'none',
  'inherit',
  'unset',
  'initial',
  'transparent',
  'currentColor',
]);

export const NAKED_COLOR_RE = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;
export const NAKED_RGB_RE = /\brgba?\([^)]+\)/;
export const NAKED_LENGTH_RE = /(?<![\w-])(\d*\.?\d+)(rem|px|em)\b/;
export const PRIMITIVE_VAR_RE = /var\(\s*(--primitive-[^,)]+)/g;

export const SKIP_FILE_NAMES = new Set(['primitives.css', 'semantic.css', 'index.css']);

export const SEMANTIC_PREFIXES = [
  '--color-',
  '--space-',
  '--font-',
  '--radius-',
  '--shadow-',
  '--duration-',
  '--ease-',
  '--layout-',
  '--icon-',
  '--line-height-',
  '--letter-spacing-',
];

export const LENGTH_PROPERTIES_RE =
  /^(padding|margin|gap|top|right|bottom|left|width|height|min-width|min-height|max-width|max-height|inset|border-radius|font-size|line-height|letter-spacing|outline-offset|scroll-margin|scroll-padding)/i;
