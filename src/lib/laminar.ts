/**
 * Laminar tracing is now initialized via Next.js instrumentation.ts hook
 * at server startup — no per-file initialization needed.
 *
 * This function is kept as a no-op so existing call sites don't break.
 * It can be removed once all initLaminar() calls are cleaned up.
 */
export function initLaminar(): void {
  // no-op — handled by instrumentation.ts
}
