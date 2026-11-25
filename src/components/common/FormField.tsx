import React from 'react';
import { clsx } from 'clsx';

export interface FormFieldProps {
  label?: React.ReactNode;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  optional?: boolean;
  reserveSpace?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  htmlFor,
  error,
  hint,
  required = false,
  optional = false,
  reserveSpace = true,
  children,
  className,
}) => {
  return (
    <div className={clsx('w-full flex flex-col', className)}>
      {label && (
        <div className="flex items-center justify-between mb-1.5 min-h-[18px]">
          <label htmlFor={htmlFor} className="block text-xs font-semibold text-charcoal-700 uppercase tracking-wider select-none">
            {label}
            {required && <span className="text-rose-500 ml-1 font-bold">*</span>}
          </label>
          {optional && <span className="text-[11px] text-charcoal-400 font-normal">Optional</span>}
        </div>
      )}

      <div className="w-full">{children}</div>

      {(error || hint || reserveSpace) && (
        <div className="min-h-[18px] mt-1 flex items-center">
          {error ? (
            <p className="text-xs text-rose-600 font-medium leading-none">{error}</p>
          ) : hint ? (
            <p className="text-xs text-charcoal-500 leading-none">{hint}</p>
          ) : null}
        </div>
      )}
    </div>
  );
};
