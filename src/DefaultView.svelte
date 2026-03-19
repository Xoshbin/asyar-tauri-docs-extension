<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { ActionContext, type ExtensionAction, type INetworkService, type ILogService, type IActionService } from 'asyar-api';
  import { fetchDocContent } from './lib/docsClient';

  // --- Props (injected by main.ts from the single ExtensionContext) ---
  interface Props {
    network: INetworkService;
    logger: ILogService;
    actionService: IActionService;
  }
  let { network, logger, actionService: actionServiceProp }: Props = $props();

  // --- State ---
  let searchQuery = $state('');
  let allDocs: DocEntry[] = $state([]);
  let filteredDocs: DocEntry[] = $state([]);
  let selectedIndex = $state(0);
  let isLoading = $state(true);
  let listContainer: HTMLDivElement | undefined = $state();

  let docHtml: string | null = $state(null);
  let isLoadingDoc = $state(false);
  let docError = $state(false);

  // Note: listContainer has tabindex="0" for accessibility but we do NOT call
  // listContainer.focus() on mount. Keyboard navigation arrives via the
  // asyar:view:keydown postMessage forwarded by the host, so DOM focus must
  // remain in the host's search input.

  interface DocEntry {
    title: string;
    path: string;
    section: string;
    description: string;
  }

  // Tauri v2 documentation entries
  const TAURI_DOCS: DocEntry[] = [
    // Getting Started
    { title: 'Quick Start', path: '/start/create-project/', section: 'Getting Started', description: 'Create a new Tauri project from scratch' },
    { title: 'Prerequisites', path: '/start/prerequisites/', section: 'Getting Started', description: 'System requirements and development setup' },
    { title: 'Frontend Configuration', path: '/start/frontend/', section: 'Getting Started', description: 'Configure your frontend framework with Tauri' },
    { title: 'Migrate from v1', path: '/start/migrate/from-tauri-1/', section: 'Getting Started', description: 'Migration guide from Tauri v1 to v2' },

    // Core Concepts
    { title: 'Commands', path: '/develop/calling-rust/', section: 'Core Concepts', description: 'Call Rust functions from your frontend using commands' },
    { title: 'Events', path: '/develop/calling-frontend/', section: 'Core Concepts', description: 'Communicate between Rust and frontend using events' },
    { title: 'State Management', path: '/develop/state-management/', section: 'Core Concepts', description: 'Manage application state in Tauri' },
    { title: 'Window Management', path: '/reference/webview/', section: 'Core Concepts', description: 'Create and manage application windows and webviews' },
    { title: 'Inter-Process Communication', path: '/concept/inter-process-communication/', section: 'Core Concepts', description: 'How Tauri handles IPC between processes' },

    // Plugins
    { title: 'Plugins Overview', path: '/develop/plugins/', section: 'Plugins', description: 'Extend Tauri with community and official plugins' },
    { title: 'File System', path: '/plugin/file-system/', section: 'Plugins', description: 'Read and write files using the fs plugin' },
    { title: 'HTTP Client', path: '/plugin/http-client/', section: 'Plugins', description: 'Make HTTP requests from your app' },
    { title: 'Shell', path: '/plugin/shell/', section: 'Plugins', description: 'Execute shell commands and open URLs' },
    { title: 'Clipboard', path: '/plugin/clipboard-manager/', section: 'Plugins', description: 'Read and write clipboard contents' },
    { title: 'Notifications', path: '/plugin/notification/', section: 'Plugins', description: 'Send native desktop notifications' },
    { title: 'System Tray', path: '/plugin/system-tray/', section: 'Plugins', description: 'Add system tray icons and menus' },
    { title: 'Global Shortcut', path: '/plugin/global-shortcut/', section: 'Plugins', description: 'Register global keyboard shortcuts' },
    { title: 'Dialog', path: '/plugin/dialog/', section: 'Plugins', description: 'Open native file and message dialogs' },
    { title: 'Updater', path: '/plugin/updater/', section: 'Plugins', description: 'Auto-update your application' },
    { title: 'Deep Linking', path: '/plugin/deep-linking/', section: 'Plugins', description: 'Handle custom URL schemes and deep links' },
    { title: 'Store', path: '/plugin/store/', section: 'Plugins', description: 'Persistent key-value storage' },
    { title: 'Stronghold', path: '/plugin/stronghold/', section: 'Plugins', description: 'Encrypted database and secret management' },
    { title: 'Barcode Scanner', path: '/plugin/barcode-scanner/', section: 'Plugins', description: 'Scan barcodes and QR codes on mobile' },
    { title: 'Biometric', path: '/plugin/biometric/', section: 'Plugins', description: 'Authenticate using fingerprint or face recognition' },

    // Configuration
    { title: 'Configuration Overview', path: '/reference/config/', section: 'Configuration', description: 'tauri.conf.json reference and options' },
    { title: 'Permissions', path: '/security/permissions/', section: 'Configuration', description: 'Configure security permissions for your app' },
    { title: 'Content Security Policy', path: '/security/csp/', section: 'Configuration', description: 'Set CSP headers for your webview' },
    { title: 'Capabilities', path: '/security/capabilities/', section: 'Configuration', description: 'Define runtime capabilities and access controls' },

    // Distribution
    { title: 'Building', path: '/distribute/build/', section: 'Distribution', description: 'Build your app for production' },
    { title: 'Code Signing', path: '/distribute/sign/', section: 'Distribution', description: 'Sign your application for distribution' },
    { title: 'Windows Installer', path: '/distribute/windows/', section: 'Distribution', description: 'Create Windows installers (MSI/NSIS)' },
    { title: 'macOS Bundle', path: '/distribute/macos/', section: 'Distribution', description: 'Create macOS app bundles and DMGs' },
    { title: 'Linux Package', path: '/distribute/linux/', section: 'Distribution', description: 'Create Linux packages (AppImage/Deb)' },

    // Reference
    { title: 'JavaScript API', path: '/reference/javascript/', section: 'Reference', description: 'Complete JavaScript/TypeScript API reference' },
    { title: 'Rust API (tauri crate)', path: '/reference/rust/', section: 'Reference', description: 'Complete Rust crate documentation' },
    { title: 'CLI Reference', path: '/reference/cli/', section: 'Reference', description: 'Tauri CLI commands and options' },
  ];

  function handleMessage(event: MessageEvent) {
    if (event.source !== window.parent) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'asyar:view:search') {
      const query = data.payload?.query || '';
      searchQuery = query;
      filterDocs();
    }

    if (data.type === 'asyar:view:keydown') {
      const { key } = data.payload;
      if (key === 'ArrowDown') {
        selectedIndex = Math.min(selectedIndex + 1, filteredDocs.length - 1);
        ensureVisible();
      } else if (key === 'ArrowUp') {
        selectedIndex = Math.max(selectedIndex - 1, 0);
        ensureVisible();
      } else if (key === 'Enter') {
        // Re-affirm selection; the $effect on selectedDoc handles the fetch.
        // Calling selectItem ensures the $effect fires even if selectedIndex
        // did not change (e.g. user presses Enter without navigating first).
        selectItem(selectedIndex);
      }
    }
  }

  onMount(() => {
    window.addEventListener('message', handleMessage);
    allDocs = TAURI_DOCS;
    filteredDocs = allDocs;
    isLoading = false;
  });

  onDestroy(() => {
    // Unregister with the same bare ID used in registerAction
    actionServiceProp.unregisterAction('open-in-browser');
    window.removeEventListener('message', handleMessage);
  });

  // --- Filtering ---
  function filterDocs() {
    if (!searchQuery.trim()) {
      filteredDocs = allDocs;
      selectedIndex = 0;
      return;
    }
    const q = searchQuery.toLowerCase();
    filteredDocs = allDocs.filter(d =>
      d.title.toLowerCase().includes(q) ||
      d.description.toLowerCase().includes(q) ||
      d.section.toLowerCase().includes(q) ||
      d.path.toLowerCase().includes(q)
    );
    selectedIndex = 0;
  }

  function ensureVisible() {
    requestAnimationFrame(() => {
      const el = listContainer?.querySelector(`[data-index="${selectedIndex}"]`);
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      }
    });
  }

  function selectItem(index: number) {
    selectedIndex = index;
  }

  // --- Section Grouping ---
  interface GroupedSection {
    section: string;
    docs: DocEntry[];
  }

  function groupBySection(docs: DocEntry[]): GroupedSection[] {
    const map = new Map<string, DocEntry[]>();
    for (const d of docs) {
      if (!map.has(d.section)) map.set(d.section, []);
      map.get(d.section)!.push(d);
    }
    return Array.from(map.entries()).map(([section, docs]) => ({ section, docs }));
  }

  // Flat index for keyboard navigation
  function flatIndex(sectionIdx: number, itemIdx: number): number {
    const groups = groupBySection(filteredDocs);
    let idx = 0;
    for (let s = 0; s < sectionIdx; s++) {
      idx += groups[s].docs.length;
    }
    return idx + itemIdx;
  }

  // Get the selected doc entry
  let selectedDoc: DocEntry | null = $derived(filteredDocs[selectedIndex] ?? null);

  $effect(() => {
    if (selectedDoc) {
      fetchAndRenderDoc(`https://v2.tauri.app${selectedDoc.path}`);
    }
  });

  async function fetchAndRenderDoc(url: string) {
    docHtml = '';
    docError = false; // reset before each fetch so stale error state never bleeds through
    isLoadingDoc = true;
    try {
      const html = await fetchDocContent(url, network, logger);
      if (html) {
        docHtml = html;
      } else {
        docError = true;
      }
    } catch {
      docError = true;
    } finally {
      isLoadingDoc = false;
    }
  }

  function openInBrowser(path: string) {
    const url = `https://v2.tauri.app${path}`;
    // Route through the host's opener plugin — window.open() is not reliable in Tauri's WKWebView.
    // The host handles 'asyar:api:opener:open' by calling invoke('plugin:opener|open_url', { url }).
    window.parent.postMessage({
      type: 'asyar:api:opener:open',
      payload: { url },
      messageId: Math.random().toString(36).slice(2),
      extensionId: 'org.asyar.tauri-docs',
    }, '*');
  }

  // Register the "Open in Browser" action whenever selectedDoc changes.
  // The execute closure is stored locally in the iframe's ExtensionBridge registry.
  // The host forwards asyar:action:execute back to the iframe when triggered from ⌘K.
  // ID 'open-in-browser' is used bare (no extension prefix) — must match unregisterAction calls.
  $effect(() => {
    if (!selectedDoc) return;

    const currentDoc = selectedDoc; // capture for closure

    const action: ExtensionAction = {
      id: 'open-in-browser',
      title: 'Open in Browser',
      description: `Open ${currentDoc.title} in browser`,
      extensionId: 'org.asyar.tauri-docs',
      context: ActionContext.EXTENSION_VIEW,
      execute: () => openInBrowser(currentDoc.path)
    };

    // Register using the proxy directly — no ExtensionContext wrapper needed
    actionServiceProp.registerAction(action);

    // Cleanup: unregister using the same bare ID
    return () => {
      actionServiceProp.unregisterAction('open-in-browser');
    };
  });
