import { hasLayoutEditorContent, renderLayoutEditor } from './design-layout.js';
import { flattenWinningProps, listPresentDesignSections } from './design-pane.js';
import {
  getPropertyOverride,
  hasOverrides,
  listPendingEdits,
  normalizeTokenFile,
  overrideCount,
  previewPropertyOverride,
  previewSvgPathOverride,
  previewTokenOverride,
} from './overrides.js';
import {
  detectRawValueKind,
  getPropertyValueEditor,
  prefersFullValueEdit,
} from './property-options.js';
import { pushEditsToWriter } from './push.js';
import { applySvgPreview, firstPathD, parsePastedIcon, relatedIconSvg } from './svg-icon.js';
import {
  editableTargetForNode,
  editableTargetForProperty,
  listTokensByLayerAndKind,
} from './token-options.js';
import { extractVarRefs, resolveValueTrees, terminalValue, normalizeColor } from './tokens.js';

const ROOT_ID = 'slimvg-token-inspect-root';
const STYLE_ID = 'slimvg-token-inspect-style';

/** @type {{ hoverBox: HTMLElement, selectBox: HTMLElement, panel: HTMLElement, onClose?: () => void } | null} */
let ui = null;

/** @type {{
 *   registry: Map<string, { value: string, file: string, layer: string }>,
 *   element?: Element | null,
 *   onRefresh?: () => void,
 *   onReset?: () => void,
 *   onPushed?: () => void,
 * } | null} */
let panelContext = null;

/** @type {'css' | 'design'} */
let activeTab = 'css';

/** @type {{ label: string, groups: Array<any> }} */
let panelView = { label: '', groups: [] };

let outsideCloseArmed = false;

export function clearInspectorUi() {
  disarmOutsideClose();
  document.getElementById(ROOT_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();
  ui = null;
  panelContext = null;
}

/** Panel styles live in panel.css (loaded via content_scripts). */
function ensureStyles() {
  // no-op — kept so call sites stay stable
}

function positionBox(box, el) {
  if (!el || !el.isConnected) {
    box.style.display = 'none';
    return;
  }
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    box.style.display = 'none';
    return;
  }
  box.style.display = 'block';
  box.style.top = `${rect.top}px`;
  box.style.left = `${rect.left}px`;
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;
}

export function ensureInspectorUi() {
  const stale = document.getElementById(ROOT_ID);
  if (stale && !stale.querySelector('.ti-icon-slot')) {
    stale.remove();
    ui = null;
  }
  if (ui?.panel?.isConnected) return ui;
  ui = null;
  document.getElementById(ROOT_ID)?.remove();
  ensureStyles();

  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.innerHTML = `
    <div class="ti-box hover" style="display:none"></div>
    <div class="ti-box select" style="display:none"></div>
    <aside class="ti-panel" role="dialog" aria-label="Token inspector">
      <div class="ti-header">
        <div class="ti-selector">Select an element</div>
        <button type="button" class="ti-close" aria-label="Close">×</button>
      </div>
      <div class="ti-hint">
        <span class="ti-hint-text">Hover a value to edit · click an icon to paste a new path</span>
      </div>
      <div class="ti-icon-slot" hidden></div>
      <div class="ti-tabs" role="tablist" aria-label="Inspector views">
        <button type="button" class="ti-tab active" role="tab" aria-selected="true" data-tab="css">CSS</button>
        <button type="button" class="ti-tab" role="tab" aria-selected="false" data-tab="design">Design</button>
      </div>
      <div class="ti-body"></div>
    </aside>
  `;
  document.documentElement.appendChild(root);

  const panel = root.querySelector('.ti-panel');
  panel.querySelector('.ti-close').addEventListener('click', () => {
    ui?.onClose?.();
  });

  for (const tab of panel.querySelectorAll('.ti-tab')) {
    tab.addEventListener('click', (event) => {
      event.stopPropagation();
      const next = tab.getAttribute('data-tab');
      if (next !== 'css' && next !== 'design') return;
      if (activeTab === next) return;
      activeTab = next;
      showInspectPanel(panelView.label, panelView.groups, panelContext);
    });
  }

  ui = {
    hoverBox: root.querySelector('.ti-box.hover'),
    selectBox: root.querySelector('.ti-box.select'),
    panel,
  };
  return ui;
}

