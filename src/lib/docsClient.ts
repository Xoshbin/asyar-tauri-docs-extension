import type { INetworkService } from 'asyar-api';

const contentCache = new Map<string, { html: string; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function fetchDocContent(
  url: string,
  network: INetworkService,
  logger?: any
): Promise<string | null> {
  const cached = contentCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.html;
  }

  try {
    const response = await network.fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'text/html'
      },
      timeout: 20000,
    });

    if (!response.ok) {
      logger?.error(`fetchDocContent returned !ok: ${response.status} ${response.statusText} for ${url}`);
      return null;
    }

    const cleaned = parseDocHtml(response.body);
    if (!cleaned) {
      // Do not cache failures — let the next selection retry the fetch
      logger?.warn(`parseDocHtml returned empty for ${url} (body length: ${response.body.length})`);
      return null;
    }
    contentCache.set(url, { html: cleaned, timestamp: Date.now() });
    return cleaned;
  } catch (err: any) {
    logger?.error(`fetchDocContent threw an error for ${url}: ${err?.message || err}`);
    return null;
  }
}

function parseDocHtml(rawHtml: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, 'text/html');

  // Select main content area BEFORE removing anything, so aggressive cleanup
  // cannot destroy the element we are trying to find.
  const selectors = [
    'article.sl-content-body',   // Starlight v2 article wrapper
    'main .content',
    '[data-pagefind-body]',      // Pagefind-indexed body (Starlight marks this)
    'main',
    '.content',
  ];

  let main: Element | null = null;
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el && el.innerHTML.length > 100) {
      main = el;
      break; // stop at first match — do not continue overwriting
    }
  }

  if (!main) main = doc.body;

  // Remove noise elements from WITHIN the selected content only,
  // so we never accidentally remove the content container itself.
  main.querySelectorAll('nav, header, footer, aside, script, style, [data-pagefind-ignore]')
    .forEach(el => el.remove());

  // Fix relative URLs so links and images work when rendered inside the extension
  main.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href');
    if (href?.startsWith('/')) {
      a.setAttribute('href', `https://v2.tauri.app${href}`);
    }
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });

  main.querySelectorAll('img[src]').forEach(img => {
    const src = img.getAttribute('src');
    if (src?.startsWith('/')) {
      img.setAttribute('src', `https://v2.tauri.app${src}`);
    }
  });

  return main.innerHTML;
}
