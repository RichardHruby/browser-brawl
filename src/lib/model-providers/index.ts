import type { LLMProvider } from './types';
import type { ModelProvider, ModelId } from '@/types/game';
import { AnthropicProvider } from './anthropic-provider';
import { OpenAIProvider } from './openai-provider';
import { GeminiProvider } from './gemini-provider';

export function createModelProvider(provider: ModelProvider, modelId: ModelId): LLMProvider {
  switch (provider) {
    case 'anthropic':
      return new AnthropicProvider(modelId);
    case 'openai':
      return new OpenAIProvider(modelId);
    case 'gemini':
      return new GeminiProvider(modelId);
    default:
      throw new Error(`Unknown model provider: ${provider}`);
  }
}

export type { LLMProvider, ModelResponse, ToolCall, ToolResult } from './types';
