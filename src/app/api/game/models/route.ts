import { NextResponse } from 'next/server';
import { getAnthropicApiKey, getOpenAIApiKey, getGeminiApiKey } from '@/lib/env';
import { AVAILABLE_MODELS } from '@/lib/models';
import type { ModelProvider } from '@/types/game';

export async function GET() {
  const keys: Record<ModelProvider, boolean> = {
    anthropic: !!getAnthropicApiKey(),
    openai: !!getOpenAIApiKey(),
    gemini: !!getGeminiApiKey(),
  };

  const models = AVAILABLE_MODELS.map(m => ({
    ...m,
    available: keys[m.provider],
  }));

  return NextResponse.json({ models });
}
