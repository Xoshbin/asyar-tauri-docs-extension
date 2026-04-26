// ───────────────────────────────────────────────────────────────────────────
// view.ts — Tier 2 tauri-docs extension entry, loaded by dist/view.html.
//
// Combines two responsibilities into one file:
//
// 1) The searchable-extension implementation (`TauriDocsExtension`) — owns
//    the ufuzzy-backed `SearchEngine`, contributes results to the launcher's
//    global search via `extension.search()`, and handles its own command
//    invocations via `extension.executeCommand()`. Registered with the
//    iframe's `ExtensionBridge` singleton so the bridge can dispatch
//    `asyar:search:request` / `asyar:command:execute` postMessages to it.
//
// 2) The view iframe bootstrap — creates the single `ExtensionContext`,
//    resolves services, mounts the Svelte view, wires the ⌘K forwarder,
//    and signals readiness so the host can deliver the preferences bundle.
//
// Imports come exclusively from `asyar-sdk/view`. That entry asserts
// `window.__ASYAR_ROLE__ === "view"` at module load time; the Rust
// `asyar-extension://` scheme handler injects that global into `view.html`
// at serve time (see `uri_schemes.rs::inject_asyar_role`).
// ───────────────────────────────────────────────────────────────────────────

import 'asyar-sdk/tokens.css';
import { mount } from 'svelte';
import DefaultView from './DefaultView.svelte';
import manifest from '../manifest.json';
import { TAURI_DOCS, type DocEntry } from './data/tauriDocs';

import {
  ExtensionContext,
  extensionBridge,
  registerIconElement,
  SearchEngine,
  type Extension,
  type ExtensionResult,
  type INetworkService,
  type IActionService,
  type IFeedbackService,
} from 'asyar-sdk/view';

// ── Extension implementation ──────────────────────────────────────────────

class TauriDocsExtension implements Extension {
  private extensionManager?: any;
  private searchEngine: SearchEngine<DocEntry>;

  constructor() {
    this.searchEngine = new SearchEngine<DocEntry>({
      getText: (d) => `${d.title} ${d.description} ${d.section} ${d.path}`,
    });
    this.searchEngine.setItems(TAURI_DOCS);
  }

  async initialize(context: ExtensionContext) {
    this.extensionManager = context.getService('extensions');
  }

  async activate(): Promise<void> {}
  async deactivate(): Promise<void> {}
  async viewActivated(_viewId: string): Promise<void> {}
  async viewDeactivated(_viewId: string): Promise<void> {}

  async executeCommand(commandId: string, _args?: Record<string, any>): Promise<any> {
    if (commandId === 'open') {
      this.extensionManager?.navigateToView('org.asyar.tauri-docs/DefaultView');
      return {
        type: 'view',
        viewPath: 'org.asyar.tauri-docs/DefaultView',
      };
    }
  }

  async search(query: string): Promise<ExtensionResult[]> {
    const results = this.searchEngine.search(query);
    return results.slice(0, 5).map((doc, i) => ({
      title: `📖 ${doc.title}`,
      subtitle: doc.description,
      score: Math.max(0.3, 0.9 - i * 0.1),
      type: 'view' as const,
      icon: '📖',
      viewPath: 'org.asyar.tauri-docs/DefaultView',
      action: () => {},
    }));
  }

  onUnload = () => {};
}

const extensionModule = new TauriDocsExtension();

// ── View iframe bootstrap ─────────────────────────────────────────────────

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

// Register with ExtensionBridge so it can dispatch:
//   - asyar:search:request  → extension.search(query)
//   - asyar:command:execute → extension.executeCommand(commandId, args)
extensionBridge.registerManifest(manifest as any);
extensionBridge.registerExtensionImplementation(extensionId, extensionModule);

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
window.parent.postMessage({ type: 'asyar:extension:loaded', extensionId }, '*');

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
