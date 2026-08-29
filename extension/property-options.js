/**
 * Keyword options for common CSS properties.
 * @type {Record<string, string[]>}
 */
export const KEYWORD_OPTIONS = {
  display: [
    'none',
    'block',
    'inline',
    'inline-block',
    'flex',
    'inline-flex',
    'grid',
    'inline-grid',
    'contents',
    'flow-root',
    'list-item',
  ],
  'flex-direction': ['row', 'row-reverse', 'column', 'column-reverse'],
  'flex-wrap': ['nowrap', 'wrap', 'wrap-reverse'],
  'align-items': ['stretch', 'flex-start', 'flex-end', 'center', 'baseline', 'start', 'end', 'normal'],
  'align-self': ['auto', 'stretch', 'flex-start', 'flex-end', 'center', 'baseline', 'start', 'end'],
  'align-content': [
    'stretch',
    'flex-start',
    'flex-end',
    'center',
    'space-between',
    'space-around',
    'space-evenly',
    'start',
    'end',
    'normal',
  ],
  'justify-content': [
    'flex-start',
    'flex-end',
    'center',
    'space-between',
    'space-around',
    'space-evenly',
    'start',
    'end',
    'left',
    'right',
    'normal',
  ],
  'justify-items': ['stretch', 'start', 'end', 'center', 'left', 'right', 'normal'],
  'justify-self': ['auto', 'stretch', 'start', 'end', 'center', 'left', 'right'],
  position: ['static', 'relative', 'absolute', 'fixed', 'sticky'],
  overflow: ['visible', 'hidden', 'clip', 'scroll', 'auto'],
  'overflow-x': ['visible', 'hidden', 'clip', 'scroll', 'auto'],
  'overflow-y': ['visible', 'hidden', 'clip', 'scroll', 'auto'],
  'text-align': ['start', 'end', 'left', 'right', 'center', 'justify'],
  'white-space': ['normal', 'nowrap', 'pre', 'pre-wrap', 'pre-line', 'break-spaces'],
  'pointer-events': ['auto', 'none'],
  cursor: [
    'auto',
    'default',
    'pointer',
    'not-allowed',
    'grab',
    'grabbing',
    'text',
    'move',
    'crosshair',
    'help',
  ],
  'box-sizing': ['border-box', 'content-box'],
  visibility: ['visible', 'hidden', 'collapse'],
  'object-fit': ['fill', 'contain', 'cover', 'none', 'scale-down'],
  'object-position': ['center', 'top', 'bottom', 'left', 'right'],
  'flex-shrink': ['0', '1'],
  'flex-grow': ['0', '1'],
  float: ['none', 'left', 'right'],
  clear: ['none', 'left', 'right', 'both'],
  'user-select': ['auto', 'none', 'text', 'all'],
  'text-decoration': ['none', 'underline', 'line-through', 'overline'],
  'font-style': ['normal', 'italic', 'oblique'],
  'font-weight': ['100', '200', '300', '400', '500', '600', '700', '800', '900', 'normal', 'bold'],
  'border-style': ['none', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'],
};

export const SIZE_SUGGESTIONS = [
  'auto',
  '0',
  '100%',
  '90%',
  '80%',
  '75%',
  '50%',
  '33%',
  '25%',
  'fit-content',
  'max-content',
  'min-content',
  '100vw',
  '100vh',
  '1rem',
  '1.5rem',
  '2rem',
  '2.5rem',
  '3rem',
  '4rem',
  '8px',
  '16px',
  '24px',
  '32px',
];

const SIZE_PROPERTIES = new Set([
  'width',
  'height',
  'min-width',
  'max-width',
  'min-height',
  'max-height',
  'flex-basis',
  'gap',
  'row-gap',
  'column-gap',
  'top',
  'right',
  'bottom',
  'left',
  'inset',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-radius',
  'border-width',
  'font-size',
  'line-height',
  'outline-offset',
]);

export const GRID_TRACK_SUGGESTIONS = [
  '1fr',
  '1fr 1fr',
  '1fr 2fr',
  '2fr 1fr',
  '1fr 1fr 1fr',
  '2fr 3fr 1fr',
  '2fr 4fr 1fr',
  '1fr 3fr 1fr',
  'auto 1fr',
  'auto 1fr auto',
  'max-content 1fr',
  'minmax(0, 1fr)',
  'minmax(0, 1fr) minmax(0, 2fr)',
  'repeat(2, 1fr)',
  'repeat(3, 1fr)',
  'repeat(4, minmax(0, 1fr))',
];

const GRID_TEMPLATE_PROPERTIES = new Set([
  'grid-template-columns',
  'grid-template-rows',
  'grid-auto-columns',
  'grid-auto-rows',
  'grid-template',
]);

/**
 * Compound values (e.g. mixed rem + fr tracks) should edit the full string,
 * not only the first var() token.
 * @param {string} property
 */
export function prefersFullValueEdit(property) {
  return GRID_TEMPLATE_PROPERTIES.has(property.toLowerCase());
}

/**
 * @param {string} property
 * @returns {{ mode: 'keywords' | 'size' | 'color' | 'grid' | 'freeform', options: string[] } | null}
 */
export function getPropertyValueEditor(property) {
  const prop = property.toLowerCase();

  if (GRID_TEMPLATE_PROPERTIES.has(prop)) {
    return { mode: 'grid', options: GRID_TRACK_SUGGESTIONS };
  }

  if (KEYWORD_OPTIONS[prop]) {
    return { mode: 'keywords', options: KEYWORD_OPTIONS[prop] };
  }

  if (SIZE_PROPERTIES.has(prop)) {
    return { mode: 'size', options: SIZE_SUGGESTIONS };
  }

  if (
    prop === 'color' ||
    prop === 'background' ||
    prop === 'background-color' ||
    prop.endsWith('-color') ||
    prop === 'fill' ||
    prop === 'stroke' ||
    prop === 'border' ||
    prop.startsWith('border-') && prop.includes('color')
  ) {
    return { mode: 'color', options: ['transparent', 'currentColor', '#000000', '#ffffff'] };
  }

  // Allow freeform edit for remaining literal props (opacity, z-index, etc.)
  if (
    prop === 'opacity' ||
    prop === 'z-index' ||
    prop === 'order' ||
    prop === 'flex' ||
    prop === 'transform' ||
    prop === 'transition' ||
    prop === 'box-shadow' ||
    prop === 'border' ||
    prop.startsWith('border-')
  ) {
    return { mode: 'freeform', options: [] };
  }

  return { mode: 'freeform', options: [] };
}

/**
 * Detect raw value kind for primitive editing UI.
 * @param {string} value
 */
export function detectRawValueKind(value) {
  const v = value.trim();
  if (/^#([0-9a-f]{3,8})$/i.test(v) || /^rgba?\(/i.test(v) || /^hsla?\(/i.test(v)) {
    return 'color';
  }
  if (/^-?[\d.]+(rem|px|em|%|vh|vw|ch|ex)$/i.test(v) || v === '0') {
    return 'length';
  }
  if (/^-?[\d.]+$/.test(v)) {
    return 'number';
  }
  return 'text';
}
