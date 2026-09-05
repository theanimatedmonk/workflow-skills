import { tokenKind } from './token-options.js';
import { classifyToken, normalizeColor, resolveTokenTree, terminalValue } from './tokens.js';

const LAYERS = ['primitive', 'semantic', 'component'];
const KINDS = [
  'color',
  'space',
  'radius',
  'font-size',
  'font',
  'shadow',
  'motion',
  'z',
  'icon',
  'other',
];

/** @type {{ layer: 'all' | 'primitive' | 'semantic' | 'component', view: 'tree' | 'table', query: string } } */
const catalogState = {
  layer: 'all',
  view: 'tree',
  query: '',
};

/** @type {Map<string, { value: string, file: string, layer: string }> | null} */
let catalogRegistry = null;

const TREE_ICON = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
  <rect x="2" y="2.5" width="12" height="2.5" rx="1" fill="currentColor"/>
  <rect x="4.5" y="6.75" width="9.5" height="2.5" rx="1" fill="currentColor"/>
  <rect x="4.5" y="11" width="9.5" height="2.5" rx="1" fill="currentColor"/>
  <rect x="2" y="6.75" width="1.5" height="6.75" rx="0.5" fill="currentColor"/>
</svg>`;

/**
 * @param {Map<string, { value: string, file: string, layer: string }>} registry
 */
export function setCatalogRegistry(registry) {
  catalogRegistry = registry ?? null;
  const pane = document.querySelector('#slimvg-token-inspect-root .ti-catalog');
  if (pane?.classList.contains('open')) renderCatalogPane(pane);
}

export function isCatalogOpen() {
  return Boolean(document.querySelector('#slimvg-token-inspect-root .ti-catalog.open'));
}

export function closeCatalog() {
  const root = document.getElementById('slimvg-token-inspect-root');
  const pane = root?.querySelector('.ti-catalog');
  const toggle = root?.querySelector('.ti-catalog-toggle');
  if (!pane) return;
  pane.classList.remove('open');
  pane.hidden = true;
  toggle?.setAttribute('aria-expanded', 'false');
}

/**
 * @param {HTMLElement} root
 */
export function mountCatalogUi(root) {
  if (root.querySelector('.ti-catalog-toggle')) return;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'ti-catalog-toggle';
  toggle.setAttribute('aria-label', 'All tokens');
  toggle.setAttribute('title', 'All tokens');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.innerHTML = TREE_ICON;
  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleCatalog();
  });

  const pane = document.createElement('aside');
  pane.className = 'ti-catalog';
  pane.hidden = true;
  pane.setAttribute('aria-label', 'All design tokens');

  root.appendChild(toggle);
  root.appendChild(pane);
}

function toggleCatalog() {
  const root = document.getElementById('slimvg-token-inspect-root');
  const pane = root?.querySelector('.ti-catalog');
  const toggle = root?.querySelector('.ti-catalog-toggle');
  if (!pane || !toggle) return;

  const next = !pane.classList.contains('open');
  pane.classList.toggle('open', next);
  pane.hidden = !next;
  toggle.setAttribute('aria-expanded', next ? 'true' : 'false');
  if (next) renderCatalogPane(pane);
}

/**
 * @param {HTMLElement} pane
 */
function renderCatalogPane(pane) {
  pane.replaceChildren();

  const header = document.createElement('div');
  header.className = 'ti-catalog-header';

  const title = document.createElement('div');
  title.className = 'ti-catalog-title';
  title.textContent = 'All tokens';
  header.appendChild(title);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'ti-close';
  close.setAttribute('aria-label', 'Close token list');
  close.textContent = '×';
  close.addEventListener('click', (event) => {
    event.stopPropagation();
    closeCatalog();
  });
  header.appendChild(close);
  pane.appendChild(header);

  const toolbar = document.createElement('div');
  toolbar.className = 'ti-catalog-toolbar';

  const layers = document.createElement('div');
  layers.className = 'ti-seg ti-catalog-layers';
  for (const layer of ['all', ...LAYERS]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ti-seg-btn';
    if (catalogState.layer === layer) btn.classList.add('active');
    btn.textContent = layer === 'all' ? 'All' : layer;
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      catalogState.layer = /** @type {any} */ (layer);
      renderCatalogPane(pane);
    });
    layers.appendChild(btn);
  }
  toolbar.appendChild(layers);

  const views = document.createElement('div');
  views.className = 'ti-seg ti-catalog-views';
  for (const view of ['tree', 'table']) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ti-seg-btn';
    if (catalogState.view === view) btn.classList.add('active');
    btn.textContent = view === 'tree' ? 'Tree' : 'Table';
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      catalogState.view = /** @type {any} */ (view);
      renderCatalogPane(pane);
    });
    views.appendChild(btn);
  }
  toolbar.appendChild(views);
  pane.appendChild(toolbar);

  const search = document.createElement('input');
  search.className = 'ti-catalog-search';
  search.type = 'search';
  search.placeholder = 'Filter name or value…';
  search.value = catalogState.query;
  search.addEventListener('input', () => {
    catalogState.query = search.value;
    const body = pane.querySelector('.ti-catalog-body');
    if (body) renderCatalogBody(body);
  });
  search.addEventListener('click', (e) => e.stopPropagation());
  pane.appendChild(search);

  const body = document.createElement('div');
  body.className = 'ti-catalog-body';
  pane.appendChild(body);
  renderCatalogBody(body);
}

/**
 * @param {HTMLElement} body
 */
function renderCatalogBody(body) {
  body.replaceChildren();
  const rows = listCatalogRows();

  if (!catalogRegistry?.size) {
    const empty = document.createElement('div');
    empty.className = 'ti-design-empty';
    empty.textContent = 'No tokens loaded yet. Start inspect on a localhost page.';
    body.appendChild(empty);
    return;
  }

  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'ti-design-empty';
    empty.textContent = 'No tokens match this filter.';
    body.appendChild(empty);
    return;
  }

  const meta = document.createElement('div');
  meta.className = 'ti-catalog-count';
  meta.textContent = `${rows.length} token${rows.length === 1 ? '' : 's'}`;
  body.appendChild(meta);

  if (catalogState.view === 'table') {
    body.appendChild(renderTable(rows));
    return;
  }
  body.appendChild(renderTree(rows));
}

function listCatalogRows() {
  if (!catalogRegistry) return [];
  const q = catalogState.query.trim().toLowerCase();
  /** @type {Array<any>} */
  const rows = [];

  for (const [name, entry] of catalogRegistry.entries()) {
    const layer = entry.layer || classifyToken(name, catalogRegistry);
    if (catalogState.layer !== 'all' && layer !== catalogState.layer) continue;

    const tree = resolveTokenTree(name, catalogRegistry);
    const terminal = terminalValue(tree) || '';
    const kind = tokenKind(name);
    const hay = `${name} ${entry.value} ${terminal} ${layer} ${kind}`.toLowerCase();
    if (q && !hay.includes(q)) continue;

    let swatch = null;
    if (kind === 'color') {
      const normalized = normalizeColor(terminal);
      if (
        terminal === 'transparent' ||
        /^#|^rgb/i.test(terminal) ||
        normalized.startsWith('#')
      ) {
        swatch = /^#|^rgb/i.test(terminal) || terminal === 'transparent' ? terminal : normalized;
      }
    }

    rows.push({
      name,
      layer,
      kind,
      value: entry.value,
      terminal,
      swatch,
      tree,
    });
  }

  rows.sort((a, b) => {
    const layerCmp = LAYERS.indexOf(a.layer) - LAYERS.indexOf(b.layer);
    if (layerCmp) return layerCmp;
    const kindCmp = KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind);
    if (kindCmp) return kindCmp;
    return a.name.localeCompare(b.name);
  });
  return rows;
}

function renderTree(rows) {
  const wrap = document.createElement('div');
  wrap.className = 'ti-catalog-tree';

  const layers =
    catalogState.layer === 'all' ? LAYERS : [catalogState.layer];

  for (const layer of layers) {
    const layerRows = rows.filter((row) => row.layer === layer);
    if (!layerRows.length) continue;

    const group = document.createElement('details');
    group.className = 'ti-catalog-group';
    group.open = true;

    const summary = document.createElement('summary');
    summary.className = 'ti-catalog-summary';
    const badge = document.createElement('span');
    badge.className = `ti-layer ${layer}`;
    badge.textContent = layer;
    summary.appendChild(badge);
    summary.appendChild(document.createTextNode(` ${layerRows.length}`));
    group.appendChild(summary);

    const kinds = [...new Set(layerRows.map((row) => row.kind))];
    kinds.sort((a, b) => KINDS.indexOf(a) - KINDS.indexOf(b));

    for (const kind of kinds) {
      const kindRows = layerRows.filter((row) => row.kind === kind);
      const kindGroup = document.createElement('details');
      kindGroup.className = 'ti-catalog-kind';
      kindGroup.open = true;

      const kindSummary = document.createElement('summary');
      kindSummary.className = 'ti-catalog-kind-summary';
      kindSummary.textContent = `${kind} · ${kindRows.length}`;
      kindGroup.appendChild(kindSummary);

      for (const row of kindRows) {
        kindGroup.appendChild(renderTreeRow(row));
      }
      group.appendChild(kindGroup);
    }

    wrap.appendChild(group);
  }

  return wrap;
}

function renderTreeRow(row) {
  const details = document.createElement('details');
  details.className = 'ti-catalog-row';

  const summary = document.createElement('summary');
  summary.className = 'ti-catalog-row-line';

  if (row.swatch) {
    const swatch = document.createElement('span');
    swatch.className = 'ti-swatch';
    swatch.style.background = row.swatch;
    summary.appendChild(swatch);
  }

  const name = document.createElement('span');
  name.className = 'ti-tree-name';
  name.textContent = row.name;
  summary.appendChild(name);

  const value = document.createElement('span');
  value.className = 'ti-tree-value';
  value.textContent = row.terminal || row.value;
  summary.appendChild(value);
  details.appendChild(summary);

  const chain = document.createElement('div');
  chain.className = 'ti-catalog-chain';
  appendChain(chain, row.tree, 0);
  details.appendChild(chain);
  return details;
}

function appendChain(host, node, depth) {
  if (!node) return;
  const line = document.createElement('div');
  line.className = 'ti-tree-line';
  line.style.marginLeft = `${depth * 10}px`;

  const layer = document.createElement('span');
  layer.className = `ti-layer ${node.layer || 'unknown'}`;
  layer.textContent = node.layer || 'raw';
  line.appendChild(layer);

  const name = document.createElement('span');
  name.className = 'ti-tree-name';
  name.textContent = node.name || node.value;
  line.appendChild(name);

  if (node.terminal && node.value) {
    const val = document.createElement('span');
    val.className = 'ti-tree-value';
    val.textContent = `= ${node.value}`;
    line.appendChild(val);
  }
  host.appendChild(line);

  for (const child of node.children || []) {
    appendChain(host, child, depth + 1);
  }
}

function renderTable(rows) {
  const table = document.createElement('table');
  table.className = 'ti-catalog-table';

  const thead = document.createElement('thead');
  thead.innerHTML =
    '<tr><th></th><th>Token</th><th>Layer</th><th>Kind</th><th>Value</th><th>Resolved</th></tr>';
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');

    const sw = document.createElement('td');
    if (row.swatch) {
      const swatch = document.createElement('span');
      swatch.className = 'ti-swatch';
      swatch.style.background = row.swatch;
      sw.appendChild(swatch);
    }
    tr.appendChild(sw);

    appendCell(tr, row.name, 'ti-catalog-mono');
    const layerTd = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `ti-layer ${row.layer}`;
    badge.textContent = row.layer;
    layerTd.appendChild(badge);
    tr.appendChild(layerTd);
    appendCell(tr, row.kind);
    appendCell(tr, row.value, 'ti-catalog-mono');
    appendCell(tr, row.terminal || '—', 'ti-catalog-mono');
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

function appendCell(tr, text, className) {
  const td = document.createElement('td');
  if (className) td.className = className;
  td.textContent = text;
  tr.appendChild(td);
}
