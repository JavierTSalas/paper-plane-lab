import type { ReactElement } from 'react';
import { EmptyState } from '../../ui/EmptyState';

/** Placeholder until the flight lab screen lands. */
export default function FlyPage(): ReactElement {
  return (
    <div className="ppl-page">
      <EmptyState icon="fly" title="Flight lab" body="Throw your plane in a real 3D scene and read the Professor’s diagnosis. This screen is being built." />
    </div>
  );
}
