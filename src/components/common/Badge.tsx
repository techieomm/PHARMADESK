import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 
    | 'default' 
    | 'success' 
    | 'warning' 
    | 'danger' 
    | 'brand' 
    | 'neutral' 
    | 'info' 
    | 'schedule_h' 
    | 'schedule_h1' 
    | 'schedule_x' 
    | 'narcotic' 
    | 'otc';
  size?: 'sm' | 'md';
  dot?: boolean;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  dot = false,
  className,
}) => {
  const base = 'inline-flex items-center font-semibold rounded-md border tracking-wide uppercase shrink-0';

  const sizes = {
    sm: 'px-1.5 py-0.5 text-[10px] gap-1',
    md: 'px-2 py-0.5 text-xs gap-1.5',
  };

  const variants = {
    default: 'bg-charcoal-100 text-charcoal-800 border-charcoal-300',
    success: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    warning: 'bg-amber-50 text-amber-800 border-amber-300',
    danger: 'bg-rose-50 text-rose-800 border-rose-300',
    brand: 'bg-brand-50 text-brand-800 border-brand-300',
    neutral: 'bg-charcoal-50 text-charcoal-600 border-charcoal-200',
    info: 'bg-sky-50 text-sky-800 border-sky-300',
    // Indian Pharmacy Drug Schedule regulatory badges:
    otc: 'bg-teal-50 text-teal-800 border-teal-300',
    schedule_h: 'bg-amber-100 text-amber-900 border-amber-400 font-bold',
    schedule_h1: 'bg-rose-100 text-rose-900 border-rose-400 font-bold',
    schedule_x: 'bg-purple-100 text-purple-900 border-purple-400 font-bold',
    narcotic: 'bg-red-900 text-white border-red-950 font-black',
  };

  const dotColors = {
    default: 'bg-charcoal-400',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-rose-500',
    brand: 'bg-brand-500',
    neutral: 'bg-charcoal-400',
    info: 'bg-sky-500',
    otc: 'bg-teal-500',
    schedule_h: 'bg-amber-600',
    schedule_h1: 'bg-rose-600',
    schedule_x: 'bg-purple-600',
    narcotic: 'bg-white',
  };

  return (
    <span className={twMerge(clsx(base, sizes[size], variants[variant], className))}>
      {dot && <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', dotColors[variant])} />}
      <span>{children}</span>
    </span>
  );
};
