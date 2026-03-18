import { mount } from 'svelte';
import DefaultView from './DefaultView.svelte';

// Extension SDK Setup
import { ExtensionContext } from 'asyar-api';

// The host parses the URI and mounts us. The hostname contains our extension ID.
// Example: asyar-extension://org.asyar.tauri-docs/index.html
const extensionId = window.location.hostname || 'org.asyar.tauri-docs';

console.log(`[Extension:${extensionId}] Bootstrapping...`);

// 1. Initialize SDK context
const context = new ExtensionContext();
context.setExtensionId(extensionId);

// 2. Notify Host that we are loaded and ready
window.parent.postMessage({
  type: 'asyar:extension:loaded',
  extensionId
}, '*');

// 3. Mount the DefaultView
const app = mount(DefaultView, {
  target: document.getElementById('app')!
});

export default app;
