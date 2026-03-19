import { mount } from 'svelte';
import DefaultView from './DefaultView.svelte';

// Extension SDK Setup
import { ExtensionContext, type INetworkService, type ILogService, type IActionService } from 'asyar-api';

// The host parses the URI and mounts us. The hostname contains our extension ID.
// Example: asyar-extension://org.asyar.tauri-docs/index.html
const extensionId = window.location.hostname || 'org.asyar.tauri-docs';

console.log(`[Extension:${extensionId}] Bootstrapping...`);

// 1. Initialize SDK context — single instance for the entire extension lifetime
const context = new ExtensionContext();
context.setExtensionId(extensionId);

// 2. Notify Host that we are loaded and ready
window.parent.postMessage({
  type: 'asyar:extension:loaded',
  extensionId
}, '*');

// 3. Forward Cmd+K (and other global shortcuts) to the host so the action
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

// 4. Mount the DefaultView, passing services from the single context as props
//    so the component does not need to create its own ExtensionContext.
const app = mount(DefaultView, {
  target: document.getElementById('app')!,
  props: {
    network: context.getService<INetworkService>('NetworkService'),
    logger: context.getService<ILogService>('LogService'),
    actionService: context.getService<IActionService>('ActionService'),
  }
});

export default app;
