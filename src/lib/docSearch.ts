import type { RankableItem } from 'asyar-sdk/contracts';
import type { DocEntry } from '../data/tauriDocs';

/**
 * `path` is the doc's stable unique key — used as the RankableItem id so
 * a ranked-id list from the host can be mapped straight back to a doc.
 */
export function toRankableItem(doc: DocEntry): RankableItem {
  return {
    id: doc.path,
    title: doc.title,
    subtitle: doc.description,
    keywords: [doc.section, doc.path],
  };
}

/**
 * Ranks `docs` against `query` via the host's tiered fuzzy ranker
 * (`ISearchService.rank`), replacing the deleted client-side `SearchEngine`.
 * Empty/whitespace queries short-circuit locally — same contract `rank`
 * itself guarantees, but skipping the IPC round trip for the common
 * no-query case (initial mount, section-filter-only changes).
 */
export async function rankDocs(
  rank: (query: string, items: RankableItem[]) => Promise<string[]>,
  query: string,
  docs: DocEntry[],
): Promise<DocEntry[]> {
  if (!query.trim()) {
    return [...docs];
  }
  const byPath = new Map(docs.map((d) => [d.path, d]));
  const items = docs.map(toRankableItem);
  const ids = await rank(query, items);
  const ranked: DocEntry[] = [];
  for (const id of ids) {
    const d = byPath.get(id);
    if (d) ranked.push(d);
  }
  return ranked;
}
