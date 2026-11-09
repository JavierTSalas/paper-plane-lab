import type { PaperSize, PaperSpec, PaperStock } from '../types';

/**
 * One stock for every sheet in the app: standard 80 g/m² office paper.
 * Grammage and caliper: docs/research/04-paper-and-competition-rules.md §2 and §8.
 */
export const PAPER_STOCK: PaperStock = {
  gsm: 80,
  thickness: 1.06e-4,
};

const mm = (v: number): number => v / 1000;

/** Exact trimmed sizes. Source: docs/research/04-paper-and-competition-rules.md §1 and §8. */
export const PAPER_SIZES: PaperSize[] = [
  { id: 'a4', name: 'A4', short: mm(210), long: mm(297), family: 'iso' },
  { id: 'letter', name: 'US Letter', short: mm(215.9), long: mm(279.4), family: 'us' },
  { id: 'a5', name: 'A5', short: mm(148), long: mm(210), family: 'iso' },
  { id: 'a3', name: 'A3', short: mm(297), long: mm(420), family: 'iso' },
  { id: 'a6', name: 'A6', short: mm(105), long: mm(148), family: 'iso' },
  { id: 'b5', name: 'B5', short: mm(176), long: mm(250), family: 'iso' },
  { id: 'legal', name: 'US Legal', short: mm(215.9), long: mm(355.6), family: 'us' },
  { id: 'half-letter', name: 'Half Letter', short: mm(139.7), long: mm(215.9), family: 'us' },
  { id: 'tabloid', name: 'Tabloid', short: mm(279.4), long: mm(431.8), family: 'us' },
  { id: 'sq150', name: 'Origami 15 cm', short: mm(150), long: mm(150), family: 'square' },
  { id: 'sq210', name: 'Square 21 cm', short: mm(210), long: mm(210), family: 'square' },
];

export const DEFAULT_SIZE_ID = 'a4';

export function getPaperSize(id: string): PaperSize {
  return PAPER_SIZES.find((s) => s.id === id) ?? PAPER_SIZES[0]!;
}

/** Sheet colours. `ink` is a readable line colour on top of `hex`. */
export interface PaperColor {
  id: string;
  name: string;
  hex: string;
  ink: string;
}

export const PAPER_COLORS: PaperColor[] = [
  { id: 'white', name: 'Copy white', hex: '#fdfcf8', ink: '#2f2e2b' },
  { id: 'cream', name: 'Cream', hex: '#f6ead0', ink: '#2f2e2b' },
  { id: 'kraft', name: 'Kraft', hex: '#c9a877', ink: '#2f2e2b' },
  { id: 'butter', name: 'Butter', hex: '#f4d77a', ink: '#2f2e2b' },
  { id: 'peach', name: 'Peach', hex: '#f6b993', ink: '#2f2e2b' },
  { id: 'coral', name: 'Coral', hex: '#e9785b', ink: '#2f2e2b' },
  { id: 'rose', name: 'Rose', hex: '#e7a3ad', ink: '#2f2e2b' },
  { id: 'lilac', name: 'Lilac', hex: '#b9a4d6', ink: '#2f2e2b' },
  { id: 'sky', name: 'Sky', hex: '#8fc1e3', ink: '#2f2e2b' },
  { id: 'teal', name: 'Teal', hex: '#5fa8a3', ink: '#2f2e2b' },
  { id: 'mint', name: 'Mint', hex: '#b5dcc0', ink: '#2f2e2b' },
  { id: 'sage', name: 'Sage', hex: '#8fb096', ink: '#2f2e2b' },
  { id: 'navy', name: 'Navy', hex: '#2f4a6d', ink: '#fdfcf8' },
  { id: 'charcoal', name: 'Charcoal', hex: '#4a4843', ink: '#fdfcf8' },
];

export const PAPER_PATTERNS = [
  { id: 'plain', name: 'Plain' },
  { id: 'grid', name: 'Graph grid' },
  { id: 'lined', name: 'Ruled lines' },
  { id: 'dots', name: 'Dots' },
  { id: 'stripes', name: 'Stripes' },
] as const;

export type PaperPatternId = (typeof PAPER_PATTERNS)[number]['id'];

export function getPaperColor(idOrHex: string): PaperColor {
  return (
    PAPER_COLORS.find((c) => c.id === idOrHex || c.hex === idOrHex) ?? {
      id: idOrHex,
      name: idOrHex,
      hex: idOrHex,
      ink: '#2f2e2b',
    }
  );
}

export interface MakePaperOptions {
  sizeId?: string;
  orientation?: 'portrait' | 'landscape';
  /** Colour id or CSS colour. */
  front?: string;
  back?: string;
  pattern?: PaperPatternId;
}

/** Build a PaperSpec. Portrait puts the short side along x. */
export function makePaper(opts: MakePaperOptions = {}): PaperSpec {
  const size = getPaperSize(opts.sizeId ?? DEFAULT_SIZE_ID);
  const landscape = opts.orientation === 'landscape';
  return {
    sizeId: size.id,
    width: landscape ? size.long : size.short,
    height: landscape ? size.short : size.long,
    front: getPaperColor(opts.front ?? 'white').hex,
    back: getPaperColor(opts.back ?? opts.front ?? 'white').hex,
    pattern: opts.pattern && opts.pattern !== 'plain' ? opts.pattern : undefined,
  };
}

/** Mass of one sheet, kg. Folding conserves it. */
export function sheetMass(paper: PaperSpec, stock: PaperStock = PAPER_STOCK): number {
  return (stock.gsm / 1000) * paper.width * paper.height;
}
