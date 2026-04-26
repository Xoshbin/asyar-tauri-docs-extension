// ───────────────────────────────────────────────────────────────────────────
// worker.ts — Tier 2 tauri-docs extension worker entry, loaded by
// dist/worker.html.
//
// Owns the searchable surface: the ufuzzy-backed `SearchEngine` over
// `TAURI_DOCS`, the `TauriDocsWorkerExtension` that implements `search()`
// against it, and the `extensionBridge` registration that makes the launcher
// dispatch `asyar:search:request` envelopes here. Lives in the always-on
// worker iframe so query handling stays alive across the view's lifecycle —
// see `asyar-launcher/CLAUDE.md` ("`searchable: true` `search()` handler").
//
// Imports come from `asyar-sdk/worker` (role assertion + worker-only
// ExtensionContext) and `asyar-sdk/contracts` (pure types). The /worker
// entry asserts `window.__ASYAR_ROLE__ === "worker"` at module load; the
// Rust `asyar-extension://` scheme handler injects that global into
// `worker.html` at serve time.
// ───────────────────────────────────────────────────────────────────────────

import {
  ExtensionContext as WorkerExtensionContext,
  extensionBridge,
} from 'asyar-sdk/worker';
import {
  SearchEngine,
  type Extension,
  type ExtensionContext,
  type ExtensionResult,
} from 'asyar-sdk/contracts';
import manifest from '../manifest.json';
import { TAURI_DOCS, type DocEntry } from './data/tauriDocs';

const extensionId =
  window.location.hostname === 'localhost' ||
  window.location.hostname === 'asyar-extension.localhost'
    ? window.location.pathname.split('/').filter(Boolean)[0] || 'org.asyar.tauri-docs'
    : window.location.hostname || 'org.asyar.tauri-docs';

const workerContext = new WorkerExtensionContext();
workerContext.setExtensionId(extensionId);

const searchEngine = new SearchEngine<DocEntry>({
  getText: (d) => `${d.title} ${d.description} ${d.section} ${d.path}`,
});
searchEngine.setItems(TAURI_DOCS);

// The `Extension` interface's `initialize(ctx)` expects the contracts-flavored
// ExtensionContext, which is a sibling (not a supertype) of the worker-
// flavored class we construct at module scope. Since this worker owns its
// search engine lexically, the `initialize` hook is a no-op.
class TauriDocsWorkerExtension implements Extension {
  async initialize(_ctx: ExtensionContext): Promise<void> {}
  async activate(): Promise<void> {}
  async deactivate(): Promise<void> {}

  async executeCommand(_commandId: string, _args?: Record<string, unknown>): Promise<unknown> {
    // View commands (`mode: "view"`) are routed by the launcher to the view
    // iframe via manifest.component. This worker has no background commands,
    // so executeCommand is never dispatched here in normal flow.
    return undefined;
  }

  async search(query: string): Promise<ExtensionResult[]> {
    const results = searchEngine.search(query);
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

const extensionModule = new TauriDocsWorkerExtension();

extensionBridge.registerManifest(manifest as any);
extensionBridge.registerExtensionImplementation(extensionId, extensionModule);

window.parent.postMessage({ type: 'asyar:extension:loaded', extensionId, role: 'worker' }, '*');
