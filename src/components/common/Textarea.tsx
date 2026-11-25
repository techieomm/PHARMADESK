import React, { forwardRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  reserveErrorSpace?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({
  label,
  error,
  helperText,
  reserveErrorSpace = false,
  className,
  id,
  rows = 3,
  disabled,
  ...props
}, ref) => {
  const textareaId = id || (label ? label.toLowerCase().replace(/[^a-z0-9]/g, '-') : undefined);

  return (
    <div className="w-full flex flex-col">
      {label && (
        <label htmlFor={textareaId} className="block text-xs font-semibold text-charcoal-700 uppercase tracking-wider mb-1.5 select-none">
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        ref={ref}
        rows={rows}
        disabled={disabled}
        className={twMerge(
          clsx(
            'block w-full rounded-md border border-charcoal-300 bg-white p-3 text-sm text-charcoal-900 placeholder-charcoal-400 transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500',
            'disabled:bg-charcoal-50 disabled:text-charcoal-400 disabled:cursor-not-allowed',
            error ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20' : 'hover:border-charcoal-400',
            className
          )
        )}
        {...props}
      />
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

Textarea.displayName = 'Textarea';
