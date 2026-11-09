import { useState, type ReactElement, type ReactNode } from 'react';
import { Link } from 'wouter';
import { cx } from '../ui/cx';
import { Icon } from '../ui/icons';
import { Menu } from '../ui/Menu';
import type { AppRoute } from './routes';
import { TABS } from './routes';
import { SettingsSheet } from './SettingsSheet';
import { useCurrentPlane } from './store';
import './AppShell.css';

export interface AppShellProps {
  route: AppRoute;
  children: ReactNode;
}

function Brand(): ReactElement {
  return (
    <Link href="/hangar" className="ppl-shell__brand" aria-label="Paper Plane Lab, home">
      <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
        <rect width="32" height="32" rx="9" fill="var(--accent)" />
        <path d="M6.5 16.5 25 8l-5.5 17-4.2-6.2z" fill="#fffaf0" stroke="#fffaf0" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="m15.3 18.8 9.7-10.8" stroke="var(--accent-lip)" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span className="ppl-shell__brand-text">Paper Plane Lab</span>
    </Link>
  );
}

function PlaneChip(): ReactElement {
  const plane = useCurrentPlane();
  return (
    <Link href={plane ? `/plane/${plane.id}` : '/hangar'} className="ppl-shell__plane" title={plane ? `Current plane: ${plane.name}` : 'Choose a plane'}>
      <span className="ppl-shell__plane-dot" style={{ background: plane?.paper.front ?? 'var(--paper-2)' }} aria-hidden="true">
        <Icon name="fly" size={14} />
      </span>
      <span className="ppl-shell__plane-name">{plane ? plane.name : 'No plane yet'}</span>
    </Link>
  );
}

/** App chrome: top bar, bottom tab bar on phones, left rail from 900 px. */
export function AppShell({ route, children }: AppShellProps): ReactElement {
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <div className={cx('ppl-shell', route.immersive && 'ppl-shell--immersive')}>
      <a className="ppl-skip" href="#ppl-main" onClick={(e) => {
        e.preventDefault();
        document.getElementById('ppl-main')?.focus();
      }}>
        Skip to content
      </a>

      <nav className="ppl-shell__nav" aria-label="Main">
        <Brand />
        <ul role="list" className="ppl-shell__tabs">
          {TABS.map((t) => {
            const active = route.tab === t.id;
            return (
              <li key={t.id}>
                <Link href={t.href} className={cx('ppl-shell__tab', active && 'is-active')} aria-current={active ? 'page' : undefined}>
                  <span className="ppl-shell__tab-icon">
                    <Icon name={t.icon} size={24} />
                  </span>
                  <span className="ppl-shell__tab-label">{t.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {!route.immersive && (
        <header className="ppl-shell__top">
          <h1 className="ppl-shell__title">{route.title}</h1>
          <div className="ppl-shell__top-actions">
            <PlaneChip />
            <Menu
              label="More"
              items={[
                { id: 'notebook', label: 'Notebook', icon: 'notebook', hint: 'How it works, and the sources', href: '#/notebook' },
                { id: 'settings', label: 'Settings', icon: 'settings', onSelect: () => setSettingsOpen(true) },
              ]}
            />
          </div>
        </header>
      )}

      <main id="ppl-main" className="ppl-shell__main" tabIndex={-1}>
        {children}
      </main>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