function syncTabButtons(panel) {
  for (const tab of panel.querySelectorAll('.ti-tab')) {
    const isActive = tab.getAttribute('data-tab') === activeTab;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
  }
}

export function setHoverTarget(el) {
  const current = ensureInspectorUi();
  positionBox(current.hoverBox, el);
}

export function setSelectTarget(el) {
  const current = ensureInspectorUi();
  positionBox(current.selectBox, el);
  current.hoverBox.style.display = 'none';
}

function closeAllEditors(except) {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  for (const el of root.querySelectorAll('.ti-dropdown.open, .ti-value-editor.open')) {
    if (el !== except) el.classList.remove('open');
  }
  if (!root.querySelector('.ti-dropdown.open, .ti-value-editor.open')) {
    disarmOutsideClose();
  }
}

function onOutsidePointerDown(event) {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  const open = root.querySelector('.ti-dropdown.open, .ti-value-editor.open');
  if (!open) {
    disarmOutsideClose();
    return;
  }

  const target = event.target;
  if (!(target instanceof Node)) return;

  // Keep open when interacting with the editor itself
  if (open.contains(target)) return;

  closeAllEditors();
}

function armOutsideClose() {
  if (outsideCloseArmed) return;
  outsideCloseArmed = true;
  // Defer so the same click that opened the editor doesn't immediately close it
  window.setTimeout(() => {
    if (!outsideCloseArmed) return;
    document.addEventListener('pointerdown', onOutsidePointerDown, true);
  }, 0);
}

function disarmOutsideClose() {
  if (!outsideCloseArmed) return;
  outsideCloseArmed = false;
  document.removeEventListener('pointerdown', onOutsidePointerDown, true);
}

/**
 * @param {HTMLElement} host
 * @param {{
 *   options: Array<{ name: string, swatch: string | null, label: string }>,
 *   currentRef: string,
 *   onPick: (name: string) => void,
 * }} config
 */
function mountDropdown(host, config) {
  closeAllEditors();

  let dropdown = host.querySelector(':scope > .ti-dropdown');
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.className = 'ti-dropdown';
    host.appendChild(dropdown);
  }

  dropdown.replaceChildren();
  dropdown.classList.add('open');
  armOutsideClose();

  const search = document.createElement('input');
  search.className = 'ti-dropdown-search';
  search.type = 'search';
  search.placeholder = 'Filter tokens…';
  dropdown.appendChild(search);

  const list = document.createElement('div');
  dropdown.appendChild(list);

  function renderOptions(filter = '') {
    list.replaceChildren();
    const q = filter.trim().toLowerCase();
    const filtered = config.options.filter(
      (opt) => !q || opt.name.toLowerCase().includes(q) || opt.label.toLowerCase().includes(q)
    );

    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'ti-dropdown-empty';
      empty.textContent = 'No matching tokens';
      list.appendChild(empty);
      return;
    }

    for (const opt of filtered) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ti-dropdown-option';
      if (opt.name === config.currentRef) btn.classList.add('active');

      if (opt.swatch) {
        const swatch = document.createElement('span');
        swatch.className = 'ti-swatch';
        swatch.style.background = opt.swatch;
        btn.appendChild(swatch);
      }

      btn.appendChild(document.createTextNode(opt.name));
      btn.title = opt.label;
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        dropdown.classList.remove('open');
        config.onPick(opt.name);
      });
      list.appendChild(btn);
    }
  }

  renderOptions();
  search.addEventListener('input', () => renderOptions(search.value));
  search.addEventListener('click', (e) => e.stopPropagation());
  requestAnimationFrame(() => search.focus());
}

/**
 * Keyword / size / freeform / color value editor for CSS properties & primitive raw values.
 * @param {HTMLElement} host
 * @param {{
 *   currentValue: string,
 *   options?: string[],
 *   allowCustom?: boolean,
 *   valueKind?: 'color' | 'length' | 'number' | 'text',
 *   placeholder?: string,
 *   onCommit: (value: string) => void,
 * }} config
 */
