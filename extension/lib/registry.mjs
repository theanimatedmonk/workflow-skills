import { SEMANTIC_PREFIXES } from './constants.mjs';

export function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * @param {string} css
 * @param {'primitive' | 'semantic'} layer
 * @param {string} [file]
 */
export function parseCustomProperties(css, layer, file = '') {
  /** @type {Map<string, { value: string, file: string, layer: 'primitive' | 'semantic' }>} */
  const registry = new Map();
  const cleaned = stripComments(css);
  const re = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
  let match;
  while ((match = re.exec(cleaned)) !== null) {
    registry.set(match[1], {
      value: match[2].trim(),
      file,
      layer,
    });
  }
  return registry;
}

/**
 * @param {string} primitivesCss
 * @param {string} semanticCss
 */
export function createTokenRegistry(primitivesCss, semanticCss) {
  const registry = new Map();
  for (const [key, entry] of parseCustomProperties(primitivesCss, 'primitive', 'primitives.css')) {
    registry.set(key, entry);
  }
  for (const [key, entry] of parseCustomProperties(semanticCss, 'semantic', 'semantic.css')) {
    registry.set(key, entry);
  }
  return registry;
}

export function extractVarRefs(value) {
  const refs = [];
  const re = /var\(\s*(--[a-zA-Z0-9_-]+)/g;
  let match;
  while ((match = re.exec(value)) !== null) {
    refs.push(match[1]);
  }
  return refs;
}

/**
 * @param {string} name
 * @param {Map<string, { value: string, file: string, layer: string }>} tokenRegistry
 */
export function classifyToken(name, tokenRegistry) {
  const entry = tokenRegistry.get(name);
  if (entry) return entry.layer;
  if (name.startsWith('--primitive-')) return 'primitive';
  if (SEMANTIC_PREFIXES.some((prefix) => name.startsWith(prefix))) return 'semantic';
  return 'component';
}

/**
 * @param {string} name
 * @param {Map<string, { value: string, file: string, layer: string }>} tokenRegistry
 * @param {Set<string>} [seen]
 */
export function traceToken(name, tokenRegistry, seen = new Set()) {
  if (seen.has(name)) return [`${name} (cycle)`];
  seen.add(name);

  const entry = tokenRegistry.get(name);
  if (!entry) return [`${name} (unknown)`];

  const refs = extractVarRefs(entry.value);
  if (refs.length === 0) {
    return [`${entry.layer}: ${name} = ${entry.value}`];
  }

  const lines = [`${entry.layer}: ${name}`];
  for (const ref of refs) {
    for (const child of traceToken(ref, tokenRegistry, seen)) {
      lines.push(`  → ${child}`);
    }
  }
  return lines;
}

/**
 * Structured token resolution tree for UI (component → semantic → primitive → raw).
 * @param {string} name
 * @param {Map<string, { value: string, file: string, layer: string }>} tokenRegistry
 * @param {Set<string>} [seen]
 * @returns {{ name: string, layer: string, value: string, file?: string, children: Array<ReturnType<typeof resolveTokenTree>>, terminal?: boolean }}
 */
export function resolveTokenTree(name, tokenRegistry, seen = new Set()) {
  if (seen.has(name)) {
    return {
      name,
      layer: 'unknown',
      value: '(cycle)',
      children: [],
      terminal: true,
    };
  }
  seen.add(name);

  const entry = tokenRegistry.get(name);
  const layer = entry?.layer ?? classifyToken(name, tokenRegistry);
  const value = entry?.value ?? '';

  if (!entry) {
    return {
      name,
      layer,
      value: '(unknown)',
      children: [],
      terminal: true,
    };
  }

  const refs = extractVarRefs(value);
  if (refs.length === 0) {
    return {
      name,
      layer,
      value,
      file: entry.file,
      children: [],
      terminal: true,
    };
  }

  return {
    name,
    layer,
    value,
    file: entry.file,
    children: refs.map((ref) => resolveTokenTree(ref, tokenRegistry, new Set(seen))),
    terminal: false,
  };
}

/**
 * Resolve a CSS value that may contain var() into a forest of token trees.
 * @param {string} cssValue
 * @param {Map<string, { value: string, file: string, layer: string }>} tokenRegistry
 */
export function resolveValueTrees(cssValue, tokenRegistry) {
  const refs = extractVarRefs(cssValue);
  return refs.map((ref) => resolveTokenTree(ref, tokenRegistry));
}

/**
 * Walk a tree to the first terminal raw value (e.g. #262626).
 * @param {{ value: string, children: any[], terminal?: boolean }} node
 */
export function terminalValue(node) {
  if (!node) return '';
  if (node.terminal || !node.children?.length) return node.value;
  return terminalValue(node.children[0]);
}

/**
 * Resolve all token names to terminal color values for palette checks.
 * @param {Map<string, { value: string }>} tokenRegistry
 */
export function buildColorPalette(tokenRegistry) {
  /** @type {Set<string>} */
  const palette = new Set();

  function resolveValue(value, seen = new Set()) {
    const trimmed = value.trim();
    const refs = extractVarRefs(trimmed);
    if (refs.length === 0) {
      palette.add(normalizeColor(trimmed));
      return;
    }
    for (const ref of refs) {
      if (seen.has(ref)) continue;
      seen.add(ref);
      const entry = tokenRegistry.get(ref);
      if (entry) resolveValue(entry.value, seen);
    }
  }

  for (const entry of tokenRegistry.values()) {
    resolveValue(entry.value);
  }

  palette.delete('');
  palette.delete('transparent');
  palette.delete('currentcolor');
  return palette;
}

/**
 * @param {string} color
 */
export function normalizeColor(color) {
  const trimmed = color.trim().toLowerCase();
  if (trimmed.startsWith('#')) return trimmed;
  const rgbMatch = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const [r, g, b] = rgbMatch.slice(1, 4).map((n) => Number(n));
    return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  }
  return trimmed;
}
