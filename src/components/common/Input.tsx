import React, { forwardRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  reserveErrorSpace?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  size = 'md',
  reserveErrorSpace = false,
  className,
  id,
  disabled,
  ...props
}, ref) => {
  const inputId = id || (label ? label.toLowerCase().replace(/[^a-z0-9]/g, '-') : undefined);

  const sizeClasses = {
    sm: 'h-8 text-xs',
    md: 'h-10 text-sm',
    lg: 'h-12 text-base',
  }[size];

  const paddingLeft = leftIcon ? (size === 'sm' ? 'pl-8' : size === 'lg' ? 'pl-11' : 'pl-9') : 'pl-3';
  const paddingRight = rightIcon ? (size === 'sm' ? 'pr-8' : size === 'lg' ? 'pr-11' : 'pr-9') : 'pr-3';

  return (
    <div className="w-full flex flex-col">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold text-charcoal-700 uppercase tracking-wider mb-1.5 select-none">
          {label}
        </label>
      )}
      <div className="relative rounded-md shadow-xs">
        {leftIcon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-charcoal-400">
            {leftIcon}
          </div>
        )}
        <input
          id={inputId}
          ref={ref}
          disabled={disabled}
          className={twMerge(
            clsx(
              'block w-full rounded-md border border-charcoal-300 text-charcoal-900 placeholder-charcoal-400 bg-white transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500',
              'disabled:bg-charcoal-50 disabled:text-charcoal-400 disabled:cursor-not-allowed',
              sizeClasses,
              paddingLeft,
              paddingRight,
              error ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20' : 'hover:border-charcoal-400',
              className
            )
          )}
          {...props}
        />
        {rightIcon && (
          <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-charcoal-400">
            {rightIcon}
          </div>
        )}
      </div>
      {(error || helperText || reserveErrorSpace) && (
        <div className="min-h-[18px] mt-1">
          {error ? (
            <p className="text-xs text-rose-600 font-medium leading-none">{error}</p>
          ) : helperText ? (
            <p className="text-xs text-charcoal-500 leading-none">{helperText}</p>
          ) : null}
        </div>
      )}
    </div>
  );
});

Input.displayName = 'Input';
