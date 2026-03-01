'use client';

import { useEffect, useRef } from 'react';
import type { SSEEnvelope } from '@/types/events';

type Handler = (envelope: SSEEnvelope) => void;

export function useGameSSE(sessionId: string | null, onEvent: Handler) {
  const handlerRef = useRef(onEvent);

  useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!sessionId) return;

    const es = new EventSource(`/api/game/${sessionId}/events`);

    es.onmessage = (e) => {
      try {
        const envelope: SSEEnvelope = JSON.parse(e.data);
        handlerRef.current(envelope);
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      // Browser will auto-reconnect
    };

    return () => {
      es.close();
    };
  }, [sessionId]);
}
