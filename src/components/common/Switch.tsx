import React from 'react';
import { clsx } from 'clsx';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  id?: string;
  size?: 'sm' | 'md';
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  id,
  size = 'md',
}) => {
  const switchId = id || (label ? label.toLowerCase().replace(/[^a-z0-9]/g, '-') : undefined);

  const dimensions = size === 'sm' 
    ? { track: 'w-7 h-4', thumb: 'w-3 h-3', translate: 'translate-x-3' }
    : { track: 'w-10 h-5', thumb: 'w-4 h-4', translate: 'translate-x-5' };

  return (
    <div className="flex items-center justify-between gap-3">
      {(label || description) && (
        <label htmlFor={switchId} className={clsx('flex flex-col cursor-pointer select-none', disabled && 'opacity-60 cursor-not-allowed')}>
          {label && <span className="text-sm font-medium text-charcoal-800">{label}</span>}
          {description && <span className="text-xs text-charcoal-500">{description}</span>}
        </label>
      )}
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
          'focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:ring-offset-1',
          checked ? 'bg-brand-500' : 'bg-charcoal-300',
          disabled && 'opacity-50 cursor-not-allowed',
          dimensions.track
        )}
      >
        <span
          className={clsx(
            'pointer-events-none inline-block rounded-full bg-white shadow-xs transform ring-0 transition duration-200 ease-in-out',
            checked ? dimensions.translate : 'translate-x-0',
            dimensions.thumb
          )}
        />
      </button>
    </div>
  );
};
