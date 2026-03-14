import { GoogleGenAI, type Tool as GeminiTool } from '@google/genai';
import { getGeminiApiKey } from '../env';
import type { LLMProvider, ModelResponse, ToolResult } from './types';
import type { Tool as McpToolDef } from '@modelcontextprotocol/sdk/types.js';
import { nanoid } from 'nanoid';

// Gemini content types (simplified from SDK)
interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: { result: string } };
  thoughtSignature?: string; // Required for Gemini 3.x thinking models
}

interface GeminiContent {
  role: string;
  parts: GeminiPart[];
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

export class GeminiProvider implements LLMProvider {
  readonly provider = 'gemini';
  readonly modelId: string;
  private ai: GoogleGenAI;
  private tools: GeminiTool[] = [];
  private toolDefsJson = '';
  private contents: GeminiContent[] = [];

  constructor(modelId: string) {
    this.modelId = modelId;
    const key = getGeminiApiKey();
    if (!key) throw new Error('GEMINI_API_KEY not set in .env.local');
    this.ai = new GoogleGenAI({ apiKey: key });
  }

  initTools(mcpTools: McpToolDef[]): void {
    const declarations = mcpTools.map(t => ({
      name: t.name,
      description: t.description ?? '',
      parameters: t.inputSchema as Record<string, unknown>,
    }));
    this.tools = [{ functionDeclarations: declarations }] as GeminiTool[];
    this.toolDefsJson = JSON.stringify(declarations);
  }

  initMessages(taskPrompt: string): void {
    this.contents = [
      { role: 'user', parts: [{ text: `TASK: ${taskPrompt}` }] },
    ];
  }

  async call(signal: AbortSignal): Promise<ModelResponse> {
    // Gemini SDK doesn't natively accept AbortSignal — use Promise.race
    const abortPromise = new Promise<never>((_, reject) => {
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
      signal.addEventListener('abort', onAbort, { once: true });
    });

    // Retry on 429 rate limit errors (free tier: 5 req/min)
    const MAX_RETRIES = 3;
    let response: any;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const apiPromise = this.ai.models.generateContent({
          model: this.modelId,
          contents: this.contents as any, // SDK types are strict about Part unions
          config: {
            tools: this.tools,
            systemInstruction: SYSTEM_PROMPT,
          },
        });
        response = await Promise.race([apiPromise, abortPromise]);
        break;
      } catch (err: any) {
        const is429 = err?.message?.includes('429') || err?.status === 429 ||
          err?.message?.includes('RESOURCE_EXHAUSTED');
        if (is429 && attempt < MAX_RETRIES) {
          // Extract retry delay from error, default to 60s
          const delayMatch = err.message?.match(/retryDelay.*?(\d+)s/);
          const delaySec = delayMatch ? parseInt(delayMatch[1], 10) : 60;
          console.log(`[gemini] Rate limited, retrying in ${delaySec}s (attempt ${attempt + 1}/${MAX_RETRIES})...`);
          await Promise.race([
            new Promise(r => setTimeout(r, delaySec * 1000)),
            abortPromise,
          ]);
          continue;
        }
        throw err;
      }
    }

    // Use raw response parts to preserve thoughtSignature fields (required by Gemini 3.x)
    const rawParts: GeminiPart[] =
      (response.candidates?.[0]?.content?.parts as GeminiPart[] | undefined) ?? [];

    let reasoningText = '';
    for (const part of rawParts) {
      if (part.text) {
        reasoningText += part.text;
      }
    }
    reasoningText = reasoningText.trim();

    const functionCalls: Array<{ name?: string; args?: Record<string, unknown> }> = response.functionCalls ?? [];
    const toolCalls = functionCalls
      .filter(fc => fc.name)
      .map(fc => ({
        id: nanoid(12),
        name: fc.name!,
        arguments: (fc.args ?? {}) as Record<string, unknown>,
      }));

    // Append model turn using raw parts (preserves thoughtSignature)
    if (rawParts.length > 0) {
      this.contents.push({ role: 'model', parts: rawParts });
    }

    const isComplete = reasoningText.toLowerCase().includes('task complete') && toolCalls.length === 0;

    return { toolCalls, reasoningText, isComplete };
  }

  appendToolResults(results: ToolResult[]): void {
    // Gemini expects function responses as user-role parts matched by name
    const parts: GeminiPart[] = results.map(r => ({
      functionResponse: {
        name: r.toolName,
        response: { result: r.content },
      },
    }));
    this.contents.push({ role: 'user', parts });
  }

  getConversationSnapshot() {
    return {
      messages: JSON.stringify(this.contents),
      toolDefinitions: this.toolDefsJson,
    };
  }
}
