'use client';

import { useState, useEffect, useRef } from 'react';
import { getHealthColor } from '@/lib/format';

export function useHealthBar(health: number) {
  const [shaking, setShaking] = useState(false);
  const prevHealth = useRef(health);

  useEffect(() => {
    if (health >= prevHealth.current) {
      prevHealth.current = health;
      return;
    }

    prevHealth.current = health;
    let cancelled = false;

    const frameId = requestAnimationFrame(() => {
      if (!cancelled) setShaking(true);
    });

    const timeoutId = setTimeout(() => {
      if (!cancelled) setShaking(false);
    }, 450);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      clearTimeout(timeoutId);
    };
  }, [health]);

  const color = getHealthColor(health);
  const isCritical = health < 20;

  return { shaking, color, isCritical };
}
