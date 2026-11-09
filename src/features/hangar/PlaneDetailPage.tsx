import type { ReactElement } from 'react';
import { EmptyState } from '../../ui/EmptyState';

/** Placeholder until the plane detail screen lands. */
export default function PlaneDetailPage(): ReactElement {
  return (
    <div className="ppl-page">
      <EmptyState icon="fly" title="Plane detail" body="Stats, crease pattern, look-alikes and best flights for one plane. This screen is being built." />
    </div>
  );
}