function mountValueEditor(host, config) {
  closeAllEditors();

  let editor = host.querySelector(':scope > .ti-value-editor');
  if (!editor) {
    editor = document.createElement('div');
    editor.className = 'ti-value-editor';
    host.appendChild(editor);
  }

  editor.replaceChildren();
  editor.classList.add('open');
  armOutsideClose();

  const options = config.options ?? [];
  const allowCustom = config.allowCustom !== false;
  const valueKind = config.valueKind ?? detectRawValueKind(config.currentValue);

  if (allowCustom) {
    const form = document.createElement('form');
    form.className = 'ti-value-editor-form';

    const textInput = document.createElement('input');
    textInput.className = 'ti-value-input';
    textInput.type = 'text';
    textInput.value = config.currentValue;
    textInput.placeholder = config.placeholder ?? 'Enter value…';

    if (valueKind === 'color') {
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.className = 'ti-color-input';
      const hexMatch = config.currentValue.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
      colorInput.value = hexMatch
        ? normalizeHexForColorInput(config.currentValue.trim())
        : '#000000';
      colorInput.addEventListener('input', () => {
        textInput.value = colorInput.value;
      });
      form.appendChild(colorInput);
    }

    form.appendChild(textInput);

    const apply = document.createElement('button');
    apply.type = 'submit';
    apply.className = 'ti-apply';
    apply.textContent = 'Apply';
    form.appendChild(apply);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const next = textInput.value.trim();
      if (!next) return;
      editor.classList.remove('open');
      config.onCommit(next);
    });

    textInput.addEventListener('click', (e) => e.stopPropagation());
    editor.appendChild(form);
    requestAnimationFrame(() => textInput.focus());
  }

  if (options.length) {
    const list = document.createElement('div');
    for (const opt of options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ti-dropdown-option';
      if (opt === config.currentValue) btn.classList.add('active');

      if (/^#|^rgb/i.test(opt) || opt === 'transparent') {
        const swatch = document.createElement('span');
        swatch.className = 'ti-swatch';
        swatch.style.background = opt === 'transparent' ? 'transparent' : opt;
        btn.appendChild(swatch);
      }

      btn.appendChild(document.createTextNode(opt));
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        editor.classList.remove('open');
        config.onCommit(opt);
      });
      list.appendChild(btn);
    }
    editor.appendChild(list);
  }
}

function normalizeHexForColorInput(hex) {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  }
  return `#${h.slice(0, 6)}`;
}

function replaceVarRef(value, fromName, toName) {
  const re = new RegExp(`var\\(\\s*${fromName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*([,)])`, 'g');
  return value.replace(re, `var(${toName}$1`);
}

/** Keep the current grid template at the top of suggestions. */
function withCurrentGridOption(options, currentValue) {
  const trimmed = currentValue.trim();
  if (!trimmed) return options;
  if (options.includes(trimmed)) return options;
  return [trimmed, ...options];
}

/** Pencil from extensions/token-audit/icons/edit.svg (currentColor for hover). */
const EDIT_ICON_SVG =
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M2 14V11.1667L10.8 2.38333C10.9333 2.26111 11.0807 2.16667 11.242 2.1C11.4033 2.03333 11.5727 2 11.75 2C11.9273 2 12.0996 2.03333 12.2667 2.1C12.4338 2.16667 12.5782 2.26667 12.7 2.4L13.6167 3.33333C13.75 3.45556 13.8473 3.6 13.9087 3.76667C13.97 3.93333 14.0004 4.1 14 4.26667C14 4.44444 13.9696 4.614 13.9087 4.77533C13.8478 4.93667 13.7504 5.08378 13.6167 5.21667L4.83333 14H2ZM11.7333 5.2L12.6667 4.26667L11.7333 3.33333L10.8 4.26667L11.7333 5.2Z" fill="currentColor"/></svg>';

function createEditButton(title) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ti-edit';
  btn.title = title;
  btn.setAttribute('aria-label', title);
  btn.innerHTML = EDIT_ICON_SVG;
  return btn;
}

/**
 * Append one or more token chips so multi-value shorthands
 * (e.g. padding: var(--a) var(--b)) show every token upfront.
 * @param {HTMLElement} host
 * @param {{ value: string, trees?: any[], property?: string }} prop
 */
