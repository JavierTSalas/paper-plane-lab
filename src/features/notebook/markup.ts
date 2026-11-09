/** Pure helpers for the Notebook's inline markup (see topics/types.ts). */

export type QuantityKind = 'length' | 'speed' | 'mass' | 'area' | 'wingLoading';

export const TOKEN = /\*\*(.+?)\*\*|\[\[([^\]]+)\]\]|\{\{([^}]+)\}\}/g;

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
  return text.replace(TOKEN, (_all, bold: string | undefined, link: string | undefined, brace: string | undefined) => {
    if (bold !== undefined) return bold;
    if (link !== undefined) return link.split('|')[1] ?? link;
    if (brace !== undefined && brace.startsWith('info:')) return '';
    return 'x';
  });
}
