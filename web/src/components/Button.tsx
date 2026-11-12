import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'accent';

const LOOK: Record<Variant, string> = {
  primary: 'bg-contrast text-on-contrast hover:opacity-90 disabled:opacity-50',
  accent: 'bg-accent text-on-accent hover:opacity-90 disabled:opacity-50',
  secondary: 'glass text-ink hover:bg-surface disabled:opacity-60',
};

/** The shared look of every call to action: a pill at least 44 px tall, easy to tap. */
export function ctaClass(variant: Variant = 'primary'): string {
  return `pill min-w-11 disabled:cursor-not-allowed ${LOOK[variant]}`;
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" className={`${ctaClass(variant)} ${className}`} {...props} />;
}

/** A link that looks like a button. `data-cta` lets tests check every label starts with a verb. */
export function ButtonLink({
  variant = 'primary',
  className = '',
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant }) {
  return <a data-cta="" className={`${ctaClass(variant)} ${className}`} {...props} />;
}