function appendPropertyChips(host, prop) {
  if (prefersFullValueEdit(prop.property)) {
    const chip = document.createElement('span');
    chip.className = 'ti-token-chip wide';
    chip.textContent = prop.value;
    chip.title = prop.value;
    host.appendChild(chip);
    return;
  }

  const refs = extractVarRefs(prop.value);
  if (refs.length === 0) {
    const chip = document.createElement('span');
    chip.className = 'ti-token-chip';
    chip.textContent = prop.trees?.[0]?.name || prop.value;
    chip.title = prop.value;
    host.appendChild(chip);
    return;
  }

  refs.forEach((ref, index) => {
    if (index > 0) {
      const sep = document.createElement('span');
      sep.className = 'ti-token-sep';
      sep.textContent = '·';
      host.appendChild(sep);
    }

    const chip = document.createElement('span');
    chip.className = 'ti-token-chip';
    const tree = prop.trees?.[index];
    const terminal = tree ? terminalValue(tree) : '';
    // Show token + resolved raw when multi-value (padding x/y, etc.)
    if (refs.length > 1 && terminal && !terminal.startsWith('var(')) {
      chip.textContent = `${ref} = ${terminal}`;
      chip.classList.add('wide');
    } else {
      chip.textContent = ref;
    }
    chip.title = tree
      ? `${ref}${terminal ? ` → ${terminal}` : ''}`
      : prop.value;
    host.appendChild(chip);
  });
}

/**
 * @param {string} label
 * @param {Array<{ selector: string, file: string, sourcePath?: string, properties: Array<any> }>} groups
 * @param {{
 *   registry: Map<string, any>,
 *   element?: Element | null,
 *   onRefresh?: () => void,
 *   onReset?: () => void,
 *   onPushed?: () => void,
 * }} [context]
 */
export function showInspectPanel(label, groups, context) {
  const current = ensureInspectorUi();
  panelContext = context ?? null;
  panelView = { label, groups: groups ?? [] };
  current.panel.classList.add('open');
  current.panel.querySelector('.ti-selector').textContent = label;
  syncTabButtons(current.panel);

  const hint = current.panel.querySelector('.ti-hint');
  hint.replaceChildren();
  const hintText = document.createElement('span');
  hintText.className = 'ti-hint-text';
  const count = overrideCount();
  if (count) {
    hintText.textContent = `${count} pending edit(s) · preview only until Push`;
  } else if (activeTab === 'design') {
    hintText.textContent = 'Design view · edit values like Figma · Push writes files';
  } else {
    hintText.textContent = 'Hover a value to edit · click an icon to paste a new path';
  }
  hint.appendChild(hintText);

  if (count) {
    const actions = document.createElement('div');
    actions.className = 'ti-hint-actions';

    if (context?.onReset) {
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'ti-reset';
      reset.textContent = 'Reset';
      reset.addEventListener('click', (e) => {
        e.stopPropagation();
        context.onReset();
      });
      actions.appendChild(reset);
    }

    const push = document.createElement('button');
    push.type = 'button';
    push.className = 'ti-push';
    push.textContent = `Push ${count} change${count === 1 ? '' : 's'}`;
    push.addEventListener('click', async (e) => {
      e.stopPropagation();
      push.disabled = true;
      push.textContent = 'Pushing…';
      setPushStatus('Writing files…', null);
      const result = await pushEditsToWriter(listPendingEdits());
      if (result.ok) {
        setPushStatus(
          `${result.message}${result.written?.length ? `: ${result.written.join(', ')}` : ''}`,
          'ok'
        );
        context?.onPushed?.();
      } else {
        setPushStatus(
          result.detail ? `${result.message} — ${result.detail}` : result.message,
          'error'
        );
        push.disabled = false;
        push.textContent = `Push ${overrideCount()} change${overrideCount() === 1 ? '' : 's'}`;
      }
    });
    actions.appendChild(push);
    hint.appendChild(actions);
  }

  // Clear previous status line
  current.panel.querySelector('.ti-push-status')?.remove();

  renderPanelBody();
}

