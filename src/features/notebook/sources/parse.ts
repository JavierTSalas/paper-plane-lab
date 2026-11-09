/**
 * Parses the "## Sources" section of a research note in docs/research/ into structured entries.
 * Pure (no fs), so the test can check that sources.json is still a faithful copy of the notes.
 */

export interface SourceEntry {
  /** Globally unique: `<doc number>:<tag>`, e.g. `01:S15`. */
  id: string;
  /** The tag as written in the note, e.g. `S15`. */
  tag: string;
  /** The entry text as written, with Markdown emphasis and code marks removed. */
  text: string;
  urls: string[];
}

export interface SourceGroup {
  /** Two-digit note number, e.g. `01`. */
  doc: string;
  /** File name under docs/research/. */
  file: string;
  /** Note title without its number. */
  title: string;
  /** Prose lines inside the Sources section that are not entries (access notes, additions). */
  notes: string[];
  entries: SourceEntry[];
}

const ENTRY = /^\d+\.\s+\[([A-Z][A-Za-z0-9-]*)\]\s*(.*)$/;
const URL_RE = /https?:\/\/[^\s<>]+/g;

/** Removes Markdown bold, italic and code marks; keeps the words. */
export function plainMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,;:]|$)/g, '$1$2')
    .replace(/`([^`]*)`/g, '$1')
    .trim();
}

/** Trailing punctuation is prose, not URL; a closing parenthesis stays only when the URL opened one. */
export function cleanUrl(raw: string): string {
  let url = raw;
  for (;;) {
    const last = url.charAt(url.length - 1);
    if ('.,;:'.includes(last)) {
      url = url.slice(0, -1);
      continue;
    }
    if (last === ')') {
      const open = (url.match(/\(/g) ?? []).length;
      const close = (url.match(/\)/g) ?? []).length;
      if (close > open) {
        url = url.slice(0, -1);
        continue;
      }
    }
    return url;
  }
}

export function noteTitle(markdown: string): string {
  const first = markdown.split('\n').find((l) => l.startsWith('# ')) ?? '';
  return first
    .replace(/^#\s+/, '')
    .replace(/^\d+\s*[-:·]\s*/, '')
    .trim();
}

export function parseSources(file: string, markdown: string): SourceGroup {
  const doc = file.slice(0, 2);
  const lines = markdown.split('\n');
  const start = lines.findIndex((l) => /^##\s+Sources\s*$/.test(l));
  const group: SourceGroup = { doc, file, title: noteTitle(markdown), notes: [], entries: [] };
  if (start < 0) return group;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^##\s/.test(line)) break;
    if (line === '' || line === '---') continue;
    const m = ENTRY.exec(line);
    if (m) {
      const text = plainMarkdown(m[2]);
      const urls = [...m[2].matchAll(URL_RE)].map((u) => cleanUrl(u[0]));
      group.entries.push({ id: `${doc}:${m[1]}`, tag: m[1], text, urls });
    } else {
      group.notes.push(plainMarkdown(line));
    }
  }
  return group;
}
