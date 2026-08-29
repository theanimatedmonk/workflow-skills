import { normalizeColor, resolveTokenTree, terminalValue } from './tokens.js';

/**
 * Coarse type used to filter dropdown options.
 * @param {string} name
 */
export function tokenKind(name) {
  const n = name.toLowerCase();
  if (
    n.includes('color') ||
    n.includes('brand') ||
    n.includes('success') ||
    n.includes('warning') ||
    n.includes('error') ||
    n.includes('-white') ||
    n.endsWith('white') ||
    n.includes('-black') ||
    n.includes('bg-') ||
    n.includes('text-') ||
    n.includes('border-') ||
    n.includes('fill') ||
    n.includes('stroke')
  ) {
    return 'color';
  }
  if (n.includes('space') || n.includes('gap') || n.includes('inset') || n.includes('page-')) {
    return 'space';
  }
  if (n.includes('radius')) return 'radius';
  if (n.includes('font-size') || n.includes('line-height')) return 'font-size';
  if (n.includes('font-weight') || n.includes('font-family') || n.includes('letter-spacing')) {
    return 'font';
  }
  if (n.includes('shadow')) return 'shadow';
  if (n.includes('duration') || n.includes('ease')) return 'motion';
  if (n.includes('z-') || n.includes('z-index')) return 'z';
  if (n.includes('icon')) return 'icon';
  return 'other';
}

/**
 * @param {Map<string, { value: string, file: string, layer: string }>} registry
 * @param {'semantic' | 'primitive' | 'component'} layer
 * @param {string} kind
 */
export function listTokensByLayerAndKind(registry, layer, kind) {
  /** @type {Array<{ name: string, value: string, swatch: string | null, label: string }>} */
  const options = [];

  for (const [name, entry] of registry.entries()) {
    if (entry.layer !== layer) continue;
    if (tokenKind(name) !== kind) continue;

    const tree = resolveTokenTree(name, registry);
    const terminal = terminalValue(tree);
    let swatch = null;
    if (kind === 'color') {
      const normalized = normalizeColor(terminal);
      if (normalized.startsWith('#') || /^rgba?\(/i.test(terminal) || terminal === 'transparent') {
        swatch =
          terminal.startsWith('#') || terminal.startsWith('rgb') || terminal === 'transparent'
            ? terminal
            : normalized;
      }
    }

    options.push({
      name,
      value: entry.value,
      swatch,
      label: kind === 'color' && terminal ? `${name} · ${terminal}` : name,
    });
  }

  options.sort((a, b) => a.name.localeCompare(b.name));
  return options;
}

/**
 * Semantic/component token whose value can be reassigned (usually → primitive or → semantic).
 * @param {{ name: string, layer: string, children?: any[] }} node
 */
export function editableTargetForNode(node) {
  if (!node?.children?.length) return null;

  const child = node.children[0];

  if (node.layer === 'semantic') {
    if (child?.layer === 'primitive' || child?.name?.startsWith('--primitive-')) {
      return {
        mode: 'token',
        tokenName: node.name,
        currentRef: child.name,
        optionLayer: 'primitive',
        kind: tokenKind(node.name),
      };
    }
    if (child?.layer === 'semantic') {
      return {
        mode: 'token',
        tokenName: node.name,
        currentRef: child.name,
        optionLayer: 'semantic',
        kind: tokenKind(node.name),
      };
    }
  }

  if (node.layer === 'component') {
    if (child?.layer === 'semantic') {
      return {
        mode: 'token',
        tokenName: node.name,
        currentRef: child.name,
        optionLayer: 'semantic',
        kind: tokenKind(child.name),
      };
    }
    if (child?.layer === 'primitive') {
      return {
        mode: 'token',
        tokenName: node.name,
        currentRef: child.name,
        optionLayer: 'primitive',
        kind: tokenKind(child.name),
      };
    }
  }

  return null;
}

/**
 * Property uses var(--token) — reassign which token the property points at.
 * @param {{ property: string, value: string, trees: any[] }} prop
 */
export function editableTargetForProperty(prop) {
  if (!prop?.trees?.length) return null;
  const primary = prop.trees[0];
  if (!primary?.name) return null;

  if (primary.layer === 'semantic') {
    return {
      mode: 'property',
      currentRef: primary.name,
      optionLayer: 'semantic',
      kind: tokenKind(primary.name),
    };
  }
  if (primary.layer === 'primitive') {
    return {
      mode: 'property',
      currentRef: primary.name,
      optionLayer: 'primitive',
      kind: tokenKind(primary.name),
    };
  }
  if (primary.layer === 'component') {
    const child = primary.children?.[0];
    if (child?.layer === 'semantic') {
      return {
        mode: 'property',
        currentRef: primary.name,
        optionLayer: 'semantic',
        kind: tokenKind(child.name),
      };
    }
  }
  return null;
}
