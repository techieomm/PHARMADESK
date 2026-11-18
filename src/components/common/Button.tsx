import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed select-none rounded-md';

  const variants = {
    primary: 'bg-brand-400 text-charcoal-900 hover:bg-brand-500 font-semibold active:bg-brand-600 border border-brand-500/20 shadow-xs',
    secondary: 'bg-charcoal-800 text-white hover:bg-charcoal-900 border border-charcoal-700',
    outline: 'bg-white text-charcoal-800 border border-charcoal-200 hover:bg-cream-50 hover:border-charcoal-300',
    danger: 'bg-red-600 text-white hover:bg-red-700 border border-red-700',
    ghost: 'bg-transparent text-charcoal-700 hover:bg-cream-100 hover:text-charcoal-900',
  };

  const sizes = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5',
    md: 'text-sm px-3.5 py-2 gap-2',
    lg: 'text-base px-5 py-2.5 gap-2.5',
  };

  return (
    <button
      className={twMerge(clsx(baseStyles, variants[variant], sizes[size], className))}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
      {children}
    </button>
  );
};
