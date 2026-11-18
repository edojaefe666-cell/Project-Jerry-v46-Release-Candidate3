import { useState } from 'react';

interface OwnerAvatarProps {
  src: string;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<OwnerAvatarProps['size']>, string> = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-lg',
};

export function OwnerAvatar({ src, name, size = 'md', className = '' }: OwnerAvatarProps) {
  const [failed, setFailed] = useState(false);

  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  if (failed || !src) {
    return (
      <div
        aria-label={name}
        className={`${SIZE_CLASSES[size]} rounded-lg bg-slate-200 text-slate-700 font-semibold flex items-center justify-center shrink-0 border border-slate-300 ${className}`}
      >
        {initials || 'JR'}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`${name} — Jerry Visual Identity`}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${SIZE_CLASSES[size]} rounded-lg object-cover shrink-0 border border-slate-200 bg-slate-100 ${className}`}
    />
  );
}
