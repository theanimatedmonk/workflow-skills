/**
 * Figma-like Layout controls for the Design tab (gray selected states).
 * Gap / padding pick from the semantic space token list — no freeform sliders.
 */

import { listTokensByLayerAndKind } from './token-options.js';

const LAYOUT_SIGNAL_PROPS = [
  'display',
  'flex-direction',
  'flex-wrap',
  'align-items',
  'justify-content',
  'gap',
  'row-gap',
  'column-gap',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'grid-template-columns',
  'grid-template-rows',
];

/** Props owned by the Layout editor — skip in generic Design rows. */
export const LAYOUT_EDITOR_PROPS = new Set([
  ...LAYOUT_SIGNAL_PROPS,
  'align-content',
  'justify-items',
  'place-items',
  'padding-block',
  'padding-inline',
]);

const DISTRIBUTE_OPTIONS = [
  { value: 'flex-start', label: 'Start' },
  { value: 'center', label: 'Center' },
  { value: 'flex-end', label: 'End' },
  { value: 'space-between', label: 'Space between' },
  { value: 'space-around', label: 'Space around' },
  { value: 'space-evenly', label: 'Space evenly' },
];

const ICONS = {
  stack: `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3" y="2.5" width="10" height="2.5" rx="0.75" fill="currentColor"/><rect x="3" y="6.75" width="10" height="2.5" rx="0.75" fill="currentColor"/><rect x="3" y="11" width="10" height="2.5" rx="0.75" fill="currentColor"/></svg>`,
  grid: `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="0.75" fill="currentColor"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="0.75" fill="currentColor"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="0.75" fill="currentColor"/><rect x="9" y="9" width="4.5" height="4.5" rx="0.75" fill="currentColor"/></svg>`,
  row: `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M2 7.25h9.2L8.6 4.65l.7-.7L13.4 8l-4.1 4.05-.7-.7 2.6-2.6H2v-1.5z"/></svg>`,
  column: `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M7.25 2v9.2l-2.6-2.6-.7.7L8 13.4l4.05-4.1-.7-.7-2.6 2.6V2h-1.5z"/></svg>`,
  alignStart: `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M2 2.5h12v1.25H2V2.5zm3 3.5h6v2H5v-2zm0 4h6v2H5v-2z"/></svg>`,
  alignCenter: `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M2 7.4h12v1.2H2V7.4zM5 3.5h6v2H5v-2zm0 7h6v2H5v-2z"/></svg>`,
  alignEnd: `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M2 12.25h12v1.25H2v-1.25zm3-8.5h6v2H5v-2zm0 4h6v2H5v-2z"/></svg>`,
  padUniform: `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3" y="3" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`,
  padSides: `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M7.25 2h1.5v3h-1.5V2zm0 9h1.5v3h-1.5v-3zM2 7.25h3v1.5H2v-1.5zm9 0h3v1.5h-3v-1.5z"/><rect x="5.5" y="5.5" width="5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.25"/></svg>`,
};

/**
 * @param {Map<string, { prop: any, group: any }>} winning
 */
export function hasLayoutEditorContent(winning) {
  return LAYOUT_SIGNAL_PROPS.some((name) => winning.has(name));
}

/**
 * @param {Map<string, { prop: any, group: any }>} winning
 * @param {string[]} names
 */
function firstHit(winning, names) {
  for (const name of names) {
    const hit = winning.get(name);
    if (hit) return { ...hit, property: name };
  }
  return null;
}

function authored(hit) {
  return hit?.prop?.value ?? '';
}

/** Preferred order for space tokens in layout pickers. */
const SPACE_ORDER = [
  '--space-stack-xs',
  '--space-stack-sm',
  '--space-stack-md',
  '--space-stack-lg',
  '--space-stack-xl',
  '--space-stack-2xl',
  '--space-inline-sm',
  '--space-inline-md',
  '--space-page-x',
  '--space-page-y',
  '--space-section-y',
];

/**
 * Deterministic list of space tokens for gap / padding.
 * @param {Map<string, any> | null | undefined} registry
 * @returns {Array<{ value: string, label: string, name: string }>}
 */
