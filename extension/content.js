import { disableInspect, enableInspect, getStatus, initFromStorage, TI_BUILD } from './inspector.js';

window.dispatchEvent(new Event('slimvg-token-inspect-teardown'));
document.getElementById('slimvg-token-inspect-root')?.remove();
document.getElementById('slimvg-token-inspect-style')?.remove();

globalThis.__slimvgTokenInspectBuild = TI_BUILD;

if (!globalThis.__slimvgTokenInspectListener) {
  globalThis.__slimvgTokenInspectListener = true;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const handle = globalThis.__slimvgTokenInspectHandle;
    if (!handle) {
      sendResponse({ error: 'not-ready' });
      return false;
    }
    handle(message)
      .then(sendResponse)
      .catch((err) => {
        console.error('[Token Inspect]', err);
        sendResponse({ error: String(err) });
      });
    return true;
  });
}

globalThis.__slimvgTokenInspectHandle = async (message) => {
  switch (message.type) {
    case 'PING':
      return { ok: true, version: TI_BUILD };
    case 'ENABLE':
      return enableInspect();
    case 'DISABLE':
      return disableInspect();
    case 'GET_STATUS':
      return getStatus();
    default:
      return null;
  }
};

initFromStorage();
