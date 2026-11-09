import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cleanUrl, parseSources, plainMarkdown, type SourceGroup } from './parse';
import data from './sources.json';

const DOCS = join(__dirname, '../../../../docs/research');

function parseAll(): SourceGroup[] {
  return readdirSync(DOCS)
    .filter((f) => /^\d\d-.*\.md$/.test(f))
    .sort()
    .map((f) => parseSources(f, readFileSync(join(DOCS, f), 'utf8')));
}

describe('sources.json', () => {
  it('is an exact copy of the Sources sections of docs/research (regenerate with NOTEBOOK_WRITE_SOURCES=1)', () => {
    const fresh = parseAll();
    if (process.env.NOTEBOOK_WRITE_SOURCES === '1') {
      writeFileSync(join(__dirname, 'sources.json'), JSON.stringify(fresh, null, 1) + '\n');
    }
    expect(data).toEqual(fresh);
  });

  it('every note has entries, ids are unique and every entry carries a URL or a local reference', () => {
    const groups = parseAll();
    expect(groups.length).toBeGreaterThanOrEqual(8);
    const ids = new Set<string>();
    for (const g of groups) {
      expect(g.entries.length).toBeGreaterThan(0);
      for (const e of g.entries) {
        expect(ids.has(e.id)).toBe(false);
        ids.add(e.id);
        expect(e.urls.length > 0 || /docs\/research|Computed|This research/.test(e.text)).toBe(true);
      }
    }
  });
});

describe('parse helpers', () => {
  it('cleans prose punctuation off URLs but keeps balanced parentheses', () => {
    expect(cleanUrl('https://a.b/c.')).toBe('https://a.b/c');
    expect(cleanUrl('https://en.wikipedia.org/wiki/Ken_Blackburn_(aeronautical_engineer)')).toBe(
      'https://en.wikipedia.org/wiki/Ken_Blackburn_(aeronautical_engineer)',
    );
    expect(cleanUrl('https://a.b/c);')).toBe('https://a.b/c');
  });
  it('drops Markdown marks', () => {
    expect(plainMarkdown('**opened in full** and `code` and *The Book*')).toBe('opened in full and code and The Book');
  });
});
