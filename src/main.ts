import 'asyar-sdk/tokens.css';
import { mount } from 'svelte';
import DefaultView from './DefaultView.svelte';

// Extension SDK Setup
import { ExtensionContext, ExtensionBridge, registerIconElement, type INetworkService, type ILogService, type IActionService } from 'asyar-sdk';
import extensionModule from './index';
import manifest from '../manifest.json';

// The host parses the URI and mounts us. The hostname contains our extension ID.
// Example (macOS/Linux):  asyar-extension://org.asyar.tauri-docs/index.html
// Example (Windows):      asyar-extension://localhost/org.asyar.tauri-docs/index.html
const extensionId = (
  window.location.hostname === 'localhost' ||
  window.location.hostname === 'asyar-extension.localhost'
)
  ? window.location.pathname.split('/').filter(Boolean)[0] || 'org.asyar.tauri-docs'
  : window.location.hostname || 'org.asyar.tauri-docs';

console.log(`[Extension:${extensionId}] Bootstrapping...`);

// 1. Initialize SDK context — single instance for the entire extension lifetime
const context = new ExtensionContext();
context.setExtensionId(extensionId);
registerIconElement();

// 2. Initialize ExtensionBridge for IPC-based search and command handling.
//    The bridge listens for asyar:search:request and routes to extension.search().
const bridge = ExtensionBridge.getInstance();
bridge.registerManifest(manifest as any);
bridge.registerExtensionImplementation(extensionId, extensionModule);

// 3. Notify Host that we are loaded and ready
window.parent.postMessage({
  type: 'asyar:extension:loaded',
  extensionId
}, '*');

// 4. Forward Cmd+K (and other global shortcuts) to the host so the action
//    drawer opens even when focus is inside the iframe.
window.addEventListener('keydown', (event) => {
  const isCommandK = (event.metaKey || event.ctrlKey) && event.key === 'k';

  if (isCommandK) {
    event.preventDefault();
    window.parent.postMessage({
      type: 'asyar:extension:keydown',
      payload: {
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
      }
    }, '*');
  }
});

// 5. Resolve services once — passed as props so components never create their own context.
const network       = context.getService<INetworkService>('NetworkService');
const logger        = context.getService<ILogService>('LogService');
const actionService = context.getService<IActionService>('ActionService');

// 6. Mount the correct view based on the ?view= query param.
const viewName = new URLSearchParams(window.location.search).get('view') || 'DefaultView';
const target   = document.getElementById('app')!;

let app: any;
if (viewName === 'DefaultView') {
  app = mount(DefaultView, {
    target,
    props: { network, logger, actionService },
  });
}

export default app ?? null;