function renderPanelBody() {
  const current = ensureInspectorUi();
  const body = current.panel.querySelector('.ti-body');
  const iconSlot = current.panel.querySelector('.ti-icon-slot');
  body.replaceChildren();
  iconSlot?.replaceChildren();

  const groups = panelView.groups;
  const svg = relatedIconSvg(panelContext?.element);
  const editor = svg ? renderIconEditor(svg) : null;
  if (iconSlot) {
    if (editor) {
      iconSlot.hidden = false;
      iconSlot.appendChild(editor);
    } else {
      iconSlot.hidden = true;
    }
  } else if (editor) {
    body.appendChild(editor);
  }

  if (!groups.length && !svg) {
    const empty = document.createElement('div');
    empty.className = 'ti-design-empty';
    empty.textContent = 'No matching stylesheet rules found for this element.';
    body.appendChild(empty);
    return;
  }

  if (!groups.length) return;

  if (activeTab === 'design') {
    renderDesignBody(body, groups);
  } else {
    renderCssBody(body, groups);
  }
}

function renderIconEditor(svg) {
  const section = document.createElement('section');
  section.className = 'ti-group ti-icon-editor';

  const title = document.createElement('div');
  title.className = 'ti-group-title';
  title.textContent = 'Icon path';
  const file = document.createElement('span');
  file.className = 'ti-group-file';
  file.textContent = 'paste d to change';
  title.appendChild(file);
  section.appendChild(title);

  const previewRow = document.createElement('div');
  previewRow.className = 'ti-icon-preview-row';

  const preview = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  preview.classList.add('ti-icon-preview');
  preview.setAttribute('viewBox', svg.getAttribute('viewBox') || '0 0 24 24');
  preview.setAttribute('aria-hidden', 'true');
  preview.innerHTML = svg.innerHTML;
  previewRow.appendChild(preview);

  const current = document.createElement('div');
  current.className = 'ti-icon-current';
  const d = firstPathD(svg);
  current.textContent = d ? `d: ${d.length > 96 ? `${d.slice(0, 96)}…` : d}` : 'No path d on this SVG';
  current.title = d;
  previewRow.appendChild(current);
  section.appendChild(previewRow);

  const help = document.createElement('p');
  help.className = 'ti-icon-help';
  help.textContent =
    'Paste a path d, a <path>, or a full <svg>. The glyph on the left updates as you paste. Preview icon also updates the page.';
  section.appendChild(help);

  const form = document.createElement('form');
  form.className = 'ti-icon-form';

  const area = document.createElement('textarea');
  area.className = 'ti-icon-paste';
  area.rows = 5;
  area.placeholder = 'M6 6l12 12M18 6L6 18';
  area.addEventListener('click', (e) => e.stopPropagation());
  area.addEventListener('keydown', (e) => e.stopPropagation());
  area.addEventListener('input', () => {
    const parsed = parsePastedIcon(area.value);
    if (!parsed?.paths?.length) return;
    if (parsed.viewBox) preview.setAttribute('viewBox', parsed.viewBox);
    preview.replaceChildren();
    for (const pathD of parsed.paths) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathD);
      preview.appendChild(path);
    }
  });
  form.appendChild(area);

  const apply = document.createElement('button');
  apply.type = 'submit';
  apply.className = 'ti-apply';
  apply.textContent = 'Preview icon';
  form.appendChild(apply);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const parsed = parsePastedIcon(area.value);
    if (!parsed) {
      setPushStatus('Could not parse that SVG / path data', 'error');
      return;
    }
    const originalD = svg.__tiOrigD || firstPathD(svg);
    if (!originalD) {
      setPushStatus('This SVG has no path d to replace in source', 'error');
      return;
    }
    applySvgPreview(svg, parsed);
    previewSvgPathOverride({ from: originalD, to: parsed.paths[0] });
    showInspectPanel(panelView.label, panelView.groups, panelContext);
  });

  section.appendChild(form);
  return section;
}

function renderCssBody(body, groups) {
  for (const group of groups) {
    const section = document.createElement('section');
    section.className = 'ti-group';

    const title = document.createElement('div');
    title.className = 'ti-group-title';
    title.textContent = group.selector;
    if (group.file && group.file !== 'inline') {
      const file = document.createElement('span');
      file.className = 'ti-group-file';
      file.textContent = group.file;
      title.appendChild(file);
    }
    section.appendChild(title);

    for (const prop of group.properties) {
      const displayProp = applyOverrideToProp(prop, group.selector, panelContext?.registry);
      section.appendChild(renderProperty(displayProp, group));
    }

    body.appendChild(section);
  }
}

