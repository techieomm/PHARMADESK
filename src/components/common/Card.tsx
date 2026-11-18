import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  header,
  footer,
  noPadding = false,
  className,
  ...props
}) => {
  return (
    <div
      className={twMerge(
        clsx(
          'bg-white border border-charcoal-200 rounded-md shadow-xs transition-shadow',
          className
        )
      )}
      {...props}
    >
      {header && (
        <div className="px-5 py-3.5 border-b border-charcoal-100 flex items-center justify-between">
          {header}
        </div>
      )}
      <div className={noPadding ? '' : 'p-5'}>{children}</div>
      {footer && (
        <div className="px-5 py-3 border-t border-charcoal-100 bg-cream-50/50 rounded-b-md">
          {footer}
        </div>
      )}
    </div>
  );
};
