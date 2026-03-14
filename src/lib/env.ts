import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Load a key from .env.local, falling back to process.env.
 * Next.js loads .env.local but won't override existing shell env vars,
 * so this ensures .env.local takes priority.
 */
function loadFromEnvLocal(key: string): string | undefined {
  try {
    const envPath = resolve(process.cwd(), '.env.local');
    const envFile = readFileSync(envPath, 'utf-8');
    for (const line of envFile.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const k = trimmed.slice(0, eqIndex).trim();
      const v = trimmed.slice(eqIndex + 1).trim();
      if (k === key) return v;
    }
  } catch {
    // .env.local not found — fall through
  }
  return undefined;
}

export function getAnthropicApiKey(): string | undefined {
  return loadFromEnvLocal('ANTHROPIC_API_KEY') ?? process.env.ANTHROPIC_API_KEY;
}

export function getLaminarApiKey(): string | undefined {
  return loadFromEnvLocal('LMNR_PROJECT_API_KEY') ?? process.env.LMNR_PROJECT_API_KEY;
}

export function getBrowserUseApiKey(): string | undefined {
  return loadFromEnvLocal('BROWSER_USE_API_KEY') ?? process.env.BROWSER_USE_API_KEY;
}

export function getOpenAIApiKey(): string | undefined {
  return loadFromEnvLocal('OPENAI_API_KEY') ?? process.env.OPENAI_API_KEY;
}

export function getGeminiApiKey(): string | undefined {
  return loadFromEnvLocal('GEMINI_API_KEY') ?? process.env.GEMINI_API_KEY;
}

