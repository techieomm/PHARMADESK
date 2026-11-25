import React from 'react';
import { clsx } from 'clsx';

export interface ToolbarProps {
  children: React.ReactNode;
  className?: string;
}

export const Toolbar: React.FC<ToolbarProps> = ({ children, className }) => {
  return (
    <div
      className={clsx(
        'w-full bg-white border border-charcoal-200 rounded-lg p-3 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3',
        className
      )}
    >
      {children}
    </div>
  );
};
