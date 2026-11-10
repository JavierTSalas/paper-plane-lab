import { useEffect, useState, type ReactElement } from 'react';
import { PAPER_COLORS, PAPER_PATTERNS, type PaperPatternId } from '../../core/paper';
import type { PaperSpec } from '../../core/types';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { PaperPreview, PaperSwatch } from '../../ui/paper';
import { Sheet } from '../../ui/Sheet';

export interface RecolourSheetProps {
  open: boolean;
  paper: PaperSpec;
  onClose: () => void;
  onSave: (paper: PaperSpec) => void;
}

function Swatches({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }): ReactElement {
  return (
    <div className="ppl-recolour__field">
      <div className="ppl-small">
        <strong>{label}</strong>
      </div>
      <div role="radiogroup" aria-label={`${label} colour`} className="ppl-recolour__swatches">
        {PAPER_COLORS.map((c) => (
          <PaperSwatch key={c.id} color={c.hex} selected={c.hex === value} focusable onSelect={() => onChange(c.hex)} />
        ))}
      </div>
    </div>
  );
}

/** Colours and print only: the sheet's size and orientation are part of the fold and stay as they are. */
export function RecolourSheet({ open, paper, onClose, onSave }: RecolourSheetProps): ReactElement {
  const [draft, setDraft] = useState<PaperSpec>(paper);
  useEffect(() => {
    if (open) setDraft(paper);
  }, [open, paper]);
  const pattern = (draft.pattern ?? 'plain') as PaperPatternId;

  const setPattern = (id: PaperPatternId): void => {
    const { pattern: _old, ...rest } = draft;
    setDraft(id === 'plain' ? rest : { ...rest, pattern: id });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Recolour"
      description="New paper, same folds. Colours never change how it flies."
      footer={
        <Button variant="primary" block onClick={() => onSave(draft)}>
          Save colours
        </Button>
      }
    >
      <div className="ppl-stack">
        <div className="ppl-recolour__preview">
          <PaperPreview paper={draft} size={120} />
        </div>
        <Swatches label="Front" value={draft.front} onChange={(front) => setDraft({ ...draft, front })} />
        <Swatches label="Back" value={draft.back} onChange={(back) => setDraft({ ...draft, back })} />
        <div className="ppl-recolour__field">
          <div className="ppl-small">
            <strong>Print on the front</strong>
          </div>
          <div className="ppl-row" role="group" aria-label="Print">
            {PAPER_PATTERNS.map((p) => (
              <Chip key={p.id} size="sm" selected={p.id === pattern} onClick={() => setPattern(p.id)}>
                {p.name}
              </Chip>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
