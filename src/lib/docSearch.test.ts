import { describe, it, expect, vi } from 'vitest';
import { toRankableItem, rankDocs } from './docSearch';
import type { DocEntry } from '../data/tauriDocs';

function doc(overrides: Partial<DocEntry> = {}): DocEntry {
  return {
    title: 'Quick Start',
    path: '/start/create-project/',
    section: 'Getting Started',
    description: 'Create a new Tauri project from scratch',
    ...overrides,
  };
}

describe('toRankableItem', () => {
  it('maps path to id, title to title, description to subtitle, and section into keywords', () => {
    const d = doc();
    const item = toRankableItem(d);
    expect(item).toEqual({
      id: '/start/create-project/',
      title: 'Quick Start',
      subtitle: 'Create a new Tauri project from scratch',
      keywords: ['Getting Started', '/start/create-project/'],
    });
  });
});

describe('rankDocs', () => {
  const docs: DocEntry[] = [
    doc({ title: 'Quick Start', path: '/a/' }),
    doc({ title: 'Commands', path: '/b/', section: 'Core Concepts' }),
    doc({ title: 'Plugins Overview', path: '/c/', section: 'Plugins' }),
  ];

  it('returns all docs unchanged for an empty/whitespace query without calling rank', async () => {
    const rank = vi.fn();
    const result = await rankDocs(rank, '   ', docs);
    expect(result).toEqual(docs);
    expect(rank).not.toHaveBeenCalled();
  });

  it('calls rank with mapped RankableItems and maps returned ids back to docs in ranked order', async () => {
    const rank = vi.fn().mockResolvedValue(['/b/', '/a/']);
    const result = await rankDocs(rank, 'comm', docs);

    expect(rank).toHaveBeenCalledWith('comm', [
      toRankableItem(docs[0]),
      toRankableItem(docs[1]),
      toRankableItem(docs[2]),
    ]);
    expect(result).toEqual([docs[1], docs[0]]);
  });

  it('drops ids that no longer resolve to a known doc rather than throwing', async () => {
    const rank = vi.fn().mockResolvedValue(['/ghost/', '/a/']);
    const result = await rankDocs(rank, 'x', docs);
    expect(result).toEqual([docs[0]]);
  });

  it('returns an empty array when rank resolves with no matches', async () => {
    const rank = vi.fn().mockResolvedValue([]);
    const result = await rankDocs(rank, 'zzz', docs);
    expect(result).toEqual([]);
  });
});
