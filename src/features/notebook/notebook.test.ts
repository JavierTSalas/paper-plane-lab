import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIAGRAM_IDS } from './diagrams';
import { TOPIC_IDS, isTopicId, notebookLink, notebookTopicParam, parseTopicParam } from './ids';
import { isKind, plainText, tokensOf } from './markup';
import { getSource } from './sources';
import { TOPICS } from './topics';
import { RECORDS } from './topics/records';
import type { Block, Topic } from './topics/types';

const REFERENCE = new Set(['glossary', 'sources']);

function words(s: string): number {
  return plainText(s).split(/\s+/).filter(Boolean).length;
}

function bodyWords(t: Topic): number {
  let n = 0;
  for (const s of t.sections)
    for (const b of s.blocks) {
      if (b.kind === 'p' || b.kind === 'callout') n += words(b.text);
      else if (b.kind === 'list') n += b.items.reduce((a, i) => a + words(i), 0);
      else if (b.kind === 'terms') n += b.items.reduce((a, i) => a + words(i.term) + words(i.def), 0);
    }
  return n;
}

function inlineStrings(b: Block): string[] {
  switch (b.kind) {
    case 'p':
      return [b.text];
    case 'list':
      return b.items;
    case 'formula':
      return [b.where ?? '', b.info?.text ?? ''];
    case 'diagram':
      return [b.caption];
    case 'callout':
      return [b.text];
    case 'terms':
      return b.items.map((i) => i.def);
    case 'widget':
      return [];
  }
}

describe('notebook topics', () => {
  it('lists every topic id once, in order', () => {
    expect(TOPICS.map((t) => t.id)).toEqual([...TOPIC_IDS]);
  });

  for (const topic of TOPICS) {
    describe(topic.id, () => {
      it('has a title, a summary, sections and a How sure are we? note', () => {
        expect(topic.title.length).toBeGreaterThan(2);
        expect(topic.summary.length).toBeGreaterThan(20);
        expect(topic.sections.length).toBeGreaterThan(0);
        expect(topic.sure.solid.length + topic.sure.calibrated.length + topic.sure.unverified.length).toBeGreaterThan(0);
        expect(topic.sure.unverified.length).toBeGreaterThan(0);
        const ids = topic.sections.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const s of topic.sections) expect(s.id).toMatch(/^[a-z0-9-]+$/);
      });

      if (!REFERENCE.has(topic.id)) {
        it('is 250-500 words with at least one diagram, one formula and cited sources', () => {
          const n = bodyWords(topic);
          expect(n, `${topic.id} has ${n} words`).toBeGreaterThanOrEqual(250);
          expect(n, `${topic.id} has ${n} words`).toBeLessThanOrEqual(500);
          const blocks = topic.sections.flatMap((s) => s.blocks);
          expect(blocks.some((b) => b.kind === 'diagram')).toBe(true);
          expect(blocks.some((b) => b.kind === 'formula')).toBe(true);
          expect(topic.sources.length).toBeGreaterThan(2);
          expect(topic.sure.solid.length).toBeGreaterThan(0);
          expect(topic.sure.calibrated.length).toBeGreaterThan(0);
        });
      }

      it('every source id resolves and every diagram, link and quantity token is valid', () => {
        for (const id of topic.sources) expect(getSource(id), id).toBeDefined();
        expect(new Set(topic.sources).size).toBe(topic.sources.length);
        for (const s of topic.sections)
          for (const b of s.blocks) {
            if (b.kind === 'diagram') expect(DIAGRAM_IDS).toContain(b.id);
            for (const text of [...inlineStrings(b), ...topic.sure.solid, ...topic.sure.calibrated, ...topic.sure.unverified]) {
              for (const tok of tokensOf(text)) {
                if (tok.kind === 'link') {
                  const parsed = parseTopicParam(tok.body.split('|')[0]);
                  expect(parsed, tok.body).not.toBeNull();
                  if (parsed?.anchor) {
                    const target = TOPICS.find((t) => t.id === parsed.topic);
                    expect(target?.sections.map((x) => x.id), tok.body).toContain(parsed.anchor);
                  }
                } else if (tok.kind === 'brace') {
                  const head = tok.body.slice(0, tok.body.indexOf(':'));
                  expect(head === 'info' || isKind(head), tok.body).toBe(true);
                  if (head !== 'info') expect(Number.isFinite(Number(tok.body.split(':')[1].split('|')[0])), tok.body).toBe(true);
                }
              }
            }
          }
      });
    });
  }

  it('records cite resolvable sources and mark post-2022 claims as reported', () => {
    for (const r of RECORDS) {
      for (const id of r.sources) expect(getSource(id), id).toBeDefined();
      const year = Number(/\d{4}/.exec(r.when)?.[0]);
      if (year > 2022) expect(r.status).toBe('reported');
    }
  });

  it('uses every diagram at least once', () => {
    const used = new Set(TOPICS.flatMap((t) => t.sections.flatMap((s) => s.blocks.flatMap((b) => (b.kind === 'diagram' ? [b.id] : [])))));
    for (const id of DIAGRAM_IDS) expect(used.has(id), id).toBe(true);
  });
});

describe('notebook links', () => {
  it('builds and parses deep links', () => {
    expect(notebookLink()).toBe('#/notebook');
    expect(notebookLink('wind')).toBe('#/notebook/wind');
    expect(notebookLink('wind', 'gusts')).toBe('#/notebook/wind~gusts');
    expect(notebookTopicParam('paper', 'flex')).toBe('paper~flex');
    expect(parseTopicParam('wind~gusts')).toEqual({ topic: 'wind', anchor: 'gusts' });
    expect(parseTopicParam(encodeURIComponent('wind~gusts'))).toEqual({ topic: 'wind', anchor: 'gusts' });
    expect(parseTopicParam('wind')).toEqual({ topic: 'wind' });
    expect(parseTopicParam('nope')).toBeNull();
    expect(parseTopicParam(undefined)).toBeNull();
    expect(isTopicId('records')).toBe(true);
  });
});

describe('links into the notebook from other screens', () => {
  /** Every `topic="..."` of an info popover and every literal `#/notebook/...` href in the UI sources. */
  function linksIn(dir: string, found: { file: string; param: string }[] = []): { file: string; param: string }[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) linksIn(file, found);
      else if (/\.tsx$/.test(entry.name)) {
        const text = readFileSync(file, 'utf8');
        for (const m of text.matchAll(/\btopic="([^"]+)"/g)) found.push({ file, param: m[1]! });
        for (const m of text.matchAll(/#\/notebook\/([a-z0-9~-]+)/g)) found.push({ file, param: m[1]! });
      }
    }
    return found;
  }

  it('point at topics and sections that exist', () => {
    const links = linksIn('src');
    expect(links.length).toBeGreaterThan(20);
    for (const { file, param } of links) {
      const parsed = parseTopicParam(param);
      expect(parsed, `${file}: unknown notebook topic "${param}"`).not.toBeNull();
      if (!parsed?.anchor) continue;
      const topic = TOPICS.find((t) => t.id === parsed.topic);
      expect(topic?.sections.some((sec) => sec.id === parsed.anchor), `${file}: "${param}" names no section of ${parsed.topic}`).toBe(true);
    }
  });
});
