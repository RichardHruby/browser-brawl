export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Read LMNR key from .env.local (Next.js has already loaded it by this point)
    const apiKey = process.env.LMNR_PROJECT_API_KEY;
    if (!apiKey) {
      console.warn('[laminar] LMNR_PROJECT_API_KEY not set — LLM tracing disabled');
      return;
    }

    const { Laminar } = await import('@lmnr-ai/lmnr');
    const Anthropic = await import('@anthropic-ai/sdk');
    Laminar.initialize({
      projectApiKey: apiKey,
      instrumentModules: { anthropic: Anthropic },
    });
    console.log('[laminar] Tracing initialized with Anthropic instrumentation');
  }
}
