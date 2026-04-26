// ───────────────────────────────────────────────────────────────────────────
// view.ts — Tier 2 tauri-docs extension view entry, loaded by dist/view.html.
//
// Owns the view-side concerns: creating the `ExtensionContext`, resolving
// view-only services, mounting the Svelte view, wiring the ⌘K forwarder,
// and signalling readiness so the host can deliver the preferences bundle.
//
// The searchable surface (SearchEngine + search() handler + Extension impl)
// lives in `worker.ts`, which the launcher always-mounts because the
// manifest declares `background.main`. This view never registers itself
// with `extensionBridge`; the worker owns that registration so query
// handling stays alive across view Dormant.
//
// Imports come exclusively from `asyar-sdk/view`. That entry asserts
// `window.__ASYAR_ROLE__ === "view"` at module load time; the Rust
// `asyar-extension://` scheme handler injects that global into `view.html`
// at serve time (see `uri_schemes.rs::inject_asyar_role`).
// ───────────────────────────────────────────────────────────────────────────

import 'asyar-sdk/tokens.css';
import { mount } from 'svelte';
import DefaultView from './DefaultView.svelte';

import {
  ExtensionContext,
  registerIconElement,
  type INetworkService,
  type IActionService,
  type IFeedbackService,
} from 'asyar-sdk/view';

// The host parses the URI and mounts us. Hostname contains our extension ID:
//   macOS/Linux:  asyar-extension://org.asyar.tauri-docs/view.html
//   Windows:      asyar-extension://localhost/org.asyar.tauri-docs/view.html
const extensionId = (
  window.location.hostname === 'localhost' ||
  window.location.hostname === 'asyar-extension.localhost'
)
  ? window.location.pathname.split('/').filter(Boolean)[0] || 'org.asyar.tauri-docs'
  : window.location.hostname || 'org.asyar.tauri-docs';

// `setExtensionId` also self-registers the context with the bridge's
// `activeContexts` map so the preferences listener can deliver the initial
// `asyar:event:preferences:set-all` bundle here. Any bundle that arrived
// before registration is drained from the bridge's `__pending__` sentinel.
const context = new ExtensionContext();
context.setExtensionId(extensionId);
registerIconElement();

// Forward ⌘K to the host so the action drawer opens while focus is inside
// this iframe.
window.addEventListener('keydown', (event) => {
  const isCommandK = (event.metaKey || event.ctrlKey) && event.key === 'k';
  if (isCommandK) {
    event.preventDefault();
    window.parent.postMessage(
      {
        type: 'asyar:extension:keydown',
        payload: {
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
        },
      },
      '*',
    );
  }
});

// Signal readiness. Host replies with the initial preferences bundle via
// `asyar:event:preferences:set-all`; ExtensionBridge delivers it to
// `context.setPreferences`.
window.parent.postMessage({ type: 'asyar:extension:loaded', extensionId, role: 'view' }, '*');

// Services resolved once; passed as props so children never construct their
// own context (which would double up focus listeners).
const network = context.getService<INetworkService>('network');
const actionService = context.getService<IActionService>('actions');
const feedbackService = context.getService<IFeedbackService>('feedback');

const viewName = new URLSearchParams(window.location.search).get('view') || 'DefaultView';
const target = document.getElementById('app')!;

if (viewName === 'DefaultView') {
  mount(DefaultView, {
    target,
    props: { context, network, actionService, feedbackService },
  });
}
