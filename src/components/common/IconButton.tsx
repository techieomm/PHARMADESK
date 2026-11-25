import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  'aria-label': string;
  tooltip?: string;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(({
  children,
  className,
  variant = 'ghost',
  size = 'md',
  isLoading = false,
  disabled,
  type = 'button',
  tooltip,
  ...props
}, ref) => {
  const baseStyles = 'inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed select-none rounded-md shrink-0';

  const variants = {
    primary: 'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 shadow-xs border border-brand-600',
    secondary: 'bg-charcoal-800 text-white hover:bg-charcoal-900 border border-charcoal-800 shadow-xs',
    outline: 'bg-white text-charcoal-700 border border-charcoal-300 hover:bg-cream-50 hover:border-charcoal-400 shadow-xs',
    danger: 'bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200',
    ghost: 'bg-transparent text-charcoal-600 hover:bg-cream-100 hover:text-charcoal-900 border border-transparent',
  };

  const sizes = {
    sm: 'w-8 h-8 p-1 text-xs',
    md: 'w-10 h-10 p-2 text-sm',
    lg: 'w-12 h-12 p-2.5 text-base',
  };

  return (
    <button
      ref={ref}
      type={type}
      title={tooltip}
      className={twMerge(clsx(baseStyles, variants[variant], sizes[size], className))}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <svg className="animate-spin h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      ) : (
        children
      )}
    </button>
  );
});

IconButton.displayName = 'IconButton';
