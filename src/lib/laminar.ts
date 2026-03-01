import { getLaminarApiKey } from './env';

let initialized = false;

/**
 * Initialize Laminar tracing (idempotent).
 * Auto-instruments Anthropic SDK calls to capture full request/response traces.
 * Call this once before any Anthropic client is created.
 *
 * Uses eval('require') to completely hide the import from Turbopack's static
 * analysis — Turbopack otherwise traces into @lmnr-ai/lmnr → esbuild and
 * chokes on the .exe / .md files inside @esbuild/win32-x64.
 */
export function initLaminar(): void {
  if (initialized) return;

  const apiKey = getLaminarApiKey();
  if (!apiKey) {
    console.warn('[laminar] LMNR_PROJECT_API_KEY not set — LLM tracing disabled');
    initialized = true;
    return;
  }

  try {
    // eslint-disable-next-line no-eval
    const lmnr = eval('require')('@lmnr-ai/lmnr');
    // Must pass Anthropic module to instrumentModules for auto-instrumentation
    // eslint-disable-next-line no-eval
    const Anthropic = eval('require')('@anthropic-ai/sdk');
    lmnr.Laminar.initialize({
      projectApiKey: apiKey,
      instrumentModules: { anthropic: Anthropic },
    });
    console.log('[laminar] Tracing initialized with Anthropic instrumentation');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[laminar] Failed to load — tracing disabled:', msg);
  }

  initialized = true;
}
