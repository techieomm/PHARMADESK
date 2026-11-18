import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'brand' | 'neutral';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  className,
}) => {
  const base = 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border';

  const variants = {
    default: 'bg-charcoal-100 text-charcoal-800 border-charcoal-200',
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    warning: 'bg-amber-50 text-amber-800 border-amber-200',
    danger: 'bg-red-50 text-red-800 border-red-200',
    brand: 'bg-brand-50 text-brand-800 border-brand-200 font-semibold',
    neutral: 'bg-gray-100 text-gray-700 border-gray-200',
  };

  return (
    <span className={twMerge(clsx(base, variants[variant], className))}>
      {children}
    </span>
  );
};