function renderDesignBody(body, groups) {
  const winning = flattenWinningProps(groups, (prop, selector) =>
    applyOverrideToProp(prop, selector, panelContext?.registry)
  );
  const sections = listPresentDesignSections(winning);
  const showLayout = hasLayoutEditorContent(winning);

  if (!showLayout && !sections.length) {
    const empty = document.createElement('div');
    empty.className = 'ti-design-empty';
    empty.textContent = 'No Design-mapped properties on this element. Switch to CSS for the full list.';
    body.appendChild(empty);
    return;
  }

  if (showLayout) {
    const computedDisplay =
      panelContext?.element instanceof Element
        ? getComputedStyle(panelContext.element).display
        : '';

    body.appendChild(
      renderLayoutEditor(winning, {
        registry: panelContext?.registry,
        computedDisplay,
        onCommit: (hit, next) => {
          if (!hit?.prop || !hit?.group) return;
          commitPropertyEdit(hit.group, { ...hit.prop, property: hit.property }, next);
        },
      })
    );
  }

  for (const section of sections) {
    const el = document.createElement('section');
    el.className = 'ti-design-section';

    const title = document.createElement('div');
    title.className = 'ti-design-title';
    title.textContent = section.title;
    el.appendChild(title);

    for (const row of section.rows) {
      const propEl = renderProperty(row.prop, row.group, row.label);
      const source = document.createElement('span');
      source.className = 'ti-design-source';
      source.textContent = row.group.selector;
      source.title = [row.group.selector, row.group.file].filter(Boolean).join(' · ');
      propEl.querySelector('.ti-prop-name')?.appendChild(source);
      el.appendChild(propEl);
    }

    body.appendChild(el);
  }
}

function setPushStatus(text, kind) {
  const panel = document.querySelector(`#${ROOT_ID} .ti-panel`);
  if (!panel) return;
  let status = panel.querySelector('.ti-push-status');
  if (!status) {
    status = document.createElement('div');
    status.className = 'ti-push-status';
    const hint = panel.querySelector('.ti-hint');
    hint?.insertAdjacentElement('afterend', status);
  }
  status.textContent = text;
  status.classList.remove('error', 'ok');
  if (kind) status.classList.add(kind);
}

function groupFileMeta(group) {
  const sourcePath = group.sourcePath || '';
  let file = group.file || '';
  if (sourcePath.startsWith('src/')) {
    file = `apps/frontend/${sourcePath}`;
  } else if (file && file !== 'inline' && file.endsWith('.css') && !file.includes('/')) {
    // Basename only — writer can resolve via allowlisted index
    file = file;
  }
  return { file, sourcePath };
}

function commitPropertyEdit(group, prop, next) {
  const { file, sourcePath } = groupFileMeta(group);
  previewPropertyOverride({
    selector: group.selector,
    property: prop.property,
    from: prop._sourceValue ?? prop.value,
    to: next,
    file,
    sourcePath,
  });
  panelContext?.onRefresh?.();
}

function commitTokenEdit(tokenName, from, to) {
  if (!panelContext?.registry) return;
  const entry = panelContext.registry.get(tokenName);
  previewTokenOverride({
    tokenName,
    from,
    to,
    file: normalizeTokenFile(entry?.file || ''),
    registry: panelContext.registry,
  });
  panelContext.onRefresh?.();
}

function applyOverrideToProp(prop, selector, registry) {
  const overridden = getPropertyOverride(selector, prop.property);
  if (!overridden) return prop;

  const trees = registry ? resolveValueTrees(overridden, registry) : [];
  let swatch = prop.swatch;
  if (trees.length) {
    const terminal = terminalValue(trees[0]);
    const normalized = normalizeColor(terminal);
    if (normalized.startsWith('#') || /^rgb/i.test(terminal)) {
      swatch = terminal;
    }
  } else if (/^#|^rgb/i.test(overridden) || overridden === 'transparent') {
    swatch = overridden;
  }

  return {
    ...prop,
    _sourceValue: prop._sourceValue ?? prop.value,
    value: overridden,
    trees,
    swatch,
    hasTokens: trees.length > 0,
    preview: true,
  };
}

/**
 * @param {any} prop
 * @param {any} group
 * @param {string} [label]
 */
