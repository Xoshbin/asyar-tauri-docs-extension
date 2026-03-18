<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  // --- State ---
  let searchQuery = $state('');
  let allDocs: DocEntry[] = $state([]);
  let filteredDocs: DocEntry[] = $state([]);
  let selectedIndex = $state(0);
  let isLoading = $state(true);
  let listContainer: HTMLDivElement;

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

  // --- Lifecycle ---
  function handleMessage(event: MessageEvent) {
    if (event.source !== window.parent) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'asyar:view:search') {
      const query = data.payload?.query || '';
      searchQuery = query;
      filterDocs();
    }
  }

  onMount(() => {
    window.addEventListener('message', handleMessage);
    allDocs = TAURI_DOCS;
    filteredDocs = allDocs;
    isLoading = false;
  });

  onDestroy(() => {
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

  // --- Keyboard Navigation ---
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (selectedIndex < filteredDocs.length - 1) {
        selectedIndex++;
        ensureVisible();
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (selectedIndex > 0) {
        selectedIndex--;
        ensureVisible();
      }
    }
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
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="container">
  {#if isLoading}
    <div class="loading">
      <div class="spinner"></div>
      <span>Loading documentation...</span>
    </div>
  {:else}
    <div class="split-view">
      <!-- Left: Doc List -->
      <div class="doc-list" bind:this={listContainer}>
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
        {#if selectedDoc}
          <div class="detail-content">
            <div class="detail-section-badge">{selectedDoc.section}</div>
            <h2 class="detail-title">{selectedDoc.title}</h2>
            <p class="detail-description">{selectedDoc.description}</p>
            <div class="detail-path">
              <span class="path-label">Path:</span>
              <code>{selectedDoc.path}</code>
            </div>
            <a
              href="https://v2.tauri.app{selectedDoc.path}"
              target="_blank"
              rel="noopener noreferrer"
              class="detail-link"
            >
              Open in Browser ↗
            </a>
          </div>
        {:else}
          <div class="detail-empty">
            <span class="detail-empty-icon">📖</span>
            <span>Select a doc to view details</span>
          </div>
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
  }

  .detail-content {
    padding: 28px 32px;
  }

  .detail-section-badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    background: var(--badge-bg, #e8e8e8);
    color: var(--text-secondary, #666);
    padding: 3px 10px;
    border-radius: 4px;
    margin-bottom: 12px;
  }

  .detail-title {
    font-size: 22px;
    font-weight: 700;
    margin: 0 0 8px;
    color: var(--text-primary, #1a1a1a);
  }

  .detail-description {
    font-size: 14px;
    line-height: 1.6;
    color: var(--text-secondary, #555);
    margin: 0 0 20px;
  }

  .detail-path {
    font-size: 12px;
    color: var(--text-tertiary, #888);
    margin-bottom: 20px;
  }

  .path-label {
    font-weight: 600;
    margin-right: 6px;
  }

  .detail-path code {
    background: var(--code-bg, #f0f0f0);
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 12px;
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
    .detail-section-badge {
      background: #333;
      color: #aaa;
    }
    .detail-title {
      color: #f0f0f0;
    }
    .detail-path code {
      background: #2a2a2a;
    }
  }
</style>
