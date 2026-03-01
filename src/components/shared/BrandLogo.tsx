'use client';

import { GlitchText } from './GlitchText';

type LogoSize = 'xs' | 'sm' | 'md' | 'lg';

interface Props {
  size?: LogoSize;
  align?: 'left' | 'center';
}

const TITLE_CLASSES: Record<LogoSize, string> = {
  xs: 'text-lg sm:text-xl tracking-[0.16em]',
  sm: 'text-2xl sm:text-3xl tracking-[0.16em]',
  md: 'text-3xl sm:text-4xl tracking-[0.18em]',
  lg: 'text-4xl sm:text-5xl lg:text-6xl tracking-[0.15em] sm:tracking-[0.2em] lg:tracking-widest',
};

export function BrandLogo({ size = 'lg', align = 'center' }: Props) {
  return (
    <div className={align === 'left' ? 'text-left' : 'text-center'}>
      <h1 className={`font-display font-black mb-2 relative ${TITLE_CLASSES[size]}`}>
        <GlitchText text="BROWSER BRAWL" className="neon-cyan" />
      </h1>
    </div>
  );
}