export function listSpaceTokenOptions(registry) {
  if (!registry) return [];
  const semantic = listTokensByLayerAndKind(registry, 'semantic', 'space');
  const rank = new Map(SPACE_ORDER.map((name, i) => [name, i]));
  return semantic
    .map((opt) => ({
      name: opt.name,
      value: `var(${opt.name})`,
      label: opt.name.replace(/^--/, ''),
    }))
    .sort((a, b) => {
      const ra = rank.has(a.name) ? rank.get(a.name) : 1000;
      const rb = rank.has(b.name) ? rank.get(b.name) : 1000;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });
}

/** @param {string} value */
function asVarRef(value) {
  const trimmed = String(value || '').trim();
  const m = trimmed.match(/^var\(\s*(--[\w-]+)\s*\)$/i);
  return m ? `var(${m[1]})` : null;
}

function normalizeAlign(value) {
  const v = String(value || '').toLowerCase();
  if (v === 'center') return 'center';
  if (v === 'flex-end' || v === 'end' || v === 'right' || v === 'self-end') return 'end';
  if (v === 'flex-start' || v === 'start' || v === 'left' || v === 'self-start' || v === 'stretch' || v === 'baseline' || v === 'normal') {
    return v === 'stretch' || v === 'baseline' || v === 'normal' ? 'start' : 'start';
  }
  return '';
}

function alignToCss(key) {
  if (key === 'center') return 'center';
  if (key === 'end') return 'flex-end';
  return 'flex-start';
}

function normalizeDistribute(value) {
  const v = String(value || '').toLowerCase();
  if (v === 'start' || v === 'left') return 'flex-start';
  if (v === 'end' || v === 'right') return 'flex-end';
  return v;
}

function distributeLabel(value) {
  const norm = normalizeDistribute(value);
  return DISTRIBUTE_OPTIONS.find((o) => o.value === norm)?.label
    || DISTRIBUTE_OPTIONS.find((o) => o.value === value)?.label
    || (value ? String(value) : 'Start');
}

function isUniformPadding(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return true;
  if (parts.length === 2) return parts[0] === parts[1];
  if (parts.length === 3) return parts[0] === parts[1] && parts[1] === parts[2];
  if (parts.length >= 4) return parts[0] === parts[1] && parts[1] === parts[2] && parts[2] === parts[3];
  return true;
}

/**
 * @param {Map<string, { prop: any, group: any }>} winning
 * @param {{
 *   onCommit: (hit: { prop: any, group: any, property: string }, next: string) => void,
 *   registry?: Map<string, any> | null,
 *   computedDisplay?: string,
 * }} hooks
 */
