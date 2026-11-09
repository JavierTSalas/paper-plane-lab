/** Pure helpers for the Notebook's inline markup (see topics/types.ts). */

export type QuantityKind = 'length' | 'speed' | 'mass' | 'area' | 'wingLoading';

/** Groups: 1 bold, 2 link, 3 brace token, 4-5 subscript (`C_L` is C with subscript L). */
export const TOKEN = /\*\*(.+?)\*\*|\[\[([^\]]+)\]\]|\{\{([^}]+)\}\}|\b([A-Za-z])_([A-Za-z0-9]+)/g;

const KINDS: readonly QuantityKind[] = ['length', 'speed', 'mass', 'area', 'wingLoading'];

export function isKind(s: string): s is QuantityKind {
  return (KINDS as readonly string[]).includes(s);
}

/** Every markup token in a string, for tests: links, quantities and info dots. */
export function tokensOf(text: string): { kind: 'bold' | 'link' | 'brace'; body: string }[] {
  const out: { kind: 'bold' | 'link' | 'brace'; body: string }[] = [];
  for (const m of text.matchAll(TOKEN)) {
    if (m[1] !== undefined) out.push({ kind: 'bold', body: m[1] });
    else if (m[2] !== undefined) out.push({ kind: 'link', body: m[2] });
    else if (m[3] !== undefined) out.push({ kind: 'brace', body: m[3] });
  }
  return out;
}

/** Plain words of a markup string, for counting. */
export function plainText(text: string): string {
  return text.replace(TOKEN, (_all, bold: string | undefined, link: string | undefined, brace: string | undefined, base: string | undefined, sub: string | undefined) => {
    if (base !== undefined) return `${base}${sub ?? ''}`;
    if (bold !== undefined) return bold;
    if (link !== undefined) return link.split('|')[1] ?? link;
    if (brace !== undefined && brace.startsWith('info:')) return '';
    return 'x';
  });
}
