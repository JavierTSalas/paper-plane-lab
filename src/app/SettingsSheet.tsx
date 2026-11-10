import { useState, type ReactElement } from 'react';
import { useLocation } from 'wouter';
import { Button } from '../ui/Button';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Sheet } from '../ui/Sheet';
import { toast } from '../ui/Toast';
import { Toggle } from '../ui/Toggle';
import { WELCOME_PATH } from './routes';
import { useLab } from './store';
import type { UnitsSetting } from './types';

export interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsSheet({ open, onClose }: SettingsSheetProps): ReactElement {
  const settings = useLab((s) => s.settings);
  const setSetting = useLab((s) => s.setSetting);
  const resetAll = useLab((s) => s.resetAll);
  const [confirming, setConfirming] = useState(false);
  const [, navigate] = useLocation();

  const close = (): void => {
    setConfirming(false);
    onClose();
  };

  const reset = (): void => {
    resetAll();
    close();
    navigate(WELCOME_PATH);
    toast({ title: 'Progress reset', body: 'The lab is fresh again.', tone: 'info' });
  };

  return (
    <Sheet open={open} onClose={close} title="Settings" size="sm">
      <div className="ppl-settings">
        <section className="ppl-settings__group" aria-labelledby="ppl-set-units">
          <h3 id="ppl-set-units" className="ppl-h3">
            Units
          </h3>
          <SegmentedControl<UnitsSetting>
            label="Units"
            block
            value={settings.units}
            onChange={(v) => setSetting('units', v)}
            options={[
              { value: 'metric', label: 'Metric (m, g)' },
              { value: 'imperial', label: 'Imperial (ft, oz)' },
            ]}
          />
        </section>

        <section className="ppl-settings__group" aria-labelledby="ppl-set-display">
          <h3 id="ppl-set-display" className="ppl-h3">
            Display
          </h3>
          <Toggle
            label="Reduce motion"
            description="Calmer animations everywhere. Your device setting is always respected too."
            checked={settings.reducedMotion}
            onChange={(v) => setSetting('reducedMotion', v)}
          />
          <Toggle
            label="Show flight trails"
            description="Draw ghost trails of earlier throws in the flight lab."
            checked={settings.showTrails}
            onChange={(v) => setSetting('showTrails', v)}
          />
        </section>

        <section className="ppl-settings__group" aria-labelledby="ppl-set-progress">
          <h3 id="ppl-set-progress" className="ppl-h3">
            Progress
          </h3>
          {confirming ? (
            <div className="ppl-settings__confirm" role="alert">
              <p className="ppl-small">This deletes your planes, flights, ranked entries, unfinished folds and settings on this device. It cannot be undone.</p>
              <div className="ppl-row">
                <Button variant="danger" icon="trash" onClick={reset}>
                  Yes, reset everything
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  Keep my lab
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" icon="trash" onClick={() => setConfirming(true)}>
              Reset progress…
            </Button>
          )}
        </section>

        <section className="ppl-settings__group" aria-labelledby="ppl-set-about">
          <h3 id="ppl-set-about" className="ppl-h3">
            About
          </h3>
          <p className="ppl-small ppl-muted">
            Paper Plane Lab folds real paper geometry and flies it in a 6-degree-of-freedom simulation built on published low-speed
            aerodynamics. Every source is listed in the <a href="#/notebook/sources" onClick={close}>Notebook</a>. Your lab is saved
            only on this device.
          </p>
        </section>
      </div>
    </Sheet>
  );
}