function renderProperty(prop, group, label) {
  const wrap = document.createElement('div');
  wrap.className = 'ti-prop';

  const row = document.createElement('div');
  row.className = 'ti-prop-row';

  const name = document.createElement('div');
  name.className = 'ti-prop-name';
  name.textContent = label || prop.property;
  row.appendChild(name);

  const valueCell = document.createElement('div');

  if (prop.trees?.length) {
    const head = document.createElement('div');
    head.className = 'ti-editable';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ti-token-btn';
    btn.setAttribute('aria-expanded', 'false');

    if (prop.swatch && prop.trees.length === 1) {
      const swatch = document.createElement('span');
      swatch.className = 'ti-swatch';
      swatch.style.background = prop.swatch;
      btn.appendChild(swatch);
    }

    appendPropertyChips(btn, prop);

    const chevron = document.createElement('span');
    chevron.className = 'ti-chevron';
    chevron.textContent = '▸';
    btn.appendChild(chevron);

    if (prop.preview) {
      const badge = document.createElement('span');
      badge.className = 'ti-preview-badge';
      badge.textContent = 'preview';
      head.appendChild(badge);
    }

    const tree = document.createElement('div');
    tree.className = 'ti-tree';
    for (const node of prop.trees) {
      tree.appendChild(renderTreeNode(node, 0));
    }

    btn.addEventListener('click', () => {
      const open = tree.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    head.appendChild(btn);

    // Full-value edit for grid templates (ratios / tracks), even when a var() is present
    const valueEditor = getPropertyValueEditor(prop.property);
    if (prefersFullValueEdit(prop.property) && valueEditor) {
      const tracksEdit = createEditButton('Edit grid tracks / ratios');
      tracksEdit.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        mountValueEditor(valueCell, {
          currentValue: prop.value,
          options: withCurrentGridOption(valueEditor.options, prop.value),
          allowCustom: true,
          valueKind: 'text',
          placeholder: 'e.g. 2.5rem 2fr 4fr 1fr',
          onCommit: (next) => commitPropertyEdit(group, prop, next),
        });
      });
      head.appendChild(tracksEdit);
    } else {
      const propEdit = editableTargetForProperty(prop);
      if (propEdit && panelContext?.registry) {
        const editBtn = createEditButton(`Reassign ${propEdit.optionLayer} token`);
        editBtn.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          tree.classList.add('open');
          btn.setAttribute('aria-expanded', 'true');

          const options = listTokensByLayerAndKind(
            panelContext.registry,
            propEdit.optionLayer,
            propEdit.kind
          );
          mountDropdown(valueCell, {
            options,
            currentRef: propEdit.currentRef,
            onPick: (tokenName) => {
              const refs = extractVarRefs(prop.value);
              const fromRef = refs[0] || propEdit.currentRef;
              const nextValue =
                refs.length > 0
                  ? replaceVarRef(prop.value, fromRef, tokenName)
                  : `var(${tokenName})`;
              commitPropertyEdit(group, prop, nextValue);
            },
          });
        });
        head.appendChild(editBtn);
      }
    }

    valueCell.appendChild(head);
    valueCell.appendChild(tree);
  } else {
    const literalRow = document.createElement('div');
    literalRow.className = 'ti-literal-row';

    const literal = document.createElement('div');
    literal.className = 'ti-literal';
    if (prop.swatch) {
      const swatch = document.createElement('span');
      swatch.className = 'ti-swatch';
      swatch.style.background = prop.swatch;
      swatch.style.display = 'inline-block';
      swatch.style.marginRight = '6px';
      swatch.style.verticalAlign = 'middle';
      literal.appendChild(swatch);
    }
    literal.appendChild(document.createTextNode(prop.value));
    literalRow.appendChild(literal);

    if (prop.preview) {
      const badge = document.createElement('span');
      badge.className = 'ti-preview-badge';
      badge.textContent = 'preview';
      literalRow.appendChild(badge);
    }

    const valueEditor = getPropertyValueEditor(prop.property);
    if (valueEditor) {
      literalRow.classList.add('ti-editable');
      const editBtn = createEditButton(
        valueEditor.mode === 'keywords' ? `Change ${prop.property}` : `Edit ${prop.property}`
      );
      editBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        mountValueEditor(valueCell, {
          currentValue: prop.value,
          options: valueEditor.options,
          allowCustom: valueEditor.mode !== 'keywords',
          valueKind:
            valueEditor.mode === 'color'
              ? 'color'
              : valueEditor.mode === 'size'
                ? 'length'
                : detectRawValueKind(prop.value),
          placeholder:
            valueEditor.mode === 'size'
              ? 'e.g. 90%, fit-content, 2rem'
              : `New ${prop.property} value`,
          onCommit: (next) => commitPropertyEdit(group, prop, next),
        });
      });
      literalRow.appendChild(editBtn);
    }

    valueCell.appendChild(literalRow);
  }

  row.appendChild(valueCell);
  wrap.appendChild(row);
  return wrap;
}

