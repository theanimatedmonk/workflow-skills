import { restoreAllSvgPreviews } from './svg-icon.js';

const OVERRIDE_STYLE_ID = 'slimvg-token-inspect-overrides';

/**
 * @typedef {{
 *   id: string,
 *   kind: 'property' | 'token' | 'svg-path',
 *   file: string,
 *   sourcePath?: string,
 *   selector?: string,
 *   property?: string,
 *   tokenName?: string,
 *   from: string,
 *   to: string,
 * }} PendingEdit
 */

/** @type {Map<string, { selector: string, property: string, value: string }>} */
const propertyOverrides = new Map();

/** @type {Map<string, string>} */
const tokenOverrides = new Map();

/** @type {Map<string, PendingEdit>} */
const pendingEdits = new Map();

function propertyKey(selector, property) {
  return `${selector}\0${property}`;
}

function editKey(edit) {
  if (edit.kind === 'property') {
    return `property\0${edit.file || edit.sourcePath || ''}\0${edit.selector || ''}\0${edit.property}`;
  }
  if (edit.kind === 'svg-path') {
    return `svg-path\0${edit.from}`;
  }
  return `token\0${edit.file || ''}\0${edit.tokenName}`;
}

function ensureOverrideSheet() {
  let el = document.getElementById(OVERRIDE_STYLE_ID);
  if (!el) {
    el = document.createElement('style');
    el.id = OVERRIDE_STYLE_ID;
    document.documentElement.appendChild(el);
  }
  return el;
}

function rebuildPropertySheet() {
  const el = ensureOverrideSheet();
  const rules = [];
  for (const { selector, property, value } of propertyOverrides.values()) {
    rules.push(`${selector} { ${property}: ${value} !important; }`);
  }
  el.textContent = rules.join('\n');
}

function rememberEdit(partial) {
  const key = editKey(partial);
  const existing = pendingEdits.get(key);
  const from = existing ? existing.from : partial.from;
  const to = partial.to;
  if (from === to) {
    pendingEdits.delete(key);
    return;
  }
  pendingEdits.set(key, {
    ...partial,
    id: existing?.id || key,
    from,
    to,
  });
}

/**
 * @param {{
 *   selector: string,
 *   property: string,
 *   from: string,
 *   to: string,
 *   file?: string,
 *   sourcePath?: string,
 * }} input
 */
export function previewPropertyOverride(input) {
  const { selector, property, from, to, file = '', sourcePath = '' } = input;
  propertyOverrides.set(propertyKey(selector, property), {
    selector,
    property,
    value: to,
  });
  rebuildPropertySheet();
  rememberEdit({
    kind: 'property',
    file,
    sourcePath,
    selector,
    property,
    from,
    to,
  });
}

/**
 * @param {{
 *   tokenName: string,
 *   from: string,
 *   to: string,
 *   file?: string,
 *   registry: Map<string, { value: string, file: string, layer: string }>,
 * }} input
 */
export function previewTokenOverride(input) {
  const { tokenName, from, to, file = '', registry } = input;
  document.documentElement.style.setProperty(tokenName, to);
  tokenOverrides.set(tokenName, to);
  const existing = registry.get(tokenName);
  registry.set(tokenName, {
    value: to,
    file: existing?.file ?? file ?? 'preview',
    layer: existing?.layer ?? 'semantic',
  });
  rememberEdit({
    kind: 'token',
    file: file || existing?.file || '',
    tokenName,
    from,
    to,
  });
}

export function previewSvgPathOverride(input) {
  const { from, to } = input;
  rememberEdit({
    kind: 'svg-path',
    file: '',
    from,
    to,
  });
}

export function getPropertyOverride(selector, property) {
  return propertyOverrides.get(propertyKey(selector, property))?.value ?? null;
}

export function getTokenOverride(tokenName) {
  return tokenOverrides.get(tokenName) ?? null;
}

export function hasOverrides() {
  return pendingEdits.size > 0;
}

export function clearOverrides(registry) {
  for (const name of tokenOverrides.keys()) {
    document.documentElement.style.removeProperty(name);
    void registry;
  }
  tokenOverrides.clear();
  propertyOverrides.clear();
  pendingEdits.clear();
  restoreAllSvgPreviews();
  const el = document.getElementById(OVERRIDE_STYLE_ID);
  if (el) el.textContent = '';
}

export function overrideCount() {
  return pendingEdits.size;
}

/** @returns {PendingEdit[]} */
export function listPendingEdits() {
  return [...pendingEdits.values()];
}

/**
 * Map token registry file labels to repo-ish paths for the writer.
 * Prefer paths from /token-inspect.config.json when available.
 * @param {string} file
 */
export function normalizeTokenFile(file) {
  if (!file) return '';

  try {
    // Dynamic import avoided — config is loaded by tokens.js into a global-ish getter
    const cfg = globalThis.__TI_PAGE_CONFIG__;
    if (cfg?.tokens) {
      const prim = String(cfg.tokens.primitives || '');
      const sem = String(cfg.tokens.semantic || '');
      if (file === 'semantic.css' || file.endsWith('/semantic.css')) return sem || file;
      if (file === 'primitives.css' || file.endsWith('/primitives.css')) return prim || file;
    }
  } catch {
    // ignore
  }

  if (file === 'semantic.css' || file.endsWith('/semantic.css')) {
    return 'apps/frontend/src/styles/tokens/semantic.css';
  }
  if (file === 'primitives.css' || file.endsWith('/primitives.css')) {
    return 'apps/frontend/src/styles/tokens/primitives.css';
  }
  if (file.startsWith('apps/frontend/')) return file;
  if (file.startsWith('src/')) return file;
  return file;
}
