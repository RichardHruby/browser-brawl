'use client';

import { useState, useEffect, useRef } from 'react';
import { getHealthColor } from '@/lib/format';

export function useHealthBar(health: number) {
  const [shaking, setShaking] = useState(false);
  const [ghostHealth, setGhostHealth] = useState(health);
  const prevHealth = useRef(health);
  const ghostTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (health >= prevHealth.current) {
      prevHealth.current = health;
      const syncFrame = requestAnimationFrame(() => {
        if (!cancelled) setGhostHealth(health);
      });
      return () => {
        cancelled = true;
        cancelAnimationFrame(syncFrame);
      };
    }

    // Health dropped — trigger shake + ghost effect
    prevHealth.current = health;

    const frameId = requestAnimationFrame(() => {
      if (!cancelled) setShaking(true);
    });

    const shakeTimer = setTimeout(() => {
      if (!cancelled) setShaking(false);
    }, 450);

    // Ghost bar: hold at old width, then drain after delay
    if (ghostTimerRef.current) clearTimeout(ghostTimerRef.current);
    ghostTimerRef.current = setTimeout(() => {
      if (!cancelled) setGhostHealth(health);
    }, 800);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      clearTimeout(shakeTimer);
      if (ghostTimerRef.current) clearTimeout(ghostTimerRef.current);
    };
  }, [health]);

  const color = getHealthColor(health);
  const isCritical = health < 20;

  return { shaking, color, isCritical, ghostHealth };
}
