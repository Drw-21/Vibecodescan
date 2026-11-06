import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary';

/** One primary action per screen; at least 44 × 44 px so it is easy to tap. */
export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const look =
    variant === 'primary'
      ? 'bg-accent text-on-accent hover:opacity-90 disabled:opacity-50'
      : 'bg-transparent text-accent hover:bg-surface border border-separator';
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-button px-5 text-17 font-semibold transition-opacity duration-200 disabled:cursor-not-allowed ${look} ${className}`}
      {...props}
    />
  );
}
