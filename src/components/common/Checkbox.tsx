import React, { forwardRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  description?: string;
  error?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(({
  label,
  description,
  error,
  className,
  id,
  disabled,
  ...props
}, ref) => {
  const checkboxId = id || (typeof label === 'string' ? label.toLowerCase().replace(/[^a-z0-9]/g, '-') : undefined);

  return (
    <div className="flex flex-col">
      <label htmlFor={checkboxId} className={clsx('flex items-start gap-2.5 cursor-pointer select-none', disabled && 'opacity-60 cursor-not-allowed')}>
        <div className="flex items-center h-5">
          <input
            id={checkboxId}
            ref={ref}
            type="checkbox"
            disabled={disabled}
            className={twMerge(
              clsx(
                'w-4 h-4 rounded border-charcoal-300 text-brand-500 transition-colors',
                'focus:ring-2 focus:ring-brand-500/20 focus:ring-offset-1',
                'disabled:cursor-not-allowed',
                error ? 'border-rose-500' : 'hover:border-charcoal-400',
                className
              )
            )}
            {...props}
          />
        </div>
        {(label || description) && (
          <div className="flex flex-col">
            {label && <span className="text-sm font-medium text-charcoal-800 leading-snug">{label}</span>}
            {description && <span className="text-xs text-charcoal-500">{description}</span>}
          </div>
        )}
      </label>
      {error && <p className="mt-1 text-xs text-rose-600 font-medium">{error}</p>}
    </div>
  );
});

Checkbox.displayName = 'Checkbox';
