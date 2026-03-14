import { getXAIApiKey } from '../env';
import { OpenAIProvider } from './openai-provider';

/**
 * xAI (Grok) provider — uses OpenAI-compatible Chat Completions API
 * at https://api.x.ai/v1/chat/completions
 */
export class XAIProvider extends OpenAIProvider {
  override readonly provider = 'xai';
  protected override providerLabel = 'xAI';

  constructor(modelId: string) {
    const key = getXAIApiKey();
    if (!key) throw new Error('XAI_API_KEY not set in .env.local');
    super(modelId, key, 'https://api.x.ai/v1/chat/completions');
  }
}
