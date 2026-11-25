import React from 'react';
import { clsx } from 'clsx';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  className,
}) => {
  return (
    <div className={clsx('text-center py-12 px-6 rounded-lg border-2 border-dashed border-charcoal-200 bg-white/70 flex flex-col items-center justify-center', className)}>
      {icon && (
        <div className="w-12 h-12 flex items-center justify-center rounded-full bg-cream-100 text-brand-600 mb-3.5 border border-cream-200">
          {icon}
        </div>
      )}
      <h3 className="text-base font-bold text-charcoal-900 tracking-tight">{title}</h3>
      <p className="mt-1 text-sm text-charcoal-500 max-w-sm leading-relaxed">{description}</p>
      {(actionLabel || secondaryActionLabel) && (
        <div className="mt-5 flex items-center gap-3">
          {secondaryActionLabel && onSecondaryAction && (
            <Button onClick={onSecondaryAction} variant="outline" size="sm">
              {secondaryActionLabel}
            </Button>
          )}
          {actionLabel && onAction && (
            <Button onClick={onAction} variant="primary" size="sm">
              {actionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
