import { getOpenAIApiKey } from '../env';
import type { LLMProvider, ModelResponse, ToolResult } from './types';
import type { Tool as McpToolDef } from '@modelcontextprotocol/sdk/types.js';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface OpenAITool {
  type: 'function';
  function: { name: string; description: string; parameters: unknown };
}

const SYSTEM_PROMPT = `You are a browser automation agent. Complete the following task using the browser tools available to you.

IMPORTANT:
- Use browser_snapshot to understand the current page state before acting.
- Use browser_navigate to go to URLs.
- Use browser_click to click elements (use the ref from snapshots).
- Use browser_type to type text into fields.
- When done, respond with a message saying "TASK COMPLETE" and describe what you accomplished.
- If you get stuck, try alternative approaches before giving up.
- Be methodical: snapshot first, then act.`;

export class OpenAIProvider implements LLMProvider {
  readonly provider: string = 'openai';
  readonly modelId: string;
  protected apiKey: string;
  protected apiUrl: string = 'https://api.openai.com/v1/chat/completions';
  protected providerLabel: string = 'OpenAI';
  private tools: OpenAITool[] = [];
  private toolDefsJson = '';
  private messages: OpenAIMessage[] = [];

  constructor(modelId: string, apiKey?: string, apiUrl?: string) {
    this.modelId = modelId;
    if (apiKey) {
      this.apiKey = apiKey;
    } else {
      const key = getOpenAIApiKey();
      if (!key) throw new Error('OPENAI_API_KEY not set in .env.local');
      this.apiKey = key;
    }
    if (apiUrl) this.apiUrl = apiUrl;
  }

  initTools(mcpTools: McpToolDef[]): void {
    this.tools = mcpTools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description ?? '',
        parameters: t.inputSchema,
      },
    }));
    this.toolDefsJson = JSON.stringify(this.tools);
  }

  initMessages(taskPrompt: string): void {
    this.messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `TASK: ${taskPrompt}` },
    ];
  }

  async call(signal: AbortSignal): Promise<ModelResponse> {
    const res = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelId,
        max_completion_tokens: 4096,
        tools: this.tools,
        messages: this.messages,
      }),
      signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${this.providerLabel} API ${res.status}: ${body}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    if (!choice) throw new Error(`${this.providerLabel} returned no choices`);
    const msg = choice.message;

    // Push assistant message to conversation
    this.messages.push(msg);

    const toolCalls = (msg.tool_calls ?? []).map(
      (tc: { id: string; function: { name: string; arguments: string } }) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
      })
    );

    const reasoningText = (msg.content ?? '').trim();
    const isComplete = reasoningText.toLowerCase().includes('task complete') && toolCalls.length === 0;

    return {
      toolCalls,
      reasoningText,
      isComplete,
      usage: data.usage ? {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
      } : undefined,
    };
  }

  appendToolResults(results: ToolResult[]): void {
    for (const r of results) {
      this.messages.push({
        role: 'tool',
        tool_call_id: r.toolCallId,
        content: r.content,
      });
    }
  }

  getConversationSnapshot() {
    return {
      messages: JSON.stringify(this.messages),
      toolDefinitions: this.toolDefsJson,
    };
  }
}
