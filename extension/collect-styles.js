import { extractVarRefs, resolveValueTrees, terminalValue, normalizeColor } from './tokens.js';

/**
 * Collect matched style rules for an element, grouped by selector (DevTools-like).
 * @param {Element} el
 * @param {Map<string, { value: string, file: string, layer: string }>} tokenRegistry
 */
export function collectMatchedStyles(el, tokenRegistry) {
  /** @type {Array<{ selector: string, file: string, properties: Array<any> }>} */
  const groups = [];

  for (const sheet of document.styleSheets) {
    // Skip Token Inspect's own preview/override sheets (they re-list the same selectors)
    if (isInspectorStylesheet(sheet)) continue;

    let href = '';
    try {
      href = sheet.href ?? '';
    } catch {
      continue;
    }

    // Vite injects imported CSS as <style data-vite-dev-id=".../AssetRow.css">
    // with no href — without this, edits get tagged as "inline" and Push fails.
    const viteId = viteDevIdFromSheet(sheet);
    const sourcePath = sourcePathFromHref(href) || sourcePathFromViteId(viteId);
    const file = fileNameFromHref(href) || fileNameFromPath(sourcePath) || (viteId ? fileNameFromPath(viteId) : 'inline');

    for (const rule of walkStyleRules(sheet)) {
      const selector = rule.selectorText;
      if (!selector || !matchesElement(el, selector)) continue;

      // Prefer authored declarations from cssText. Iterating style.length expands
      // shorthands (border/background) into longhands and often drops the
      // shorthand entirely — which is why border/background were missing.
      const declarations = getRuleDeclarations(rule);
      const properties = [];

      for (const { property, value } of declarations) {
        if (!value) continue;

        const trees = resolveValueTrees(value, tokenRegistry);
        const computed = getComputedStyle(el).getPropertyValue(property).trim();
        const swatch = colorSwatchFor(property, trees, computed, value);

        properties.push({
          property,
          value,
          trees,
          computed,
          swatch,
          hasTokens: trees.length > 0,
        });
      }

      if (properties.length === 0) continue;

      // Prefer token-bearing props first within the group
      properties.sort((a, b) => Number(b.hasTokens) - Number(a.hasTokens));

      groups.push({ selector, file, sourcePath, properties });
    }
  }

  // Inline styles
  if (el instanceof HTMLElement && el.style.length > 0) {
    const properties = [];
    for (let i = 0; i < el.style.length; i++) {
      const property = el.style[i];
      const value = el.style.getPropertyValue(property).trim();
      const trees = resolveValueTrees(value, tokenRegistry);
      const computed = getComputedStyle(el).getPropertyValue(property).trim();
      properties.push({
        property,
        value,
        trees,
        computed,
        swatch: colorSwatchFor(property, trees, computed, value),
        hasTokens: trees.length > 0,
      });
    }
    if (properties.length) {
      groups.unshift({ selector: 'element.style', file: 'inline', properties });
    }
  }

  // Merge duplicate selectors from the same file (e.g. base `.asset-row` +
  // `@media { .asset-row { ... } }`) into one panel section. Later rules win
  // for the same property (CSS cascade).
  return prioritizeGroups(mergeGroupsBySelector(groups), el);
}

/**
 * @param {Array<{ selector: string, file: string, sourcePath?: string, properties: Array<any> }>} groups
 */
function mergeGroupsBySelector(groups) {
  /** @type {Map<string, { selector: string, file: string, sourcePath?: string, byProp: Map<string, any> }>} */
  const merged = new Map();
  const order = [];

  for (const group of groups) {
    const key = `${group.selector}\0${group.file}\0${group.sourcePath || ''}`;
    if (!merged.has(key)) {
      merged.set(key, {
        selector: group.selector,
        file: group.file,
        sourcePath: group.sourcePath,
        byProp: new Map(),
      });
      order.push(key);
    }
    const target = merged.get(key);
    for (const prop of group.properties) {
      // Walk order is stylesheet order — later declaration overrides earlier
      target.byProp.set(prop.property, prop);
    }
  }

  return order.map((key) => {
    const entry = merged.get(key);
    const properties = [...entry.byProp.values()];
    properties.sort((a, b) => Number(b.hasTokens) - Number(a.hasTokens));
    return {
      selector: entry.selector,
      file: entry.file,
      sourcePath: entry.sourcePath,
      properties,
    };
  });
}

