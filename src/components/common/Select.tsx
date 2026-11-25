import React, { forwardRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  options?: SelectOption[];
  error?: string;
  helperText?: string;
  size?: 'sm' | 'md' | 'lg';
  reserveErrorSpace?: boolean;
  leftIcon?: React.ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(({
  label,
  options,
  error,
  helperText,
  size = 'md',
  reserveErrorSpace = false,
  leftIcon,
  className,
  id,
  children,
  disabled,
  ...props
}, ref) => {
  const selectId = id || (label ? label.toLowerCase().replace(/[^a-z0-9]/g, '-') : undefined);

  const sizeClasses = {
    sm: 'h-8 text-xs',
    md: 'h-10 text-sm',
    lg: 'h-12 text-base',
  }[size];

  const paddingLeft = leftIcon ? (size === 'sm' ? 'pl-8' : size === 'lg' ? 'pl-11' : 'pl-9') : 'pl-3';

  return (
    <div className="w-full flex flex-col">
      {label && (
        <label htmlFor={selectId} className="block text-xs font-semibold text-charcoal-700 uppercase tracking-wider mb-1.5 select-none">
          {label}
        </label>
      )}
      <div className="relative rounded-md shadow-xs">
        {leftIcon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-charcoal-400">
            {leftIcon}
          </div>
        )}
        <select
          id={selectId}
          ref={ref}
          disabled={disabled}
          className={twMerge(
            clsx(
              'block w-full appearance-none rounded-md border border-charcoal-300 bg-white text-charcoal-900 transition-colors pr-9',
              'focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500',
              'disabled:bg-charcoal-50 disabled:text-charcoal-400 disabled:cursor-not-allowed cursor-pointer',
              sizeClasses,
              paddingLeft,
              error ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20' : 'hover:border-charcoal-400',
              className
            )
          )}
          {...props}
        >
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-charcoal-400">
          <ChevronDown className="w-4 h-4" />
        </div>
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

Select.displayName = 'Select';