export function renderLayoutEditor(winning, hooks) {
  const root = document.createElement('section');
  root.className = 'ti-design-section ti-layout';
  const spaceOptions = listSpaceTokenOptions(hooks.registry);

  const head = document.createElement('div');
  head.className = 'ti-layout-head';
  const title = document.createElement('div');
  title.className = 'ti-design-title ti-layout-title';
  title.textContent = 'Layout';
  head.appendChild(title);
  root.appendChild(head);

  const displayHit = firstHit(winning, ['display']);
  const directionHit = firstHit(winning, ['flex-direction']);
  const justifyHit = firstHit(winning, ['justify-content']);
  const alignHit = firstHit(winning, ['align-items']);
  const wrapHit = firstHit(winning, ['flex-wrap']);
  const gapHit = firstHit(winning, ['gap', 'column-gap', 'row-gap']);
  const paddingHit = firstHit(winning, [
    'padding',
    'padding-block',
    'padding-inline',
    'padding-top',
  ]);
  // Prefer shorthand padding when present
  const paddingTarget = winning.get('padding')
    ? { ...winning.get('padding'), property: 'padding' }
    : paddingHit;

  // Prefer live computed display so Type matches what's on screen (not an
  // inactive breakpoint's authored value).
  const display = String(hooks.computedDisplay || authored(displayHit) || '').toLowerCase();
  const isStack = display === 'flex' || display === 'inline-flex';
  const isGrid = display === 'grid' || display === 'inline-grid';

  if (displayHit) {
    root.appendChild(
      row('Type', segment([
        {
          html: ICONS.stack,
          label: 'Stack',
          title: 'Stack',
          active: isStack,
          onClick: () => hooks.onCommit(displayHit, 'flex'),
        },
        {
          html: ICONS.grid,
          label: 'Grid',
          title: 'Grid',
          active: isGrid,
          onClick: () => hooks.onCommit(displayHit, 'grid'),
        },
      ]))
    );
  }

  if (directionHit) {
    const dir = authored(directionHit).toLowerCase();
    const isRow = dir === 'row' || dir === 'row-reverse' || (!dir && isStack);
    const isCol = dir === 'column' || dir === 'column-reverse';
    root.appendChild(
      row('Direction', segment([
        {
          html: ICONS.row,
          title: 'Horizontal',
          active: isRow && !isCol,
          onClick: () => hooks.onCommit(directionHit, 'row'),
        },
        {
          html: ICONS.column,
          title: 'Vertical',
          active: isCol,
          onClick: () => hooks.onCommit(directionHit, 'column'),
        },
      ]))
    );
  }

  if (justifyHit) {
    root.appendChild(
      row(
        'Distribute',
        dropdown({
          label: distributeLabel(authored(justifyHit)),
          options: DISTRIBUTE_OPTIONS,
          current: normalizeDistribute(authored(justifyHit)),
          onPick: (value) => hooks.onCommit(justifyHit, value),
        })
      )
    );
  }

  if (alignHit) {
    const alignKey = normalizeAlign(authored(alignHit));
    root.appendChild(
      row('Align', segment([
        {
          html: ICONS.alignStart,
          title: 'Start',
          active: alignKey === 'start',
          onClick: () => hooks.onCommit(alignHit, alignToCss('start')),
        },
        {
          html: ICONS.alignCenter,
          title: 'Center',
          active: alignKey === 'center',
          onClick: () => hooks.onCommit(alignHit, alignToCss('center')),
        },
        {
          html: ICONS.alignEnd,
          title: 'End',
          active: alignKey === 'end',
          onClick: () => hooks.onCommit(alignHit, alignToCss('end')),
        },
      ]))
    );
  }

  if (wrapHit) {
    const wrap = authored(wrapHit).toLowerCase();
    const wrapYes = wrap === 'wrap' || wrap === 'wrap-reverse';
    root.appendChild(
      row('Wrap', segment([
        {
          label: 'Yes',
          active: wrapYes,
          onClick: () => hooks.onCommit(wrapHit, 'wrap'),
        },
        {
          label: 'No',
          active: !wrapYes,
          onClick: () => hooks.onCommit(wrapHit, 'nowrap'),
        },
      ]))
    );
  }

  if (gapHit) {
    root.appendChild(row('Gap', spaceTokenSelect(authored(gapHit), spaceOptions, (next) => {
      hooks.onCommit(gapHit, next);
    })));
  }

  if (paddingTarget) {
    let padExpanded = !isUniformPadding(authored(paddingTarget));
    const padHost = document.createElement('div');
    padHost.className = 'ti-layout-pad-host';

    function renderPaddingControls() {
      padHost.replaceChildren();
      const value = authored(paddingTarget);
      const controls = document.createElement('div');
      controls.className = 'ti-layout-pad-controls';

      if (!padExpanded) {
        controls.appendChild(
          spaceTokenSelect(value, spaceOptions, (next) => {
            hooks.onCommit(paddingTarget, next);
          })
        );
      } else {
        const parts = splitPaddingParts(value);
        const grid = document.createElement('div');
        grid.className = 'ti-layout-pad-grid';
        for (const side of [
          { key: 'top', label: 'T' },
          { key: 'right', label: 'R' },
          { key: 'bottom', label: 'B' },
          { key: 'left', label: 'L' },
        ]) {
          const cell = document.createElement('label');
          cell.className = 'ti-layout-pad-cell';
          const tag = document.createElement('span');
          tag.textContent = side.label;
          cell.appendChild(tag);
          cell.appendChild(
            spaceTokenSelect(parts[side.key], spaceOptions, (next) => {
              const updated = { ...parts, [side.key]: next };
              hooks.onCommit(
                paddingTarget,
                `${updated.top} ${updated.right} ${updated.bottom} ${updated.left}`
              );
            })
          );
          grid.appendChild(cell);
        }
        controls.appendChild(grid);
      }

      const mode = segment([
        {
          html: ICONS.padUniform,
          title: 'Uniform padding',
          active: !padExpanded,
          onClick: () => {
            padExpanded = false;
            if (!isUniformPadding(authored(paddingTarget))) {
              const parts = splitPaddingParts(authored(paddingTarget));
              hooks.onCommit(paddingTarget, parts.top);
              return;
            }
            renderPaddingControls();
          },
        },
        {
          html: ICONS.padSides,
          title: 'Independent padding',
          active: padExpanded,
          onClick: () => {
            padExpanded = true;
            renderPaddingControls();
          },
        },
      ]);
      mode.classList.add('ti-layout-pad-mode');
      controls.appendChild(mode);
      padHost.appendChild(controls);
    }

    renderPaddingControls();
    root.appendChild(row('Padding', padHost));
  }

  // Grid tracks when grid
  if (isGrid) {
    const cols = firstHit(winning, ['grid-template-columns']);
    const rows = firstHit(winning, ['grid-template-rows']);
    if (cols) {
      root.appendChild(row('Columns', textField(cols, hooks)));
    }
    if (rows) {
      root.appendChild(row('Rows', textField(rows, hooks)));
    }
  }

  return root;
}

