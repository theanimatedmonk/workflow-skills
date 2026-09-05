import { collectMatchedStyles, elementLabel } from './collect-styles.js';
import { clearOverrides } from './overrides.js';
import { relatedIconSvg } from './svg-icon.js';
import { loadTokenRegistry } from './tokens.js';
import { closeCatalog, isCatalogOpen, setCatalogRegistry } from './token-catalog.js';
import {
  clearInspectorUi,
  ensureInspectorUi,
  hidePanel,
  reposition,
  setHoverTarget,
  setOnClose,
  setSelectTarget,
  showInspectPanel,
} from './panel.js';

// Writer clears after successful push — drop preview overlays so Vite HMR is source of truth

const STORAGE_KEY = 'tokenInspectEnabled';

/** @type {Map<string, { value: string, file: string, layer: string }> | null} */
let tokenRegistry = null;
let enabled = false;
/** @type {Element | null} */
let selectedEl = null;
/** @type {Element | null} */
let hoverEl = null;

function isOurUi(el) {
  return Boolean(el?.closest?.('#slimvg-token-inspect-root'));
}

async function ensureRegistry() {
  if (!tokenRegistry) {
    tokenRegistry = await loadTokenRegistry();
  }
  setCatalogRegistry(tokenRegistry);
  return tokenRegistry;
}

function refreshSelectedPanel() {
  if (!selectedEl || !tokenRegistry) return;
  const groups = collectMatchedStyles(selectedEl, tokenRegistry);
  showInspectPanel(elementLabel(selectedEl), groups, {
    registry: tokenRegistry,
    element: selectedEl,
    onRefresh: refreshSelectedPanel,
    onReset: () => {
      clearOverrides(tokenRegistry);
      tokenRegistry = null;
      ensureRegistry().then(() => refreshSelectedPanel());
    },
    onPushed: () => {
      clearOverrides(tokenRegistry);
      tokenRegistry = null;
      // Brief delay so Vite can pick up writes before re-inspect
      setTimeout(() => {
        ensureRegistry().then(() => refreshSelectedPanel());
      }, 300);
    },
  });
}

function onMouseMove(event) {
  if (!enabled) return;
  const target = event.target;
  if (!(target instanceof Element) || isOurUi(target)) {
    setHoverTarget(null);
    hoverEl = null;
    return;
  }
  const hoverTarget = relatedIconSvg(target) || target;
  hoverEl = hoverTarget;
  if (selectedEl !== hoverTarget) setHoverTarget(hoverTarget);
}

async function onClick(event) {
  if (!enabled) return;
  const target = event.target;
  if (!(target instanceof Element) || isOurUi(target)) return;

  event.preventDefault();
  event.stopPropagation();

  selectedEl = relatedIconSvg(target) || target;
  hoverEl = null;
  setSelectTarget(selectedEl);
  setHoverTarget(null);

  await ensureRegistry();
  refreshSelectedPanel();
}

function onKeyDown(event) {
  if (!enabled) return;
  if (event.key === 'Escape') {
    // Close open dropdown first
    const openEditor = document.querySelector(
      '#slimvg-token-inspect-root .ti-dropdown.open, #slimvg-token-inspect-root .ti-value-editor.open'
    );
    if (openEditor) {
      event.preventDefault();
      openEditor.classList.remove('open');
      return;
    }
    if (isCatalogOpen()) {
      event.preventDefault();
      closeCatalog();
      return;
    }
    event.preventDefault();
    setEnabled(false);
  }
}

function onScrollOrResize() {
  if (!enabled) return;
  reposition(selectedEl, hoverEl);
}

async function setEnabled(next) {
  if (next === enabled) {
    if (next) ensureInspectorUi();
    return;
  }
  enabled = next;
  await chrome.storage.local.set({ [STORAGE_KEY]: next });

  if (enabled) {
    ensureInspectorUi();
    setOnClose(() => setEnabled(false));
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    document.documentElement.style.cursor = 'crosshair';
    await ensureRegistry();
  } else {
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('scroll', onScrollOrResize, true);
    window.removeEventListener('resize', onScrollOrResize);
    document.documentElement.style.cursor = '';
    selectedEl = null;
    hoverEl = null;
    hidePanel();
    clearInspectorUi();
  }
}

window.addEventListener('slimvg-token-inspect-teardown', () => {
  if (enabled) {
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('scroll', onScrollOrResize, true);
    window.removeEventListener('resize', onScrollOrResize);
    document.documentElement.style.cursor = '';
  }
  enabled = false;
  selectedEl = null;
  hoverEl = null;
  hidePanel();
  clearInspectorUi();
});

export const TI_BUILD = '2.2.1';

export function getStatus() {
  return {
    enabled,
    selected: selectedEl ? elementLabel(selectedEl) : null,
    tokens: tokenRegistry?.size ?? 0,
    version: TI_BUILD,
  };
}

export async function enableInspect() {
  await setEnabled(true);
  return getStatus();
}

export async function disableInspect() {
  await setEnabled(false);
  return getStatus();
}

export async function initFromStorage() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  if (result[STORAGE_KEY]) {
    await setEnabled(true);
  }
}
