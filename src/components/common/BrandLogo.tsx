import React from 'react';
import { useBranding } from '@/context/BrandingContext';

interface BrandLogoProps {
  variant?: 'full' | 'icon';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'full',
  size = 'md',
  className = '',
}) => {
  const { logoUrl, iconUrl, pharmacyName } = useBranding();

  if (variant === 'icon') {
    const iconSize = {
      sm: 'w-8 h-8',
      md: 'w-10 h-10',
      lg: 'w-12 h-12',
    }[size];

    return (
      <div
        className={`${iconSize} rounded-md bg-white border border-charcoal-200 flex items-center justify-center overflow-hidden shadow-xs shrink-0 ${className}`}
      >
        <img
          src={iconUrl}
          alt={pharmacyName}
          className="w-full h-full object-contain p-1"
        />
      </div>
    );
  }

  const fullHeight = {
    sm: 'h-8',
    md: 'h-10',
    lg: 'h-14',
  }[size];

  return (
    <img
      src={logoUrl}
      alt={pharmacyName}
      className={`${fullHeight} w-auto object-contain select-none shrink-0 ${className}`}
    />
  );
};