function prioritizeGroups(groups, el) {
  const classList = el instanceof Element ? [...el.classList] : [];
  return [...groups].sort((a, b) => {
    const score = (g) => {
      let s = 0;
      for (const cls of classList) {
        if (g.selector.includes(`.${cls}`)) s += 10;
      }
      if (g.selector === 'element.style') s += 100;
      // Prefer more specific selectors (more classes)
      s += (g.selector.match(/\./g) || []).length;
      return -s;
    };
    return score(a) - score(b);
  });
}

/**
 * Read declarations as written on the rule (keeps border/background shorthands).
 * Falls back to CSSOM longhands when cssText is unavailable.
 * @param {CSSStyleRule} rule
 * @returns {Array<{ property: string, value: string }>}
 */
function getRuleDeclarations(rule) {
  const fromText = parseDeclarationsFromCssText(rule.cssText);
  if (fromText.length > 0) return fromText;

  // Fallback: indexed CSSStyleDeclaration (expanded longhands)
  const style = rule.style;
  const decls = [];
  const seen = new Set();

  for (let i = 0; i < style.length; i++) {
    const property = style[i];
    const value = style.getPropertyValue(property).trim();
    if (!value || seen.has(property)) continue;
    seen.add(property);
    decls.push({ property, value });
  }

  // Shorthands with var() often omit from style.length — probe common ones.
  for (const shorthand of SHORTHAND_PROPS) {
    if (seen.has(shorthand)) continue;
    const value = style.getPropertyValue(shorthand).trim();
    if (!value) continue;
    seen.add(shorthand);
    decls.push({ property: shorthand, value });
  }

  return decls;
}

const SHORTHAND_PROPS = [
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-width',
  'border-style',
  'border-color',
  'background',
  'margin',
  'padding',
  'font',
  'outline',
  'inset',
  'gap',
  'flex',
  'grid',
  'transition',
  'animation',
  'box-shadow',
];

/**
 * @param {string} cssText e.g. `.icon-btn--delete { border: 1px solid var(--x); }`
 */
function parseDeclarationsFromCssText(cssText) {
  if (!cssText) return [];
  const start = cssText.indexOf('{');
  const end = cssText.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return [];

  const body = cssText.slice(start + 1, end).trim();
  if (!body) return [];

  /** @type {Array<{ property: string, value: string }>} */
  const decls = [];
  let i = 0;

  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i])) i++;
    if (i >= body.length) break;

    const colon = body.indexOf(':', i);
    if (colon === -1) break;

    const property = body.slice(i, colon).trim();
    if (!property || property.startsWith('/*')) {
      // Skip comments roughly
      const commentEnd = body.indexOf('*/', i);
      i = commentEnd === -1 ? body.length : commentEnd + 2;
      continue;
    }

    i = colon + 1;
    let value = '';
    let depth = 0;
    while (i < body.length) {
      const ch = body[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      else if (ch === ';' && depth === 0) {
        i++;
        break;
      }
      value += ch;
      i++;
    }

    const trimmedProp = property.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    const trimmedValue = value.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (trimmedProp && trimmedValue) {
      decls.push({ property: trimmedProp, value: trimmedValue });
    }
  }

  return decls;
}

function matchesElement(el, selectorText) {
  // Split comma-separated selectors; ignore pseudo-elements for matching
  const parts = selectorText.split(',').map((s) => s.trim());
  for (let part of parts) {
    part = part.replace(/::?(before|after|placeholder|marker|selection|first-line|first-letter)\b.*/g, '');
    part = part.replace(/:(hover|focus|active|disabled|visited|focus-visible|focus-within)(?![-\w])/g, '');
    part = part.trim();
    if (!part) continue;
    try {
      if (el.matches(part)) return true;
    } catch {
      // invalid after stripping
    }
  }
  return false;
}

function* walkStyleRules(styleSheet, seen = new Set()) {
  if (!styleSheet || seen.has(styleSheet)) return;
  seen.add(styleSheet);
  let rules;
  try {
    rules = styleSheet.cssRules;
  } catch {
    return;
  }
  if (!rules) return;

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (rule.type === CSSRule.STYLE_RULE) {
      yield /** @type {CSSStyleRule} */ (rule);
    } else if (rule.type === CSSRule.IMPORT_RULE) {
      const imported = /** @type {CSSImportRule} */ (rule).styleSheet;
      if (imported) yield* walkStyleRules(imported, seen);
    } else if (rule.type === CSSRule.MEDIA_RULE) {
      // Skip inactive breakpoints — otherwise mobile `display: flex` merges over
      // desktop `display: grid` for the same selector.
      if (!mediaRuleMatches(/** @type {CSSMediaRule} */ (rule))) continue;
      yield* walkStyleRules(/** @type {any} */ (rule), seen);
    } else if (rule.type === CSSRule.SUPPORTS_RULE) {
      if (!supportsRuleMatches(/** @type {CSSSupportsRule} */ (rule))) continue;
      yield* walkStyleRules(/** @type {any} */ (rule), seen);
    } else if ('cssRules' in rule && rule.cssRules) {
      yield* walkStyleRules(/** @type {any} */ (rule), seen);
    }
  }
}

