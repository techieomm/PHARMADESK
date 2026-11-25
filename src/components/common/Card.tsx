import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  header?: React.ReactNode;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  header,
  title,
  subtitle,
  action,
  footer,
  noPadding = false,
  className,
  ...props
}) => {
  const hasHeader = header || title || action;

  return (
    <div
      className={twMerge(
        clsx(
          'bg-white border border-charcoal-200 rounded-lg shadow-xs transition-shadow flex flex-col',
          className
        )
      )}
      {...props}
    >
      {hasHeader && (
        <div className="px-5 py-3.5 border-b border-charcoal-100 flex items-center justify-between gap-3 shrink-0">
          {header ? (
            header
          ) : (
            <div className="min-w-0">
              {title && <h3 className="text-sm font-bold text-charcoal-900 tracking-tight truncate">{title}</h3>}
              {subtitle && <p className="text-xs text-charcoal-500 mt-0.5 truncate">{subtitle}</p>}
            </div>
          )}
          {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={clsx('flex-1', noPadding ? '' : 'p-5')}>{children}</div>
      {footer && (
        <div className="px-5 py-3 border-t border-charcoal-100 bg-cream-50/50 rounded-b-lg shrink-0">
          {footer}
        </div>
      )}
    </div>
  );
};
