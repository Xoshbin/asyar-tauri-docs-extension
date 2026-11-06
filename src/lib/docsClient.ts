import type { INetworkService } from 'asyar-sdk/view';

const contentCache = new Map<string, { html: string; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Every doc page is fetched from this origin, and relative `href`/`src`
 * attributes resolve against it.
 */
const BASE_URL = 'https://v2.tauri.app';

/** Largest image body we turn into a `data:` URL. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Images fetched in parallel per page. */
const IMAGE_CONCURRENCY = 4;

const MAX_CACHED_IMAGES = 120;

const imageCache = new Map<string, { dataUrl: string; timestamp: number }>();

interface Logger {
  warn?: (message: string) => void;
}

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

  // Fix relative URLs so links work when rendered inside the extension
  main.querySelectorAll('a[href]').forEach(a => {
    const absolute = resolveUrl(a.getAttribute('href'));
    if (absolute) {
      a.setAttribute('href', absolute);
    }
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });

  // The extension view's CSP only allows bundled files and `data:` images, so
  // a remote `src` can never load. Park the absolute URL on the element and
  // let `resolveDocImages` fetch it through the `network` permission once the
  // HTML is mounted. Removing `src` keeps the webview from attempting — and
  // logging — a blocked request.
  main.querySelectorAll('img').forEach(img => {
    const absolute = resolveUrl(img.getAttribute('src'));
    img.removeAttribute('src');
    img.removeAttribute('srcset');
    if (!absolute) {
      img.remove();
      return;
    }
    img.setAttribute('data-doc-image', absolute);
    if (img.getAttribute('alt') === null) {
      img.setAttribute('alt', '');
    }
  });

  return main.innerHTML;
}

function resolveUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw, BASE_URL);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Loads every parked image into a `data:` URL and writes it back onto the
 * element. Any that cannot be fetched become a click-to-open chip, so a doc
 * page never shows a broken image.
 */
export async function resolveDocImages(
  root: HTMLElement,
  network: INetworkService,
  openExternally: (url: string) => void,
  logger?: Logger
): Promise<void> {
  const queue = Array.from(root.querySelectorAll<HTMLImageElement>('img[data-doc-image]'));
  if (queue.length === 0) return;

  const worker = async () => {
    for (let img = queue.shift(); img; img = queue.shift()) {
      const url = img.dataset.docImage;
      if (!url) continue;
      const dataUrl = await fetchImage(url, network, logger);
      if (dataUrl) {
        img.src = dataUrl;
        img.removeAttribute('data-doc-image');
      } else {
        replaceWithChip(img, url, openExternally);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(IMAGE_CONCURRENCY, queue.length) }, () => worker())
  );
}

async function fetchImage(
  url: string,
  network: INetworkService,
  logger?: Logger
): Promise<string | null> {
  const cached = imageCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.dataUrl;
  }

  try {
    const response = await network.fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'image/*' },
      timeout: 20000,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    // The host returns binary bodies base64-encoded, which is exactly what a
    // `data:` URL needs.
    if (response.body.length > MAX_IMAGE_BYTES) {
      throw new Error('image is too large');
    }
    const mime = imageMime(response.headers);
    if (!mime) {
      throw new Error('response is not an image');
    }

    const dataUrl = `data:${mime};base64,${response.body}`;
    if (imageCache.size >= MAX_CACHED_IMAGES) imageCache.clear();
    imageCache.set(url, { dataUrl, timestamp: Date.now() });
    return dataUrl;
  } catch (err: any) {
    logger?.warn?.(`Doc image ${url} could not be loaded: ${err?.message || err}`);
    return null;
  }
}

function imageMime(headers: Record<string, string> | undefined): string | null {
  const entry = Object.entries(headers ?? {}).find(
    ([key]) => key.toLowerCase() === 'content-type'
  );
  const mime = entry?.[1]?.split(';')[0].trim().toLowerCase() ?? '';
  return mime.startsWith('image/') ? mime : null;
}

function replaceWithChip(
  img: HTMLImageElement,
  url: string,
  openExternally: (url: string) => void
): void {
  const fileName = url.split(/[?#]/)[0].split('/').pop() ?? '';
  const label = img.getAttribute('alt')?.trim() || fileName || 'Image';

  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'doc-image-chip';
  chip.textContent = `🖼 ${label} — open in browser`;
  chip.title = url;
  chip.addEventListener('click', () => openExternally(url));
  img.replaceWith(chip);
}