/** @param {CSSMediaRule} rule */
function mediaRuleMatches(rule) {
  try {
    const text = rule.media?.mediaText || rule.conditionText || '';
    if (!text || text === 'all') return true;
    return window.matchMedia(text).matches;
  } catch {
    return true;
  }
}

/** @param {CSSSupportsRule} rule */
function supportsRuleMatches(rule) {
  try {
    const text = rule.conditionText || '';
    if (!text) return true;
    return CSS.supports(text);
  } catch {
    return true;
  }
}

function fileNameFromHref(href) {
  if (!href || href === 'inline') return 'inline';
  try {
    return decodeURIComponent(new URL(href).pathname.split('/').pop() || href);
  } catch {
    return href.split('/').pop() || href;
  }
}

/** Vite path like /src/components/AssetRow.css → src/components/AssetRow.css */
function sourcePathFromHref(href) {
  if (!href || href === 'inline') return '';
  try {
    const pathname = new URL(href).pathname;
    const idx = pathname.indexOf('/src/');
    if (idx !== -1) return decodeURIComponent(pathname.slice(idx + 1));
    return decodeURIComponent(pathname.replace(/^\//, ''));
  } catch {
    return '';
  }
}

function viteDevIdFromSheet(sheet) {
  try {
    const node = sheet.ownerNode;
    if (!(node instanceof HTMLElement)) return '';
    return node.getAttribute('data-vite-dev-id') || node.dataset?.viteDevId || '';
  } catch {
    return '';
  }
}

function isInspectorStylesheet(sheet) {
  try {
    const node = sheet.ownerNode;
    if (!(node instanceof HTMLElement)) return false;
    const id = node.id || '';
    return (
      id === 'slimvg-token-inspect-overrides' ||
      id === 'slimvg-token-inspect-style' ||
      id === 'slimvg-token-inspect-root'
    );
  } catch {
    return false;
  }
}

/**
 * data-vite-dev-id is often an absolute filesystem path or a URL-like id ending in .css
 * e.g. /Users/.../apps/frontend/src/components/AssetRow.css
 *    or /Users/.../apps/frontend/src/components/AssetRow.css?type=style&lang.css
 */
function sourcePathFromViteId(viteId) {
  if (!viteId) return '';
  const cleaned = viteId.split('?')[0].replace(/\\/g, '/');
  const marker = '/src/';
  const idx = cleaned.lastIndexOf(marker);
  if (idx !== -1) return cleaned.slice(idx + 1); // src/components/AssetRow.css
  if (cleaned.endsWith('.css')) {
    const parts = cleaned.split('/');
    const file = parts[parts.length - 1];
    // Prefer full src-relative if present elsewhere
    return file;
  }
  return '';
}

function fileNameFromPath(path) {
  if (!path) return '';
  const clean = path.split('?')[0];
  const parts = clean.split('/');
  return parts[parts.length - 1] || '';
}

function colorSwatchFor(property, trees, computed, declared) {
  const isColorProp =
    /color|background|fill|stroke|border|outline|shadow/i.test(property) ||
    property === 'background';

  if (!isColorProp) return null;

  let raw = '';
  if (trees.length) {
    raw = terminalValue(trees[0]);
  }
  if (!raw || raw.startsWith('var(') || extractVarRefs(raw).length) {
    raw = computed || declared;
  }

  const hex = normalizeColor(raw);
  if (hex.startsWith('#') || /^rgba?\(/i.test(raw) || raw === 'transparent') {
    return raw.startsWith('#') || raw.startsWith('rgb') || raw === 'transparent' ? raw : hex;
  }
  return null;
}

/**
 * Short label for the selected element.
 * @param {Element} el
 */
export function elementLabel(el) {
  if (el.classList?.length) {
    // Prefer the most specific modifier class last
    const classes = [...el.classList];
    const modifier = classes.find((c) => c.includes('--'));
    if (modifier) return `.${modifier}`;
    return `.${classes[0]}`;
  }
  if (el.id) return `#${el.id}`;
  return el.tagName.toLowerCase();
}
