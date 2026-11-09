import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { IconName } from '../ui/icons';

export type TabId = 'hangar' | 'fold' | 'fly' | 'tunnel' | 'ranks';

export interface AppRoute {
  /** wouter pattern. */
  path: string;
  /** Screen title in the top bar and the document title. */
  title: string;
  page: LazyExoticComponent<ComponentType>;
  /** Which main tab is highlighted. */
  tab?: TabId;
  /** Full-bleed: no top bar (the page draws its own overlay controls). */
  immersive?: boolean;
  /** Rendered without any shell chrome (onboarding). */
  bare?: boolean;
  /** Reachable before onboarding is complete. */
  public?: boolean;
}

export const ROUTES: readonly AppRoute[] = [
  { path: '/welcome', title: 'Welcome', page: lazy(() => import('../features/onboarding/WelcomePage')), bare: true, public: true },
  { path: '/hangar', title: 'Hangar', page: lazy(() => import('../features/hangar/HangarPage')), tab: 'hangar' },
  { path: '/plane/:id', title: 'Plane', page: lazy(() => import('../features/hangar/PlaneDetailPage')), tab: 'hangar' },
  { path: '/fold', title: 'Fold', page: lazy(() => import('../features/fold/FoldPage')), tab: 'fold' },
  { path: '/fly', title: 'Fly', page: lazy(() => import('../features/fly/FlyPage')), tab: 'fly', immersive: true },
  { path: '/tunnel', title: 'Wind tunnel', page: lazy(() => import('../features/tunnel/TunnelPage')), tab: 'tunnel' },
  { path: '/ranks', title: 'Ranks', page: lazy(() => import('../features/ranks/RanksPage')), tab: 'ranks' },
  { path: '/notebook/:topic?', title: 'Notebook', page: lazy(() => import('../features/notebook/NotebookPage')) },
  { path: '/_kit', title: 'UI kit', page: lazy(() => import('../ui/KitPage')), public: true },
  { path: '/_views', title: 'Paper views', page: lazy(() => import('../features/fold/view/ViewDemo')), public: true },
];

export interface TabDef {
  id: TabId;
  label: string;
  href: string;
  icon: IconName;
}

export const TABS: readonly TabDef[] = [
  { id: 'hangar', label: 'Hangar', href: '/hangar', icon: 'hangar' },
  { id: 'fold', label: 'Fold', href: '/fold', icon: 'fold' },
  { id: 'fly', label: 'Fly', href: '/fly', icon: 'fly' },
  { id: 'tunnel', label: 'Tunnel', href: '/tunnel', icon: 'tunnel' },
  { id: 'ranks', label: 'Ranks', href: '/ranks', icon: 'ranks' },
];

export const HOME_PATH = '/hangar';
export const WELCOME_PATH = '/welcome';