function renderTreeNode(node, depth) {
  const wrap = document.createElement('div');
  wrap.className = 'ti-tree-node';
  wrap.style.marginLeft = `${depth * 8}px`;

  const line = document.createElement('div');
  line.className = 'ti-tree-line';

  const layer = document.createElement('span');
  layer.className = `ti-layer ${node.layer}`;
  layer.textContent = node.layer;
  line.appendChild(layer);

  const tokenName = document.createElement('span');
  tokenName.className = 'ti-tree-name';
  tokenName.textContent = node.name;
  line.appendChild(tokenName);

  if (node.terminal) {
    const val = document.createElement('span');
    val.className = 'ti-tree-value';
    val.textContent = `= ${node.value}`;
    line.appendChild(val);

    if (/^#|^rgb/i.test(node.value)) {
      const swatch = document.createElement('span');
      swatch.className = 'ti-swatch';
      swatch.style.background = node.value;
      line.appendChild(swatch);
    }
  }

  const nodeEdit = editableTargetForNode(node);
  if (nodeEdit && panelContext?.registry) {
    line.classList.add('ti-editable');
    const editBtn = createEditButton(
      nodeEdit.optionLayer === 'primitive' ? 'Reassign primitive' : 'Reassign semantic'
    );
    editBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      const options = listTokensByLayerAndKind(
        panelContext.registry,
        nodeEdit.optionLayer,
        nodeEdit.kind
      );
      mountDropdown(wrap, {
        options,
        currentRef: nodeEdit.currentRef,
        onPick: (tokenName) => {
          const declared =
            panelContext.registry.get(nodeEdit.tokenName)?.value ||
            `var(${nodeEdit.currentRef})`;
          commitTokenEdit(nodeEdit.tokenName, declared, `var(${tokenName})`);
        },
      });
    });
    line.appendChild(editBtn);
  }

  // Edit raw primitive values (hex, rem, etc.)
  if (node.layer === 'primitive' && node.terminal && panelContext?.registry) {
    line.classList.add('ti-editable');
    const rawEdit = createEditButton('Edit raw value');
    rawEdit.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const kind = detectRawValueKind(node.value);
      mountValueEditor(wrap, {
        currentValue: node.value,
        options: kind === 'length' ? ['0', '0.25rem', '0.5rem', '1rem', '1.5rem', '2rem', '2.5rem', '3rem', '4rem'] : [],
        allowCustom: true,
        valueKind: kind,
        placeholder: kind === 'color' ? '#hex or rgb()' : kind === 'length' ? 'e.g. 1rem, 16px' : 'Raw value',
        onCommit: (next) => {
          const declared = panelContext.registry.get(node.name)?.value || node.value;
          commitTokenEdit(node.name, declared, next);
        },
      });
    });
    line.appendChild(rawEdit);
  }

  wrap.appendChild(line);

  for (const child of node.children || []) {
    wrap.appendChild(renderTreeNode(child, depth + 1));
  }

  return wrap;
}

export function hidePanel() {
  if (!ui) return;
  ui.panel.classList.remove('open');
  ui.selectBox.style.display = 'none';
  ui.hoverBox.style.display = 'none';
}

export function setOnClose(fn) {
  ensureInspectorUi().onClose = fn;
}

export function reposition(selectedEl, hoverEl) {
  if (!ui) return;
  if (selectedEl) positionBox(ui.selectBox, selectedEl);
  if (hoverEl) positionBox(ui.hoverBox, hoverEl);
}
