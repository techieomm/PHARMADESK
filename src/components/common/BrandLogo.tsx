import React from 'react';
import { useBranding } from '@/context/BrandingContext';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 'md', className = '' }) => {
  const { logoUrl, pharmacyName } = useBranding();

  const sizeClasses = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-9 h-9 text-base',
    lg: 'w-12 h-12 text-xl',
  }[size];

  if (logoUrl) {
    return (
      <div
        className={`${sizeClasses} rounded-md bg-white border border-charcoal-200 flex items-center justify-center overflow-hidden shadow-xs shrink-0 ${className}`}
      >
        <img
          src={logoUrl}
          alt={`${pharmacyName} Logo`}
          className="w-full h-full object-contain p-0.5"
        />
      </div>
    );
  }

  return (
    <div
      className={`${sizeClasses} rounded-md bg-charcoal-900 flex items-center justify-center text-brand-500 font-bold tracking-wider border border-charcoal-800 shadow-xs shrink-0 ${className}`}
      aria-label={pharmacyName}
    >
      BP
    </div>
  );
};
