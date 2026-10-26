import React, { useId } from 'react';

interface Props {
  size?: number;
  animated?: boolean;
  variant?: 'default' | 'cyber';
  className?: string;
}

/**
 * Purple IDE mark: an original rounded tile with a geometric P.
 * Drawn in-house; no Microsoft or VS Code artwork is used.
 */
const AppLogo: React.FC<Props> = ({ size = 24, animated = false, variant = 'default', className }) => {
  const rawId = useId();
  const id = `purple-logo-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const gradientId = `${id}-bg`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width={size}
      height={size}
      className={`app-logo ${animated ? 'app-logo-animated' : ''} ${className || ''}`}
      role="img"
      aria-label="Purple IDE"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          {variant === 'cyber' ? (
            <>
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="52%" stopColor="#7c3aed" />
              <stop offset="100%" stopColor="#ec4899" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#a78bfa" />
              <stop offset="46%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#6d28d9" />
            </>
          )}
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="240" height="240" rx="58" fill={`url(#${gradientId})`} />
      <rect x="9" y="9" width="238" height="238" rx="57" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="2" />
      <path
        d="M86 188V68h56c32 0 53 19 53 47s-21 47-53 47h-24v26H86Zm32-56h22c15 0 24-8 24-17s-9-17-24-17h-22v34Z"
        fill="#ffffff"
        fillRule="evenodd"
      />
    </svg>
  );
};

export default AppLogo;
