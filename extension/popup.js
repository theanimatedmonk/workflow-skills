const STORAGE_KEY = 'tokenInspectEnabled';

function expectedBuild() {
  return chrome.runtime.getManifest().version;
}

function isLocalDevUrl(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    );
  } catch {
    return false;
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    }, 8000);
    function onUpdated(id, info) {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        clearTimeout(timeout);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

async function pingTab(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'PING' });
  } catch {
    return null;
  }
}

async function ensureContentScript(tab) {
  if (!tab?.id || !isLocalDevUrl(tab.url ?? '')) return false;
  const expected = expectedBuild();

  let pong = await pingTab(tab.id);
  if (pong?.ok && pong.version === expected) return true;

  // Old content script has no version — reload so Chrome injects this build.
  if (pong?.ok && pong.version !== expected) {
    await chrome.tabs.reload(tab.id);
    await waitForTabLoad(tab.id);
    await new Promise((r) => setTimeout(r, 300));
    pong = await pingTab(tab.id);
    if (pong?.ok && pong.version === expected) return true;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.bundle.js'],
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    pong = await pingTab(tab.id);
    return Boolean(pong?.ok);
  } catch (err) {
    console.error('[Token Inspect] inject failed', err);
    return false;
  }
}

async function sendToTab(message) {
  const tab = await getActiveTab();
  if (!tab?.id) return { error: 'no-tab' };
  if (!isLocalDevUrl(tab.url ?? '')) {
    return { error: 'not-localhost', url: tab.url ?? '' };
  }

  const ready = await ensureContentScript(tab);
  if (!ready) return { error: 'inject-failed' };

  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (err) {
    console.error('[Token Inspect] message failed', err);
    return { error: 'message-failed' };
  }
}

function setStatus(text) {
  document.getElementById('status').textContent = text;
}

async function refresh() {
  const { [STORAGE_KEY]: enabled = false } = await chrome.storage.local.get(STORAGE_KEY);
  const toggleBtn = document.getElementById('toggle-btn');
  toggleBtn.textContent = enabled ? 'Stop inspect' : 'Start inspect';
  toggleBtn.classList.toggle('active', enabled);

  const mode = document.getElementById('mode-status');
  mode.textContent = enabled ? 'On' : 'Off';
  mode.classList.toggle('on', enabled);

  const tab = await getActiveTab();
  if (!tab?.url || !isLocalDevUrl(tab.url)) {
    document.getElementById('token-count').textContent = '—';
    setStatus('Open http://localhost:5173, then start inspect.');
    return;
  }

  const result = await sendToTab({ type: 'GET_STATUS' });
  if (!result || result.error) {
    document.getElementById('token-count').textContent = '—';
    setStatus('Reload the Chrome extension, refresh this page, then try again.');
    return;
  }

  document.getElementById('token-count').textContent = String(result.tokens ?? '—');
  const build = result.version ? ` · v${result.version}` : '';
  setStatus(
    enabled
      ? result.selected
        ? `Selected ${result.selected}${build}`
        : `Click an icon — path preview is at the top of the panel${build}`
      : `Start inspect, then click an icon to paste path data${build}`
  );
}

document.getElementById('toggle-btn').addEventListener('click', async () => {
  const { [STORAGE_KEY]: enabled = false } = await chrome.storage.local.get(STORAGE_KEY);
  const next = !enabled;
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  await sendToTab({ type: next ? 'ENABLE' : 'DISABLE' });
  await refresh();
});

refresh();
