import React from 'react';
import { clsx } from 'clsx';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

export interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  subtext?: string;
  trend?: {
    value: string | number;
    isPositive?: boolean;
    label?: string;
  };
  variant?: 'default' | 'brand' | 'success' | 'warning' | 'danger';
  isLoading?: boolean;
  className?: string;
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  subtext,
  trend,
  variant = 'default',
  isLoading = false,
  className,
  onClick,
}) => {
  const iconVariants = {
    default: 'bg-charcoal-100 text-charcoal-700',
    brand: 'bg-brand-50 text-brand-600 border border-brand-200',
    success: 'bg-emerald-50 text-emerald-600 border border-emerald-200',
    warning: 'bg-amber-50 text-amber-600 border border-amber-200',
    danger: 'bg-rose-50 text-rose-600 border border-rose-200',
  };

  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-white border border-charcoal-200 rounded-lg p-5 shadow-xs flex flex-col justify-between transition-all h-[116px]',
        onClick && 'cursor-pointer hover:border-brand-300 hover:shadow-card',
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-charcoal-500 uppercase tracking-wider truncate">
          {label}
        </span>
        {icon && (
          <div className={clsx('w-9 h-9 rounded-md flex items-center justify-center shrink-0', iconVariants[variant])}>
            {icon}
          </div>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-2 mt-1">
        {isLoading ? (
          <div className="h-7 w-24 bg-charcoal-100 rounded animate-pulse" />
        ) : (
          <span className="text-2xl font-bold text-charcoal-900 tracking-tight font-sans truncate">
            {value}
          </span>
        )}

        {trend && !isLoading && (
          <div
            className={clsx(
              'inline-flex items-center text-xs font-semibold px-1.5 py-0.5 rounded shrink-0',
              trend.isPositive === undefined
                ? 'text-charcoal-600 bg-charcoal-100'
                : trend.isPositive
                  ? 'text-emerald-700 bg-emerald-50'
                  : 'text-rose-700 bg-rose-50'
            )}
          >
            {trend.isPositive !== undefined && (
              trend.isPositive ? <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" /> : <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
            )}
            {trend.value}
          </div>
        )}
      </div>

      {(subtext || (trend && trend.label)) && !isLoading && (
        <p className="text-[11px] text-charcoal-400 truncate mt-0.5">
          {subtext || trend?.label}
        </p>
      )}
    </div>
  );
};
