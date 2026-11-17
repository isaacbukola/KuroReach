import React from 'react';

interface BrandMarkProps {
  size?: number;
  className?: string;
}

export const BrandMark: React.FC<BrandMarkProps> = ({ size = 28, className = '' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="7" fill="#09090B" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="6.5" stroke="rgba(255,255,255,0.22)" />
      <path
        d="M16 9.5L22.5 18.5L16 24.5L9.5 18.5L16 9.5Z"
        stroke="#FFFFFF"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M16 9.5V24.5" stroke="#FFFFFF" strokeWidth="1.4" />
      <path
        d="M11.6 8.2C12.9 7 14.4 6.4 16 6.4C17.6 6.4 19.1 7 20.4 8.2"
        stroke="#FFFFFF"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
};
