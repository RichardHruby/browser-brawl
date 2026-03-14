import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicApiKey } from '../env';
import type { LLMProvider, ModelResponse, ToolResult } from './types';
import type { Tool as McpToolDef } from '@modelcontextprotocol/sdk/types.js';

const SYSTEM_PROMPT = `You are a browser automation agent. Complete the following task using the browser tools available to you.

IMPORTANT:
- Use browser_snapshot to understand the current page state before acting.
- Use browser_navigate to go to URLs.
- Use browser_click to click elements (use the ref from snapshots).
- Use browser_type to type text into fields.
- When done, respond with a message saying "TASK COMPLETE" and describe what you accomplished.
- If you get stuck, try alternative approaches before giving up.
- Be methodical: snapshot first, then act.`;

export class AnthropicProvider implements LLMProvider {
  readonly provider = 'anthropic';
  readonly modelId: string;
  private client: Anthropic;
  private tools: Anthropic.Tool[] = [];
  private toolDefsJson = '';
  private messages: Anthropic.MessageParam[] = [];

  constructor(modelId: string = 'claude-sonnet-4-6') {
    this.modelId = modelId;
    this.client = new Anthropic({ apiKey: getAnthropicApiKey() });
  }

  initTools(mcpTools: McpToolDef[]): void {
    this.tools = mcpTools.map(t => ({
      name: t.name,
      description: t.description ?? '',
      input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
    }));
    this.toolDefsJson = JSON.stringify(this.tools);
  }

  initMessages(taskPrompt: string): void {
    this.messages = [{
      role: 'user',
      content: `${SYSTEM_PROMPT}\n\nTASK: ${taskPrompt}`,
    }];
  }

  async call(signal: AbortSignal): Promise<ModelResponse> {
    const response = await this.client.messages.create({
      model: this.modelId,
      max_tokens: 4096,
      tools: this.tools,
      messages: this.messages,
    }, { signal });

    // Push assistant content to conversation
    this.messages.push({ role: 'assistant', content: response.content });

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );
    const textBlocks = response.content.filter(
      (b): b is Anthropic.TextBlock => b.type === 'text'
    );

    const reasoningText = textBlocks.map(b => b.text).join('\n').trim();
    const isComplete = reasoningText.toLowerCase().includes('task complete') && toolUses.length === 0;

    return {
      toolCalls: toolUses.map(tu => ({
        id: tu.id,
        name: tu.name,
        arguments: tu.input as Record<string, unknown>,
      })),
      reasoningText,
      isComplete,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  appendToolResults(results: ToolResult[]): void {
    const toolResults: Anthropic.ToolResultBlockParam[] = results.map(r => ({
      type: 'tool_result' as const,
      tool_use_id: r.toolCallId,
      content: r.content,
      ...(r.isError ? { is_error: true } : {}),
    }));
    this.messages.push({ role: 'user', content: toolResults });
  }

  getConversationSnapshot() {
    return {
      messages: JSON.stringify(this.messages),
      toolDefinitions: this.toolDefsJson,
    };
  }
}