/** Split padding shorthand into four authored sides (keeps var() refs). */
function splitPaddingParts(value) {
  const raw = String(value || '').trim();
  const parts = raw ? raw.split(/\s+/).filter(Boolean) : [];
  if (parts.length === 0) {
    return { top: '', right: '', bottom: '', left: '' };
  }
  if (parts.length === 1) {
    return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
  }
  if (parts.length === 2) {
    return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
  }
  if (parts.length === 3) {
    return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
  }
  return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
}

function row(label, control) {
  const el = document.createElement('div');
  el.className = 'ti-layout-row';
  const lab = document.createElement('div');
  lab.className = 'ti-layout-label';
  lab.textContent = label;
  const cell = document.createElement('div');
  cell.className = 'ti-layout-control';
  if (control instanceof Node) cell.appendChild(control);
  else cell.append(control);
  el.append(lab, cell);
  return el;
}

/**
 * @param {Array<{ label?: string, html?: string, title?: string, active?: boolean, disabled?: boolean, onClick: () => void }>} items
 */
function segment(items) {
  const el = document.createElement('div');
  el.className = 'ti-seg';
  for (const item of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ti-seg-btn';
    if (item.active) btn.classList.add('active');
    if (item.disabled) {
      btn.disabled = true;
      btn.title = item.title || 'Not declared on this element';
    } else if (item.title) {
      btn.title = item.title;
    }
    if (item.html && item.label) {
      btn.innerHTML = `${item.html}<span>${item.label}</span>`;
    } else if (item.html) {
      btn.innerHTML = item.html;
    } else {
      btn.textContent = item.label || '';
    }
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      item.onClick();
    });
    el.appendChild(btn);
  }
  return el;
}

function dropdown(config) {
  const wrap = document.createElement('div');
  wrap.className = 'ti-layout-select-wrap';
  const select = document.createElement('select');
  select.className = 'ti-layout-select';
  select.disabled = Boolean(config.disabled);
  if (config.disabled) select.title = 'Not declared on this element';

  const current = config.current;
  let hasCurrent = false;
  for (const opt of config.options) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    if (opt.value === current) {
      o.selected = true;
      hasCurrent = true;
    }
    select.appendChild(o);
  }
  if (current && !hasCurrent) {
    const o = document.createElement('option');
    o.value = current;
    o.textContent = config.label || current;
    o.selected = true;
    select.appendChild(o);
  }

  select.addEventListener('click', (e) => e.stopPropagation());
  select.addEventListener('change', () => config.onPick(select.value));
  wrap.appendChild(select);
  return wrap;
}

function textField(hit, hooks) {
  const input = document.createElement('input');
  input.className = 'ti-layout-num ti-layout-num--wide';
  input.type = 'text';
  input.value = authored(hit);
  input.title = authored(hit);
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('change', () => {
    const next = input.value.trim();
    if (next && next !== authored(hit)) hooks.onCommit(hit, next);
  });
  return input;
}

/**
 * Dropdown of semantic space tokens (var(--space-…)).
 * @param {string} currentValue
 * @param {Array<{ value: string, label: string, name: string }>} options
 * @param {(next: string) => void} onPick
 */
function spaceTokenSelect(currentValue, options, onPick) {
  const current = asVarRef(currentValue) || String(currentValue || '').trim();
  return dropdown({
    label: current || 'Choose space…',
    options: options.length
      ? options
      : [{ value: current || 'var(--space-stack-md)', label: current || 'space-stack-md' }],
    current,
    onPick,
  });
}
