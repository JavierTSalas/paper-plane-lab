import type { ReactElement } from 'react';
import { planeList, useLab } from '../../app/store';
import type { PlaneDesign } from '../../core/types';
import { Button } from '../../ui/Button';
import { Tag } from '../../ui/Chip';
import { cx } from '../../ui/cx';
import { Sheet } from '../../ui/Sheet';
import { PlaneThumb } from '../fold/view';

export interface PlaneSheetProps {
  open: boolean;
  onClose: () => void;
  current: PlaneDesign;
}

export function PlaneSheet({ open, onClose, current }: PlaneSheetProps): ReactElement {
  const planes = useLab((s) => s.planes);
  const selectPlane = useLab((s) => s.selectPlane);
  const list = planeList(planes);
  const shown = list.length > 0 ? list : [current];
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Which plane?"
      description={list.length === 0 ? 'You have not folded a plane yet, so the Professor lent you his Classic Dart.' : 'Your folded planes.'}
      size="md"
      footer={
        <Button variant="secondary" block icon="hangar" onClick={() => (window.location.hash = '#/hangar')}>
          Fold a new plane in the Hangar
        </Button>
      }
    >
      <ul className="ppl-fly-planes" role="list">
        {shown.map((p) => {
          const selected = p.id === current.id;
          return (
            <li key={p.id}>
              <button
                type="button"
                className={cx('ppl-fly-plane', selected && 'is-selected')}
                aria-pressed={selected}
                onClick={() => {
                  if (planes[p.id]) selectPlane(p.id);
                  onClose();
                }}
              >
                <PlaneThumb design={p} size={88} />
                <span className="ppl-fly-plane__text">
                  <span className="ppl-fly-plane__name">{p.name}</span>
                  <Tag tone="neutral">{p.category}</Tag>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