</script>

<div class="container">
  {#if isLoading}
    <div class="loading">
      <div class="spinner"></div>
      <span>Loading documentation...</span>
    </div>
  {:else}
    <div class="split-view">
      <!-- Left: Doc List -->
      <div
        class="doc-list"
        bind:this={listContainer}
        tabindex="0"
        role="listbox"
      >
        {#if filteredDocs.length === 0}
          <div class="empty-state">
            <span class="empty-icon">🔍</span>
            <span>No results for "{searchQuery}"</span>
          </div>
        {:else}
          {#each groupBySection(filteredDocs) as group, sectionIdx}
            <div class="section-header">{group.section}</div>
            {#each group.docs as doc, itemIdx}
              {@const idx = flatIndex(sectionIdx, itemIdx)}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_interactive_supports_focus -->
              <div
                data-index={idx}
                class="doc-item"
                class:selected={selectedIndex === idx}
                role="option"
                aria-selected={selectedIndex === idx}
                onclick={() => selectItem(idx)}
              >
                <div class="doc-title">{doc.title}</div>
                <div class="doc-desc">{doc.description}</div>
              </div>
            {/each}
          {/each}
        {/if}
      </div>

      <!-- Right: Detail Panel -->
      <div class="detail-panel">
        {#if !selectedDoc}
          <div class="detail-empty">
            <span class="detail-empty-icon">📖</span>
            <span>Select a doc to view details</span>
          </div>
        {:else if isLoadingDoc}
          <div class="detail-loading-view">
            <div class="loading-header">
              <h2>{selectedDoc.title}</h2>
              <span class="loading-subtitle">{selectedDoc.path}</span>
            </div>
            <div class="loading-progress">
              <div class="loading-bar"></div>
            </div>
            <div class="loading-skeleton">
              <div class="skeleton-line" style="width: 90%"></div>
              <div class="skeleton-line" style="width: 75%"></div>
              <div class="skeleton-line" style="width: 60%"></div>
              <div class="skeleton-line short" style="width: 40%"></div>
              <div class="skeleton-block"></div>
              <div class="skeleton-line" style="width: 85%"></div>
              <div class="skeleton-line" style="width: 70%"></div>
            </div>
          </div>
        {:else if docError}
          <div class="detail-error">
            <h2>{selectedDoc.title}</h2>
            <p>Failed to load content.</p>
            <button class="detail-link" onclick={() => openInBrowser(selectedDoc!.path)}>
              Open in Browser ↗
            </button>
          </div>
        {:else}
          <div class="doc-header">
            <h2>{selectedDoc.title}</h2>
            <div class="meta">
              <span class="doc-path">{selectedDoc.path}</span>
              <button class="detail-link" onclick={() => openInBrowser(selectedDoc!.path)}>
                Open in Browser ↗
              </button>
            </div>
          </div>
          <div class="detail-content prose">{@html docHtml}</div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: var(--text-primary, #1a1a1a);
    background: var(--bg-primary, #ffffff);
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    height: 100%;
    color: var(--text-secondary, #888);
    font-size: 14px;
  }

  .spinner {
    width: 18px;
    height: 18px;
    border: 2px solid var(--border-color, #e0e0e0);
    border-top-color: var(--accent, #007aff);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .split-view {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* --- Left List --- */
  .doc-list {
    width: 280px;
    min-width: 220px;
    overflow-y: auto;
    border-right: 1px solid var(--border-color, #eee);
    padding: 4px 0;
    background: var(--bg-primary, #fff);
    outline: none; /* remove focus outline */
  }

  .section-header {
    padding: 10px 14px 4px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-tertiary, #999);
  }

  .doc-item {
    padding: 8px 14px;
    margin: 1px 6px;
    border-radius: 6px;
    cursor: default;
    transition: background 0.1s;
  }

  .doc-item:hover {
    background: var(--hover-bg, #f5f5f5);
  }

  .doc-item.selected {
    background: #007aff;
    color: white;
  }

  .doc-title {
    font-size: 13px;
    font-weight: 500;
    line-height: 1.3;
  }

  .doc-desc {
    font-size: 11px;
    line-height: 1.3;
    margin-top: 2px;
    opacity: 0.7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .doc-item.selected .doc-desc {
    opacity: 0.85;
  }

  /* --- Right Detail Panel --- */
  .detail-panel {
    flex: 1;
    overflow-y: auto;
    background: var(--bg-secondary, #fafafa);
    display: flex;
    flex-direction: column;
  }

  .doc-header {
    background: var(--bg-primary, #ffffff);
    padding: 24px 32px 16px;
    border-bottom: 1px solid var(--border, #e5e5e5);
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .doc-header h2 {
    margin: 0 0 8px 0;
    font-size: 20px;
    font-weight: 600;
  }

  .doc-header .meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .doc-path {
    font-size: 13px;
    color: #666;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    background: var(--bg-tertiary, #f0f0f0);
    padding: 4px 8px;
    border-radius: 4px;
  }

  .detail-content {
    padding: 28px 32px;
  }

  .detail-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    font-weight: 500;
    color: #007aff;
    text-decoration: none;
    padding: 8px 16px;
    border: 1px solid #007aff;
    border-radius: 6px;
    transition: all 0.15s;
    background: transparent;
    cursor: pointer;
  }

  .detail-link:hover {
    background: #007aff;
    color: white;
  }

  .detail-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 12px;
    color: var(--text-tertiary, #aaa);
    font-size: 14px;
  }

  .detail-loading-view {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .loading-header {
    padding: 24px 32px 16px;
    border-bottom: 1px solid var(--border, #e5e5e5);
  }

  .loading-header h2 {
    margin: 0 0 6px 0;
    font-size: 20px;
    font-weight: 600;
  }

  .loading-subtitle {
    font-size: 13px;
    color: #999;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }

  .loading-progress {
    height: 2px;
    background: var(--border-color, #e0e0e0);
    overflow: hidden;
  }

  .loading-bar {
    height: 100%;
    width: 40%;
    background: #007aff;
    border-radius: 2px;
    animation: loading-slide 1.2s ease-in-out infinite;
  }

  @keyframes loading-slide {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(350%); }
  }

  .loading-skeleton {
    padding: 28px 32px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .skeleton-line {
    height: 14px;
    border-radius: 4px;
    background: var(--border-color, #e8e8e8);
    animation: skeleton-pulse 1.5s ease-in-out infinite;
  }

  .skeleton-line.short {
    margin-bottom: 8px;
  }

  .skeleton-block {
    height: 80px;
    border-radius: 6px;
    background: var(--border-color, #e8e8e8);
    animation: skeleton-pulse 1.5s ease-in-out infinite;
    animation-delay: 0.3s;
  }

  @keyframes skeleton-pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.8; }
  }

  .detail-empty-icon {
    font-size: 36px;
    opacity: 0.4;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 8px;
    color: var(--text-tertiary, #999);
    font-size: 13px;
    padding: 40px 20px;
  }

  .empty-icon {
    font-size: 28px;
    opacity: 0.5;
  }

  /* Scrollbar */
  .doc-list::-webkit-scrollbar,
  .detail-panel::-webkit-scrollbar {
    width: 6px;
  }
  .doc-list::-webkit-scrollbar-track,
  .detail-panel::-webkit-scrollbar-track {
    background: transparent;
  }
  .doc-list::-webkit-scrollbar-thumb,
  .detail-panel::-webkit-scrollbar-thumb {
    background: rgba(150, 150, 150, 0.3);
    border-radius: 10px;
  }

  /* Dark mode */
  @media (prefers-color-scheme: dark) {
    .container {
      color: #e0e0e0;
      background: #1e1e1e;
    }
    .doc-list {
      background: #1e1e1e;
      border-right-color: #333;
    }
    .doc-item:hover {
      background: #2a2a2a;
    }
    .detail-panel {
      background: #161616;
    }
    .loading-header {
      border-bottom-color: #333;
    }
    .loading-progress {
      background: #333;
    }
    .skeleton-line, .skeleton-block {
      background: #2a2a2a;
    }
  }

  /* Prose Styles */
  :global(.prose) {
    max-width: 100%;
    overflow-x: hidden;
  }
  :global(.prose h1), :global(.prose h2), :global(.prose h3), :global(.prose h4), :global(.prose h5), :global(.prose h6) {
    color: var(--text-primary);
    margin-top: 1.5em;
    margin-bottom: 0.5em;
    line-height: 1.2;
    font-weight: 600;
  }
  :global(.prose p) {
    margin-top: 0;
    margin-bottom: 1em;
    line-height: 1.6;
    color: var(--text-secondary);
  }
  :global(.prose pre) {
    background-color: var(--code-bg, #1a1a1a);
    color: #e0e0e0;
    padding: 1em;
    border-radius: 6px;
    overflow-x: auto;
    margin-bottom: 1em;
  }
  :global(.prose code) {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 0.875em;
  }
  @media (prefers-color-scheme: dark) {
    :global(.prose pre) {
      background-color: #0d0d0d;
    }
  }
  :global(.prose ul), :global(.prose ol) {
    padding-left: 1.5em;
    margin-bottom: 1em;
    color: var(--text-secondary);
  }
  :global(.prose li) {
    margin-bottom: 0.25em;
  }
  :global(.prose blockquote) {
    border-left: 4px solid var(--border-color);
    padding-left: 1em;
    color: var(--text-tertiary);
    font-style: italic;
    margin-left: 0;
    margin-right: 0;
  }
  :global(.prose a) {
    color: #007aff;
    text-decoration: underline;
  }
  :global(.prose table) {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 1em;
  }
  :global(.prose th), :global(.prose td) {
    border: 1px solid var(--border-color);
    padding: 0.5em;
    text-align: left;
  }
</style>
