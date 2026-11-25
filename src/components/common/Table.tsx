import React from 'react';
import { clsx } from 'clsx';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render?: (row: T, index: number) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

export interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T, index: number) => string | number;
  density?: 'compact' | 'normal';
  stickyHeader?: boolean;
  zebra?: boolean;
  isLoading?: boolean;
  emptyState?: React.ReactNode;
  onRowClick?: (row: T) => void;
  className?: string;
  maxHeight?: string;
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  density = 'normal',
  stickyHeader = true,
  zebra = false,
  isLoading = false,
  emptyState,
  onRowClick,
  className,
  maxHeight,
}: TableProps<T>) {
  const cellPadding = density === 'compact' ? 'py-2 px-3 text-xs' : 'py-3.5 px-4 text-sm';
  const headerPadding = density === 'compact' ? 'py-2 px-3 text-[11px]' : 'py-3 px-4 text-xs';

  if (!isLoading && data.length === 0) {
    return (
      <div className="border border-charcoal-200 rounded-lg bg-white p-8">
        {emptyState || <EmptyState title="No records found" description="There is currently no data to display." />}
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'w-full overflow-x-auto border border-charcoal-200 rounded-lg bg-white shadow-xs',
        className
      )}
      style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}
    >
      <table className="w-full text-left border-collapse">
        <thead className={clsx(stickyHeader && 'sticky top-0 z-10 bg-cream-100/90 backdrop-blur-xs')}>
          <tr className="border-b border-charcoal-200">
            {columns.map((col) => (
              <th
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className={clsx(
                  headerPadding,
                  'font-semibold text-charcoal-700 uppercase tracking-wider',
                  col.align === 'right' && 'text-right',
                  col.align === 'center' && 'text-center',
                  col.headerClassName
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-charcoal-100">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, rIdx) => (
              <tr key={`skeleton-row-${rIdx}`}>
                {columns.map((col, cIdx) => (
                  <td key={`skeleton-cell-${cIdx}`} className={cellPadding}>
                    <div className="h-4 bg-charcoal-100 rounded animate-pulse w-3/4" />
                  </td>
                ))}
              </tr>
            ))
          ) : (
            data.map((row, index) => (
              <tr
                key={keyExtractor(row, index)}
                onClick={() => onRowClick && onRowClick(row)}
                className={clsx(
                  'transition-colors',
                  zebra && index % 2 === 1 && 'bg-cream-50/40',
                  onRowClick ? 'cursor-pointer hover:bg-brand-50/50' : 'hover:bg-cream-50/60'
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={clsx(
                      cellPadding,
                      'text-charcoal-800',
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center',
                      col.className
                    )}
                  >
                    {col.render ? col.render(row, index) : ((row as Record<string, unknown>)[col.key] as React.ReactNode)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
