import React, { useEffect } from 'react';
import { clsx } from 'clsx';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'md',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
    '2xl': 'max-w-4xl',
    full: 'max-w-6xl',
  }[maxWidth];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4 text-center sm:p-6">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-charcoal-950/50 backdrop-blur-xs transition-opacity" 
          onClick={onClose} 
        />

        {/* Modal Window */}
        <div className={clsx(
          'relative transform overflow-hidden rounded-xl bg-white text-left shadow-2xl transition-all sm:my-8 w-full border border-charcoal-200 z-10 flex flex-col max-h-[90vh]',
          maxWidthClass
        )}>
          {/* Sticky Header */}
          <div className="flex items-center justify-between border-b border-charcoal-200 px-6 py-4 bg-cream-50/70 shrink-0">
            <div>
              <h3 className="text-base font-bold text-charcoal-900 leading-snug">{title}</h3>
              {subtitle && <p className="text-xs text-charcoal-500 mt-0.5">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              type="button"
              className="text-charcoal-400 hover:text-charcoal-700 rounded-md p-1.5 hover:bg-charcoal-100 transition-colors shrink-0"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="px-6 py-5 overflow-y-auto flex-1">
            {children}
          </div>

          {/* Sticky Footer */}
          {footer && (
            <div className="border-t border-charcoal-200 px-6 py-3.5 bg-cream-50/50 flex items-center justify-end gap-3 shrink-0">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
