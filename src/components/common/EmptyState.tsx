import React from 'react';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <div className={`text-center py-12 px-4 rounded-md border border-dashed border-charcoal-200 bg-white/60 ${className}`}>
      {icon && (
        <div className="mx-auto w-12 h-12 flex items-center justify-center rounded-full bg-cream-100 text-brand-600 mb-3">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-charcoal-800">{title}</h3>
      <p className="mt-1 text-sm text-charcoal-500 max-w-sm mx-auto">{description}</p>
      {actionLabel && onAction && (
        <div className="mt-4">
          <Button onClick={onAction} size="sm">
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
};
