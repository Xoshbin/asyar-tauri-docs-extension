<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    ActionContext,
    SearchEngine,
    type ExtensionAction,
    type ExtensionContext,
    type INetworkService,
    type IActionService,
    type IFeedbackService,
  } from 'asyar-sdk';
  import { fetchDocContent } from './lib/docsClient';
  import { TAURI_DOCS, type DocEntry } from './data/tauriDocs';

  // --- Props ---
  // `context` is the single ExtensionContext created in main.ts. We pass
  // it explicitly so components can read `context.preferences` and
  // subscribe to `context.onPreferencesChanged` without constructing a
  // second context (which would double up focus listeners and break the
  // service proxy extensionId injection).
  //
  // All other services are pre-resolved in main.ts via context.getService
  // and passed as props. Children never call getService themselves.
  interface Props {
    context: ExtensionContext;
    network: INetworkService;
    actionService: IActionService;
    feedbackService: IFeedbackService;
  }
  let { context, network, actionService: actionServiceProp, feedbackService }: Props = $props();

  // --- Preferences (live via onPreferencesChanged) ---
  //
  // `context.preferences` is a frozen snapshot on a plain prop, so it
  // isn't reactive on its own. We drive a local `$state` counter
  // (`prefsVersion`) from the change callback, then use `$derived.by(...)`
  // so Svelte tracks `prefsVersion` as a dep and re-reads
  // `context.preferences.X` on every bump.
  let prefsVersion = $state(0);

  let maxResults = $derived.by<number>(() => {
    prefsVersion; // eslint-disable-line @typescript-eslint/no-unused-expressions
    const v = context.preferences.values.maxResults;
    return typeof v === 'number' ? v : 5;
  });
  let openInBrowserByDefault = $derived.by<boolean>(() => {
    prefsVersion; // eslint-disable-line @typescript-eslint/no-unused-expressions
    return Boolean(context.preferences.values.openInBrowser);
  });

  const unsubscribePrefs = context.onPreferencesChanged(() => {
    // Bump the version — the two $derived blocks above will re-read
    // context.preferences and propagate the new values to the view.
    prefsVersion += 1;
  });

  // Re-run the search (with the new maxResults clamp) whenever the
  // version bumps. This is separate from the $derived values because it
  // mutates `filteredDocs` rather than just reading.
  $effect(() => {
    // Touch prefsVersion so Svelte tracks it as a dep.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    prefsVersion;
    filterDocs();
  });

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
        // When the user prefers external-browser mode, Enter opens the
        // selected doc in the system browser via the opener plugin. In
        // inline-preview mode, Enter re-affirms the selection so the
        // $effect on selectedDoc fires even if selectedIndex didn't change
        // (e.g. user presses Enter without navigating first).
        const doc = filteredDocs[selectedIndex];
        if (openInBrowserByDefault && doc) {
          openInBrowser(doc.path);
        } else {
          selectItem(selectedIndex);
        }
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
    actionServiceProp.unregisterAction('org.asyar.tauri-docs:open-in-browser');
    window.removeEventListener('message', handleMessage);
    unsubscribePrefs();
  });

  // --- Search ---
  const searchEngine = new SearchEngine<DocEntry>({
    getText: (d) => `${d.title} ${d.description} ${d.section} ${d.path}`,
  });

  function filterDocs() {
    searchEngine.setItems(allDocs);
    const q = searchQuery.trim();
    // Clamp to the `maxResults` preference. For empty queries we still
    // show everything so the user can browse sections.
    const hits = q ? searchEngine.search(q) : allDocs;
    const clamp = Math.max(1, Math.min(20, maxResults));
    filteredDocs = q ? hits.slice(0, clamp) : hits;
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
    if (!selectedDoc) return;
    // When the user has preferred external-browser mode in Settings,
    // selecting a result skips the in-view fetch entirely and hands the
    // URL to the host's opener plugin. In-view preview stays blank.
    if (openInBrowserByDefault) {
      docHtml = null;
      docError = false;
      return;
    }
    fetchAndRenderDoc(`https://v2.tauri.app${selectedDoc.path}`);
  });

  async function fetchAndRenderDoc(url: string) {
    docHtml = '';
    docError = false; // reset before each fetch so stale error state never bleeds through
    isLoadingDoc = true;
    try {
      // `logger` is an optional 3rd arg on fetchDocContent — we skip it
      // here, failures are reflected in the UI via `docError` anyway.
      const html = await fetchDocContent(url, network);
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

  async function openInBrowser(path: string) {
    const url = `https://v2.tauri.app${path}`;
    // Route through the host's opener plugin — window.open() is not reliable in Tauri's WKWebView.
    // The host handles 'asyar:api:opener:open' by calling invoke('plugin:opener|open_url', { url }).
    window.parent.postMessage({
      type: 'asyar:api:opener:open',
      payload: { url },
      messageId: Math.random().toString(36).slice(2),
      extensionId: 'org.asyar.tauri-docs',
    }, '*');

    // Show a HUD pill confirming the action and close the launcher in one
    // shot — exactly the use case the HUD primitive was built for.
    const title = selectedDoc?.title ?? 'doc';
    await feedbackService.showHUD(`📖 Opened ${title} in browser`);
  }

  // Register the "Open in Browser" action whenever selectedDoc changes.
  // The execute closure is stored locally in the iframe's ExtensionBridge registry.
  // The host forwards asyar:action:execute back to the iframe when triggered from ⌘K.
  // ID 'org.asyar.tauri-docs:open-in-browser' is used bare (no extension prefix) — must match unregisterAction calls.
  $effect(() => {
    if (!selectedDoc) return;

    const currentDoc = selectedDoc; // capture for closure

    const action: ExtensionAction = {
      id: 'org.asyar.tauri-docs:open-in-browser',
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
      actionServiceProp.unregisterAction('org.asyar.tauri-docs:open-in-browser');
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
    font-family: var(--font-ui);
    color: var(--text-primary);
    background: var(--bg-primary);
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-5);
    height: 100%;
    color: var(--text-secondary);
    font-size: var(--font-size-base);
  }

  .spinner {
    width: 18px;
    height: 18px;
    border: 2px solid var(--border-color);
    border-top-color: var(--accent-primary);
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
    border-right: 1px solid var(--border-color);
    padding: 4px 0;
    background: var(--bg-primary);
    outline: none; /* remove focus outline */
  }

  .section-header {
    padding: var(--space-4) var(--space-5) var(--space-2);
    font-size: var(--font-size-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-tertiary);
  }

  .doc-item {
    padding: var(--space-3) var(--space-5);
    margin: 1px 6px;
    border-radius: var(--radius-sm);
    cursor: default;
    transition: background var(--transition-fast);
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
    font-size: var(--font-size-xs);
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
    background: var(--bg-primary);
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
    font-family: var(--font-mono);
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
    border-radius: var(--radius-sm);
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
    font-size: var(--font-size-base);
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
    font-family: var(--font-mono);
  }

  .loading-progress {
    height: 2px;
    background: var(--border-color);
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
    border-radius: var(--radius-sm);
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
    color: var(--text-tertiary);
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
    border-radius: var(--radius-sm);
    overflow-x: auto;
    margin-bottom: 1em;
  }
  :global(.prose code) {
    font-family: var(--font-mono);
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
