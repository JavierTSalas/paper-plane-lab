import type { AnchorHTMLAttributes, HTMLAttributes, ReactElement } from 'react';
import { cx } from './cx';
import './Card.css';

export type Tone = 'neutral' | 'accent' | 'sage' | 'sky' | 'mustard' | 'plum' | 'rose';

export interface CardStyleOptions {
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** `default` = card surface; `sunken` = recessed paper; colour tones = soft washes. */
  tone?: 'default' | 'sunken' | Exclude<Tone, 'neutral'>;
  /** Hover lift and press feedback. Automatic for link cards. */
  interactive?: boolean;
}

export interface CardProps extends HTMLAttributes<HTMLElement>, CardStyleOptions {
  as?: 'div' | 'section' | 'article' | 'aside' | 'li';
}

function cardClass({ padding = 'md', tone = 'default', interactive = false }: CardStyleOptions): string {
  return cx('ppl-card', `ppl-card--pad-${padding}`, tone !== 'default' && `ppl-card--${tone}`, interactive && 'ppl-card--interactive');
}

export function Card({ as: Tag = 'div', padding, tone, interactive, className, ...rest }: CardProps): ReactElement {
  return <Tag className={cx(cardClass({ padding, tone, interactive }), className)} {...rest} />;
}

export interface CardLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement>, Omit<CardStyleOptions, 'interactive'> {
  href: string;
}

/** A whole card that navigates. Keep the content phrasing-level (no buttons inside). */
export function CardLink({ padding, tone, className, ...rest }: CardLinkProps): ReactElement {
  return <a className={cx(cardClass({ padding, tone, interactive: true }), 'ppl-card--link', className)} {...rest} />;
}
