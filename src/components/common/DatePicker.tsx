import React, { forwardRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Calendar } from 'lucide-react';

export interface DatePickerProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  helperText?: string;
  size?: 'sm' | 'md';
  reserveErrorSpace?: boolean;
}

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(({
  label,
  error,
  helperText,
  size = 'md',
  reserveErrorSpace = false,
  className,
  id,
  disabled,
  ...props
}, ref) => {
  const dateId = id || (label ? label.toLowerCase().replace(/[^a-z0-9]/g, '-') : undefined);

  const sizeClasses = {
    sm: 'h-8 text-xs',
    md: 'h-10 text-sm',
  }[size];

  return (
    <div className="w-full flex flex-col">
      {label && (
        <label htmlFor={dateId} className="block text-xs font-semibold text-charcoal-700 uppercase tracking-wider mb-1.5 select-none">
          {label}
        </label>
      )}
      <div className="relative rounded-md shadow-xs">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-charcoal-400">
          <Calendar className="w-4 h-4" />
        </div>
        <input
          id={dateId}
          ref={ref}
          type="date"
          disabled={disabled}
          className={twMerge(
            clsx(
              'block w-full rounded-md border border-charcoal-300 bg-white text-charcoal-900 transition-colors pl-9 pr-3',
              'focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500',
              'disabled:bg-charcoal-50 disabled:text-charcoal-400 disabled:cursor-not-allowed',
              sizeClasses,
              error ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20' : 'hover:border-charcoal-400',
              className
            )
          )}
          {...props}
        />
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

DatePicker.displayName = 'DatePicker';
