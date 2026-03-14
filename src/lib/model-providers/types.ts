import type { Tool as McpToolDef } from '@modelcontextprotocol/sdk/types.js';

/** Result of a single model call */
export interface ModelResponse {
  /** Tool calls extracted from the model response */
  toolCalls: ToolCall[];
  /** Reasoning/text content (not tool calls) */
  reasoningText: string;
  /** Whether the response signals task completion */
  isComplete: boolean;
  /** Usage info for logging */
  usage?: { inputTokens: number; outputTokens: number };
}

export interface ToolCall {
  /** Provider-specific ID for linking results back */
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  toolName: string;
  content: string;
  isError: boolean;
}

/** Abstraction over model-specific message arrays and API calls */
export interface LLMProvider {
  /** Provider identifier */
  readonly provider: string;
  /** Model ID string for the API call */
  readonly modelId: string;

  /** Convert MCP tools into provider-specific tool format. Called once at loop start. */
  initTools(mcpTools: McpToolDef[]): void;

  /** Build the initial messages (system prompt + task). Called once. */
  initMessages(taskPrompt: string): void;

  /** Call the model and return parsed response. */
  call(signal: AbortSignal): Promise<ModelResponse>;

  /** Append tool results to the conversation. Called after MCP tool execution. */
  appendToolResults(results: ToolResult[]): void;

  /** Get serializable messages + tool defs for training data persistence */
  getConversationSnapshot(): { messages: string; toolDefinitions: string };
}
