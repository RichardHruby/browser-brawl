import type { ModelProvider, ModelId } from '@/types/game';

export interface ModelConfig {
  provider: ModelProvider;
  modelId: ModelId;
  displayName: string;
  /** If true, the model is not yet open — clicking it shows the waitlist prompt */
  gated?: boolean;
}

export const AVAILABLE_MODELS: ModelConfig[] = [
  { provider: 'anthropic', modelId: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6' },
  { provider: 'anthropic', modelId: 'claude-opus-4-6', displayName: 'Claude Opus 4.6', gated: true },
  { provider: 'openai', modelId: 'gpt-5-mini', displayName: 'GPT-5 Mini' },
  { provider: 'openai', modelId: 'gpt-5.4', displayName: 'GPT-5.4', gated: true },
  { provider: 'gemini', modelId: 'gemini-3-flash-preview', displayName: 'Gemini 3 Flash' },
  { provider: 'gemini', modelId: 'gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro', gated: true },
  { provider: 'xai', modelId: 'grok-4-1-fast-reasoning', displayName: 'Grok 4.1 Fast' },
  { provider: 'xai', modelId: 'grok-4-0709', displayName: 'Grok 4', gated: true },
];

export const DEFAULT_MODEL: ModelConfig = AVAILABLE_MODELS.find(m => !m.gated)!;

/** Provider display names and colors for the UI */
export const PROVIDER_META: Record<ModelProvider, { label: string; color: string }> = {
  anthropic: { label: 'Anthropic', color: '#d4a574' },
  openai: { label: 'OpenAI', color: '#10a37f' },
  gemini: { label: 'Google', color: '#4285f4' },
  xai: { label: 'xAI', color: '#e5382a' },
};
