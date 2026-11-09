import type { ReactElement, SVGProps } from 'react';

/*
 * Icon set: 24 px grid, 2 px round strokes, currentColor. Long edges carry a slight curve so the set
 * reads as hand-inked rather than machined. Add an icon by adding one entry to BODIES.
 */

const BODIES = {
  hangar: (
    <>
      <path d="M3.4 20.4v-9.1C3.4 7.1 7.2 3.8 12 3.8s8.6 3.3 8.6 7.5v9.1" />
      <path d="M2 20.6c6.6-.25 13.3-.2 20 0" />
      <path d="M7.6 20.4v-6.1c2.9-.15 5.9-.15 8.8 0v6.1" />
      <path d="M12 14.4v6" />
      <path d="M8 9.6c2.6-.9 5.4-.9 8 0" />
    </>
  ),
  fold: (
    <>
      <path d="M4.2 4.1c3.3-.1 6.6-.15 9.8-.1l6 6c.1 3.3.05 6.6 0 10-5.3.1-10.6.1-15.8 0-.1-5.3-.1-10.6 0-15.9z" />
      <path d="M14 4v6h6" />
      <path d="M7.5 13.5c2.3-.1 4.6-.1 6.9 0M7.5 16.8c1.6-.1 3.2-.1 4.7 0" />
    </>
  ),
  fly: (
    <>
      <path d="M2.6 11.3 21.4 3.6l-5.5 16.8-4.7-6z" />
      <path d="M21.4 3.6 11.2 14.4" />
      <path d="m11.2 14.4-.5 5.3 2.8-2.4" />
    </>
  ),
  tunnel: (
    <>
      <ellipse cx="5.6" cy="12" rx="2.6" ry="6.4" />
      <path d="M5.6 5.6c4.3-.2 8.6-.2 12.8 0M5.6 18.4c4.3.2 8.6.2 12.8 0" />
      <path d="M18.4 5.6c1.5 0 2.7 2.9 2.7 6.4s-1.2 6.4-2.7 6.4" />
      <path d="M10 10.4c1.6-.9 3.6-.9 6.3.1M10.6 13.8c1.8.7 3.6.6 5.8-.2" />
    </>
  ),
  ranks: (
    <>
      <path d="M7.6 4.2c2.9-.2 5.9-.2 8.8 0v5.1a4.4 4.4 0 0 1-8.8 0z" />
      <path d="M7.6 6.1H4.8c0 2.6 1.3 4.2 3.3 4.6M16.4 6.1h2.8c0 2.6-1.3 4.2-3.3 4.6" />
      <path d="M12 13.8v3.1" />
      <path d="M8.6 20.3c2.3-.1 4.5-.1 6.8 0l-.8-3.3H9.4z" />
    </>
  ),
  notebook: (
    <>
      <path d="M6.6 3.6c3.6-.1 7.2-.1 10.9 0 .9 0 1.6.7 1.6 1.6.1 4.6.1 9.1 0 13.7 0 .9-.7 1.5-1.6 1.5-3.6.1-7.3.1-10.9 0z" />
      <path d="M4 7.2h3.6M4 12h3.6M4 16.8h3.6" />
      <path d="M10.6 8.2c1.9-.1 3.8-.1 5.6 0M10.6 11.6c1.3-.1 2.6-.1 3.9 0" />
    </>
  ),
  settings: (
    <>
      <path d="M4 6.6h8.8M17.2 6.6H20M4 12h3.2M11.6 12H20M4 17.4h9.4M17.8 17.4H20" />
      <circle cx="15" cy="6.6" r="2.2" />
      <circle cx="9.4" cy="12" r="2.2" />
      <circle cx="15.6" cy="17.4" r="2.2" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7c5.3-.15 10.7-.15 16 0M4 12c5.3.1 10.7.1 16 0M4 17c5.3-.1 10.7-.1 16 0" />
    </>
  ),
  close: (
    <>
      <path d="M6.2 6.2c4 3.9 7.8 7.8 11.6 11.6M17.8 6.2c-3.9 4-7.8 7.8-11.6 11.6" />
    </>
  ),
  back: <path d="M14.8 5.2 8 12l6.8 6.8" />,
  next: <path d="M9.2 5.2 16 12l-6.8 6.8" />,
  'chevron-down': <path d="M6 9.4 12 15.4l6-6" />,
  play: <path d="M7.4 5c0-.9.9-1.4 1.6-.9l10 6.9c.6.4.6 1.4 0 1.9l-10 6.9c-.7.5-1.6 0-1.6-.9z" />,
  pause: <path d="M8.2 5.2c-.1 4.5-.1 9.1 0 13.6M15.8 5.2c.1 4.5.1 9.1 0 13.6" />,
  replay: (
    <>
      <path d="M3.9 4.6v5h5" />
      <path d="M4.5 9.6a8 8 0 1 1-.5 4" />
    </>
  ),
  undo: (
    <>
      <path d="M8.8 13.8 4 9l4.8-4.8" />
      <path d="M4 9h10.4a5.6 5.6 0 0 1 0 11.2H11" />
    </>
  ),
  redo: (
    <>
      <path d="M15.2 13.8 20 9l-4.8-4.8" />
      <path d="M20 9H9.6a5.6 5.6 0 0 0 0 11.2H13" />
    </>
  ),
  flip: (
    <>
      <path d="M4.2 10.4c2.9-.1 5.8-.1 8.6 0 .1 3.2.1 6.4 0 9.6-2.9.1-5.8.1-8.6 0-.1-3.2-.1-6.4 0-9.6z" />
      <path d="M16 10.4h3.8V20H16" strokeDasharray="2 2.4" />
      <path d="M7.4 7.2c2.6-3.2 7.6-3.6 10.6-.6" />
      <path d="m18.8 3.8-.6 3.2-3.2-.4" />
    </>
  ),
  mirror: (
    <>
      <path d="M12 3v18" strokeDasharray="2 2.6" />
      <path d="M8.8 6.4 3.4 17.6h5.4z" />
      <path d="m15.2 6.4 5.4 11.2h-5.4z" />
    </>
  ),
  valley: (
    <>
      <path d="M3 6.6c3 3.2 6 6.2 9 9.2 3-3 6-6 9-9.2" />
      <path d="M3 20.2h18" strokeDasharray="3 2.4" />
    </>
  ),
  mountain: (
    <>
      <path d="M3 15.8c3-3.2 6-6.2 9-9.2 3 3 6 6 9 9.2" />
      <path d="M3 20.2h18" strokeDasharray="4 2 0.6 2" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3.6 8.8 4.4-8.8 4.4L3.2 8z" />
      <path d="m3.2 12 8.8 4.4 8.8-4.4" />
      <path d="m3.2 16 8.8 4.4 8.8-4.4" />
    </>
  ),
  crease: (
    <>
      <path d="M4.6 4.2c4.9-.1 9.9-.1 14.8 0 .3 5.2.3 10.4 0 15.6-4.9.1-9.9.1-14.8 0-.3-5.2-.3-10.4 0-15.6z" />
      <path d="M6 18 18 6" strokeDasharray="2.6 2.4" />
    </>
  ),
  ruler: (
    <>
      <path d="M3.4 16.6 16.6 3.4l4 4L7.4 20.6z" />
      <path d="m6.9 13.1 1.6 1.6M9.8 10.2l2.2 2.2M12.7 7.3l1.6 1.6" />
    </>
  ),
  scale: (
    <>
      <path d="M7.8 9.4c2.8-.1 5.6-.1 8.4 0l2.6 10.4c-4.5.2-9.1.2-13.6 0z" />
      <path d="M9.6 9.3a2.4 2.4 0 1 1 4.8 0" />
      <path d="M10.2 14.6h3.6" />
    </>
  ),
  speed: (
    <>
      <path d="M4.3 17.4a8.6 8.6 0 1 1 15.4 0" />
      <path d="m12 14.4 4-5" />
      <circle cx="12" cy="14.6" r="1.4" />
      <path d="M6.9 10.2 8 11M12 6.8V8" />
    </>
  ),
  angle: (
    <>
      <path d="M4 19.2c5.3-.1 10.7-.1 16 0" />
      <path d="M4 19.2 15.4 5" />
      <path d="M10.4 19.2a6.4 6.4 0 0 0-2.4-5" />
    </>
  ),
  height: (
    <>
      <path d="M12 4v13" />
      <path d="M8.6 7.4 12 4l3.4 3.4M8.6 13.6 12 17l3.4-3.4" />
      <path d="M3.6 20.4c5.6-.15 11.2-.15 16.8 0" />
    </>
  ),
  distance: (
    <>
      <path d="M3.8 7v10M20.2 7v10" />
      <path d="M4.4 12c5.1-.1 10.1-.1 15.2 0" />
      <path d="m7.6 9-3.1 3 3.1 3M16.4 9l3.1 3-3.1 3" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13.6" r="7.4" />
      <path d="M12 13.6V9.6M10 2.8h4M12 2.8v3.4M18.2 6.8l1.4-1.4" />
    </>
  ),
  wind: (
    <>
      <path d="M3 8.6h10.6a2.6 2.6 0 1 0-2.6-2.6" />
      <path d="M3 12.6h15.2a2.8 2.8 0 1 1-2.8 2.8" />
      <path d="M3 16.6h6.2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.5 1.5M17.1 17.1l1.5 1.5M5.4 18.6l1.5-1.5M17.1 6.9l1.5-1.5" />
    </>
  ),
  cloud: (
    <path d="M7.2 18.6h9.9a3.9 3.9 0 0 0 .6-7.8 5.7 5.7 0 0 0-11 1.3 3.3 3.3 0 0 0 .5 6.5z" />
  ),
  thermometer: (
    <>
      <path d="M10 13.8V5.2a2 2 0 0 1 4 0v8.6a4.1 4.1 0 1 1-4 0z" />
      <path d="M12 10v7" />
      <path d="M17 6.6h2M17 9.6h2" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <circle cx="12" cy="12" r="4.8" />
      <circle cx="12" cy="12" r="1.2" />
    </>
  ),
  star: <path d="m12 3.6 2.6 5.3 5.7.8-4.1 4 1 5.7-5.2-2.7-5.1 2.7 1-5.7-4.2-4 5.8-.8z" />,
  check: <path d="M4.8 12.6c1.6 1.4 3.1 2.9 4.6 4.6 3-3.4 6-6.6 9.8-9.8" />,
  warning: (
    <>
      <path d="M10.6 4.6c.6-1.1 2.2-1.1 2.8 0l7.6 13.6c.6 1.1-.2 2.4-1.4 2.4H4.4c-1.2 0-2-1.3-1.4-2.4z" />
      <path d="M12 9.6v4.4M12 17.2v.1" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M12 11v5.4M12 7.8v.1" />
    </>
  ),
  plus: <path d="M12 5c-.1 4.7-.1 9.3 0 14M5 12c4.7-.1 9.3-.1 14 0" />,
  minus: <path d="M5 12c4.7-.1 9.3-.1 14 0" />,
  trash: (
    <>
      <path d="M4.4 7c5.1-.15 10.1-.15 15.2 0" />
      <path d="M9.4 7V4.8h5.2V7" />
      <path d="m6.4 7 .9 12.2c.1.8.7 1.3 1.5 1.3h6.4c.8 0 1.4-.5 1.5-1.3L17.6 7" />
      <path d="M10.2 11v5.6M13.8 11v5.6" />
    </>
  ),
  copy: (
    <>
      <rect x="8.4" y="8.4" width="11.6" height="11.6" rx="2" />
      <path d="M15.6 8.4V5.6c0-.9-.7-1.6-1.6-1.6H5.6C4.7 4 4 4.7 4 5.6V14c0 .9.7 1.6 1.6 1.6h2.8" />
    </>
  ),
  edit: (
    <>
      <path d="M15.4 4.6c1.4 1.3 2.7 2.6 4 4L9 19.2l-5 1 1-5z" />
      <path d="m13.2 6.8 4 4" />
    </>
  ),
  share: (
    <>
      <path d="M12 14.6V3.6" />
      <path d="M8 7.6 12 3.6l4 4" />
      <path d="M7.4 10.6H5.6v9.6c4.3.1 8.5.1 12.8 0v-9.6h-1.8" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8.2c1-.1 2-.1 3 0l1.6-2.6h6.8L17 8.2c1-.1 2-.1 3 0 .1 3.6.1 7.2 0 10.8-5.3.1-10.7.1-16 0-.1-3.6-.1-7.2 0-10.8z" />
      <circle cx="12" cy="13.4" r="3.4" />
    </>
  ),
  eye: (
    <>
      <path d="M2.6 12c2.4-4.2 5.6-6.4 9.4-6.4s7 2.2 9.4 6.4c-2.4 4.2-5.6 6.4-9.4 6.4S5 16.2 2.6 12z" />
      <circle cx="12" cy="12" r="2.9" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.6" width="14" height="9.8" rx="2" />
      <path d="M8.2 10.6V7.8a3.8 3.8 0 0 1 7.6 0v2.8" />
      <path d="M12 14.4v2.4" />
    </>
  ),
  paperclip: <path d="M16.4 8.2V17a4.4 4.4 0 0 1-8.8 0V5.8a3 3 0 0 1 6 0V16a1.5 1.5 0 0 1-3 0V8.2" />,
  'swipe-up': (
    <>
      <path d="M12 13.6V3.8" />
      <path d="M8.6 7.2 12 3.8l3.4 3.4" />
      <circle cx="12" cy="18" r="2.6" />
      <path d="M6.6 16.4a5.6 5.6 0 0 0 0 3.2M17.4 16.4a5.6 5.6 0 0 1 0 3.2" />
    </>
  ),
  hand: (
    <>
      <path d="M9 12V5a1.5 1.5 0 0 1 3 0v6" />
      <path d="M12 10.4V9.2a1.5 1.5 0 0 1 3 0v2" />
      <path d="M15 11a1.5 1.5 0 0 1 3 0v3.6a6 6 0 0 1-6 6h-.8a5.6 5.6 0 0 1-4.7-2.6l-2-3.4a1.6 1.6 0 0 1 2.6-1.8L9 14.6" />
    </>
  ),
  sparkle: (
    <>
      <path d="M10.6 5c.6 4 2.6 6.1 6.6 6.8-4 .6-6 2.7-6.6 6.8-.6-4.1-2.6-6.2-6.6-6.8 4-.7 6-2.8 6.6-6.8z" />
      <path d="M18.4 3.2v3.6M16.6 5h3.6" />
    </>
  ),
} satisfies Record<string, ReactElement>;

export type IconName = keyof typeof BODIES;

export const ICON_NAMES = Object.keys(BODIES) as IconName[];

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  /** Rendered size in px (square). Default 24. */
  size?: number;
  /** Accessible name. Without it the icon is decorative and hidden from assistive tech. */
  title?: string;
}

function renderIcon(name: IconName, { size = 24, title, strokeWidth = 2, ...rest }: IconProps): ReactElement {
  const labelled = title !== undefined;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? title : undefined}
      aria-hidden={labelled ? undefined : true}
      {...rest}
    >
      {BODIES[name]}
    </svg>
  );
}

/** `<Icon name="fold" />` */
export function Icon({ name, ...props }: IconProps & { name: IconName }): ReactElement {
  return renderIcon(name, props);
}

/** Every icon as its own component: `<Icons.fold size={20} />`. */
export const Icons = {} as Record<IconName, (props: IconProps) => ReactElement>;
for (const name of ICON_NAMES) {
  const Component = (props: IconProps): ReactElement => renderIcon(name, props);
  Component.displayName = `Icon(${name})`;
  Icons[name] = Component;
}
