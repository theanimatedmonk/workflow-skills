import {
  createTokenRegistry,
  resolveTokenTree,
  resolveValueTrees,
  terminalValue,
  extractVarRefs,
  classifyToken,
  normalizeColor,
} from './lib/index.mjs';

/** @type {{ tokens?: { primitives?: string, semantic?: string }, cssRoots?: string[] } | null} */
let pageConfig = null;

/**
 * Optional project config served from the app origin (public/token-inspect.config.json).
 * @returns {Promise<{ tokens?: { primitives?: string, semantic?: string }, cssRoots?: string[] } | null>}
 */
export async function loadPageConfig() {
  if (pageConfig) return pageConfig;
  try {
    const res = await fetch(new URL('/token-inspect.config.json', window.location.origin));
    if (res.ok) {
      pageConfig = await res.json();
      return pageConfig;
    }
  } catch {
    // ignore
  }
  pageConfig = null;
  return null;
}

export function getPageConfig() {
  return pageConfig;
}

function toPublicUrl(repoPath) {
  if (!repoPath) return '';
  let p = String(repoPath).replace(/\\/g, '/');
  // apps/frontend/src/... → /src/...
  const srcIdx = p.indexOf('/src/');
  if (srcIdx !== -1) return p.slice(srcIdx);
  if (p.startsWith('src/')) return `/${p}`;
  if (p.startsWith('/')) return p;
  return `/${p}`;
}

/**
 * Load primitives + semantic + any other custom properties from the page CSSOM / Vite.
 * @returns {Promise<Map<string, { value: string, file: string, layer: string }>>}
 */
export async function loadTokenRegistry() {
  const config = await loadPageConfig();
  try {
    globalThis.__TI_PAGE_CONFIG__ = config;
  } catch {
    // ignore
  }

  const primPath =
    toPublicUrl(config?.tokens?.primitives) || '/src/styles/tokens/primitives.css';
  const semPath =
    toPublicUrl(config?.tokens?.semantic) || '/src/styles/tokens/semantic.css';

  const primitivesCss = await fetchCss(primPath);
  const semanticCss = await fetchCss(semPath);

  const registry = createTokenRegistry(primitivesCss, semanticCss);

  // Harvest component / page custom properties from live stylesheets
  for (const sheet of document.styleSheets) {
    let href = '';
    try {
      href = sheet.href ?? 'inline';
    } catch {
      continue;
    }
    const file = fileNameFromHref(href);
    harvestCustomProps(sheet, registry, file);
  }

  return registry;
}

async function fetchCss(path) {
  try {
    const res = await fetch(new URL(path, window.location.origin));
    if (res.ok) return await res.text();
  } catch {
    // ignore
  }
  return '';
}

function fileNameFromHref(href) {
  if (!href || href === 'inline') return 'inline';
  try {
    return decodeURIComponent(new URL(href).pathname.split('/').pop() || href);
  } catch {
    return href.split('/').pop() || href;
  }
}

function harvestCustomProps(styleSheet, registry, file, seen = new Set()) {
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
      const style = /** @type {CSSStyleRule} */ (rule).style;
      for (let j = 0; j < style.length; j++) {
        const prop = style[j];
        if (!prop.startsWith('--')) continue;
        if (registry.has(prop)) continue;
        const value = style.getPropertyValue(prop).trim();
        registry.set(prop, {
          value,
          file,
          layer: classifyToken(prop, registry),
        });
      }
    } else if (rule.type === CSSRule.IMPORT_RULE) {
      const imported = /** @type {CSSImportRule} */ (rule).styleSheet;
      if (imported) harvestCustomProps(imported, registry, fileNameFromHref(imported.href), seen);
    } else if ('cssRules' in rule && rule.cssRules) {
      harvestCustomProps(/** @type {CSSStyleSheet} */ (rule), registry, file, seen);
    }
  }
}

export {
  resolveTokenTree,
  resolveValueTrees,
  terminalValue,
  extractVarRefs,
  classifyToken,
  normalizeColor,
};
