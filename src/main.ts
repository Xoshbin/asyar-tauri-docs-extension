// ───────────────────────────────────────────────────────────────────────────
// main.ts — Tier 2 extension bootstrap (searchable + command-handling)
//
// This is the canonical bootstrap for a Tier 2 extension that:
//   - Declares `searchable: true` in manifest.json
//   - Contributes results to the global launcher search via `extension.search()`
//   - Handles its own commands in `extension.executeCommand()`
//
// Unlike a view-only extension that just calls `context.setExtensionId(id)`
// and mounts a component, a searchable extension has to register itself
// with the iframe's `ExtensionBridge` singleton so the bridge knows which
// `Extension` implementation to dispatch `asyar:search:request` and
// `asyar:command:execute` messages to.
//
// Bootstrap order:
//   1. Parse extensionId from the asyar-extension://{id}/ URL
//   2. Import tokens.css so this extension inherits the host theme
//   3. Create the ExtensionContext — a single instance per iframe. The
//      setExtensionId call also self-registers the context with the
//      bridge and drains any preferences bundle that already arrived.
//   4. Register the manifest and extension implementation with the bridge
//      so it can route search/command messages to them.
//   5. Forward Cmd+K so the launcher's action drawer opens while focus
//      is inside the iframe.
//   6. Post asyar:extension:loaded — the host replies with
//      asyar:event:preferences:set-all, which ExtensionBridge delivers
//      to context.setPreferences (frozen snapshot installed).
//   7. Resolve services as props and mount the view.
// ───────────────────────────────────────────────────────────────────────────

import 'asyar-sdk/tokens.css';
import { mount } from 'svelte';
import DefaultView from './DefaultView.svelte';

import {
  ExtensionContext,
  ExtensionBridge,
  registerIconElement,
  type INetworkService,
  type IActionService,
  type IFeedbackService,
} from 'asyar-sdk';
import extensionModule from './index';
import manifest from '../manifest.json';

// The host parses the URI and mounts us. The hostname contains our extension ID.
//   macOS/Linux:  asyar-extension://org.asyar.tauri-docs/index.html
//   Windows:      asyar-extension://localhost/org.asyar.tauri-docs/index.html
const extensionId = (
  window.location.hostname === 'localhost' ||
  window.location.hostname === 'asyar-extension.localhost'
)
  ? window.location.pathname.split('/').filter(Boolean)[0] || 'org.asyar.tauri-docs'
  : window.location.hostname || 'org.asyar.tauri-docs';

console.log(`[Extension:${extensionId}] Bootstrapping...`);

// 1. Single ExtensionContext for the whole iframe lifetime.
//    setExtensionId also self-registers the context with the bridge's
//    activeContexts map via registerActiveContext(id, context) so the
//    preferences listener can deliver asyar:event:preferences:set-all
//    bundles here. Any bundle that arrived before registration is
//    drained from the bridge's __pending__ sentinel key.
const context = new ExtensionContext();
context.setExtensionId(extensionId);
registerIconElement();

// 2. Register with ExtensionBridge so it can dispatch:
//      - asyar:search:request  → extension.search(query)
//      - asyar:command:execute → extension.executeCommand(commandId, args)
//    The bridge has `window.addEventListener('message', ...)` handlers
//    that look up the registered implementation by extensionId.
const bridge = ExtensionBridge.getInstance();
bridge.registerManifest(manifest as any);
bridge.registerExtensionImplementation(extensionId, extensionModule);

// 3. Forward Cmd+K (and other global shortcuts) to the host so the
//    action drawer opens even when focus is inside the iframe.
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
      },
    }, '*');
  }
});

// 4. Signal readiness to the host. The host replies with the initial
//    preferences bundle via asyar:event:preferences:set-all, which
//    ExtensionBridge delivers to context.setPreferences.
window.parent.postMessage({ type: 'asyar:extension:loaded', extensionId }, '*');

// 5. Resolve services once — passed as props so children never construct
//    their own context (which would attach duplicate focus listeners).
const network         = context.getService<INetworkService>('network');
const actionService   = context.getService<IActionService>('actions');
const feedbackService = context.getService<IFeedbackService>('feedback');

// 6. Mount the correct view based on the ?view= query param.
const viewName = new URLSearchParams(window.location.search).get('view') || 'DefaultView';
const target   = document.getElementById('app')!;

let app: any;
if (viewName === 'DefaultView') {
  app = mount(DefaultView, {
    target,
    // Pass `context` so components that care about preferences can
    // subscribe to context.onPreferencesChanged and re-read fresh
    // values when the user edits them in Settings.
    props: { context, network, actionService, feedbackService },
  });
}

export default app ?? null;
