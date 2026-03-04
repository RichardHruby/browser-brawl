/**
 * Shared conversion logic for transforming Anthropic tool format to ShareGPT format
 * compatible with Qwen2.5-VL fine-tuning via Axolotl.
 *
 * Used by:
 *   - scripts/convert-to-sharegpt.ts (CLI)
 *   - src/app/api/export/training/route.ts (API route)
 */

// ── Types ──────────────────────────────────────────────────────────

export interface AnthropicToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface AnthropicToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock;

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

export interface RawTrajectory {
  gameId: string;
  task: {
    description: string;
    startUrl?: string;
    difficulty: string;
  };
  winner: string;
  winReason: string;
  durationMs: number;
  messages: AnthropicMessage[];
  toolDefinitions: AnthropicToolDef[];
  steps: {
    stepNumber: number;
    toolName?: string;
    screenshotBeforeId?: string;
    screenshotUrl?: string;
  }[];
  defenderActions: {
    actionNumber: number;
    disruptionId: string;
    disruptionName: string;
    description: string;
  }[];
}

export interface ShareGPTMessage {
  from: 'system' | 'human' | 'gpt' | 'tool';
  value: string;
}

export interface ShareGPTTrainingExample {
  conversations: ShareGPTMessage[];
  metadata: {
    gameId: string;
    task: string;
    difficulty: string;
    winner: string;
    winReason: string;
    durationMs: number;
    numSteps: number;
    numToolCalls: number;
    hadDisruptions: boolean;
    source: string;
  };
}

// ── Conversion logic ──────────────────────────────────────────────

/**
 * Convert Anthropic tool definitions to Qwen2.5 <tools> format.
 * Qwen expects OpenAI-style function definitions.
 */
export function convertToolDefs(tools: AnthropicToolDef[]): string {
  const openaiTools = tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
  return JSON.stringify(openaiTools);
}

/**
 * Build the system prompt with tool definitions in Qwen2.5 format.
 */
export function buildSystemPrompt(tools: AnthropicToolDef[]): string {
  const toolsJson = convertToolDefs(tools);
  return `You are a browser automation agent. Complete web tasks using the browser tools available to you.

# Tools

You may call one or more functions to assist with the user query.

You are provided with function signatures within <tools></tools> XML tags:
<tools>
${toolsJson}
</tools>

For each function call, return a json object with function name and arguments within <tool_call></tool_call> XML tags:
<tool_call>
{"name": "<function-name>", "arguments": <args-json-object>}
</tool_call>

# Instructions

- Use browser_snapshot to understand the current page state before acting.
- Use browser_navigate to go to URLs.
- Use browser_click to click elements (use the ref from snapshots).
- Use browser_type to type text into fields.
- When done, respond with "TASK COMPLETE" and describe what you accomplished.
- If you get stuck, try alternative approaches before giving up.
- Be methodical: snapshot first, then act.`;
}

/**
 * Convert a single Anthropic assistant message (with text + tool_use blocks)
 * to Qwen2.5 format with <tool_call> tags.
 */
export function convertAssistantMessage(
  content: AnthropicContentBlock[],
): string {
  const parts: string[] = [];

  for (const block of content) {
    if (block.type === 'text') {
      const text = (block as AnthropicTextBlock).text.trim();
      if (text) parts.push(text);
    } else if (block.type === 'tool_use') {
      const tu = block as AnthropicToolUseBlock;
      parts.push(
        `<tool_call>\n{"name": "${tu.name}", "arguments": ${JSON.stringify(tu.input)}}\n</tool_call>`,
      );
    }
  }

  return parts.join('\n');
}

/**
 * Convert Anthropic tool_result blocks to Qwen2.5 <tool_response> format.
 */
export function convertToolResults(
  content: AnthropicContentBlock[],
  messages: AnthropicMessage[],
  messageIndex: number,
): string {
  const parts: string[] = [];

  for (const block of content) {
    if (block.type === 'tool_result') {
      const tr = block as AnthropicToolResultBlock;
      // Find the corresponding tool_use to get the tool name
      const toolName = findToolName(tr.tool_use_id, messages, messageIndex);
      const responseContent = tr.is_error
        ? `Error: ${tr.content}`
        : tr.content;
      parts.push(
        `<tool_response>\n{"name": "${toolName}", "content": ${JSON.stringify(responseContent)}}\n</tool_response>`,
      );
    }
  }

  return parts.join('\n');
}

/**
 * Find the tool name for a given tool_use_id by searching backward through messages.
 */
function findToolName(
  toolUseId: string,
  messages: AnthropicMessage[],
  beforeIndex: number,
): string {
  for (let i = beforeIndex - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (
          block.type === 'tool_use' &&
          (block as AnthropicToolUseBlock).id === toolUseId
        ) {
          return (block as AnthropicToolUseBlock).name;
        }
      }
    }
  }
  return 'unknown_tool';
}

export interface ConvertOptions {
  /** Minimum number of tool calls required (default 3) */
  minToolCalls?: number;
  /** Only include games won by the attacker via task completion (default true) */
  requireAttackerWin?: boolean;
}

/**
 * Trim trailing incomplete turns from an Anthropic message array.
 *
 * Conversations are recorded after each Claude turn, so the last message may be
 * a tool_result with no subsequent assistant response (game ended mid-turn).
 * For training, we want conversations that end with an assistant message —
 * ideally one containing "TASK COMPLETE".
 *
 * This function removes trailing user/tool_result messages that have no
 * corresponding assistant response.
 */
export function trimIncompleteTrailingTurn(
  messages: AnthropicMessage[],
): AnthropicMessage[] {
  const trimmed = [...messages];

  // Remove trailing user messages (tool_result turns) that lack an assistant response
  while (
    trimmed.length > 0 &&
    trimmed[trimmed.length - 1].role === 'user'
  ) {
    trimmed.pop();
  }

  return trimmed;
}

/**
 * Convert a full Anthropic conversation to ShareGPT format.
 */
export function convertTrajectory(
  raw: RawTrajectory,
  minStepsOrOptions: number | ConvertOptions = {},
): ShareGPTTrainingExample | null {
  // Support legacy numeric minSteps parameter
  const opts: ConvertOptions =
    typeof minStepsOrOptions === 'number'
      ? { minToolCalls: minStepsOrOptions }
      : minStepsOrOptions;

  const minToolCalls = opts.minToolCalls ?? 3;
  const requireAttackerWin = opts.requireAttackerWin ?? false;

  // Quality filter: only attacker wins with task completion
  if (requireAttackerWin) {
    if (raw.winner !== 'attacker' || raw.winReason !== 'task_complete') {
      console.error(
        `[convert] SKIP ${raw.gameId} — not an attacker win (winner=${raw.winner}, reason=${raw.winReason})`,
      );
      return null;
    }
  }

  const { toolDefinitions } = raw;
  // Trim trailing incomplete turns (tool results with no assistant response)
  const messages = trimIncompleteTrailingTurn(raw.messages);

  if (!messages || messages.length < 2) {
    console.error(
      `[convert] SKIP ${raw.gameId} — too few messages (${messages?.length || 0})`,
    );
    return null;
  }

  const conversations: ShareGPTMessage[] = [];

  // System prompt with tool definitions
  conversations.push({
    from: 'system',
    value: buildSystemPrompt(toolDefinitions),
  });

  let numToolCalls = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        // First user message — extract just the task from the system prompt
        // The original prompt includes instructions; we simplify for training
        const taskMatch = msg.content.match(/TASK:\s*([\s\S]+?)(?:\n\nIMPORTANT:|$)/);
        const taskText = taskMatch ? taskMatch[1].trim() : msg.content;
        conversations.push({ from: 'human', value: taskText });
      } else if (Array.isArray(msg.content)) {
        // Tool results
        const hasToolResults = msg.content.some(
          (b: AnthropicContentBlock) => b.type === 'tool_result',
        );
        if (hasToolResults) {
          const converted = convertToolResults(
            msg.content,
            messages,
            i,
          );
          conversations.push({ from: 'tool', value: converted });
        }
      }
    } else if (msg.role === 'assistant') {
      if (Array.isArray(msg.content)) {
        const toolUses = msg.content.filter(
          (b: AnthropicContentBlock) => b.type === 'tool_use',
        );
        numToolCalls += toolUses.length;
        const converted = convertAssistantMessage(msg.content);
        conversations.push({ from: 'gpt', value: converted });
      } else if (typeof msg.content === 'string') {
        conversations.push({ from: 'gpt', value: msg.content });
      }
    }
  }

  // Quality filter: minimum tool calls
  if (numToolCalls < minToolCalls) {
    console.error(
      `[convert] SKIP ${raw.gameId} — only ${numToolCalls} tool calls (min ${minToolCalls})`,
    );
    return null;
  }

  // Quality filter: conversation should end with an assistant message
  const lastConv = conversations[conversations.length - 1];
  if (lastConv.from !== 'gpt') {
    console.error(
      `[convert] SKIP ${raw.gameId} — conversation ends with '${lastConv.from}' instead of assistant`,
    );
    return null;
  }

  return {
    conversations,
    metadata: {
      gameId: raw.gameId,
      task: raw.task.description,
      difficulty: raw.task.difficulty,
      winner: raw.winner,
      winReason: raw.winReason,
      durationMs: raw.durationMs,
      numSteps: raw.steps.length,
      numToolCalls,
      hadDisruptions: raw.defenderActions.length > 0,
      source: 'browser-brawl',
    },
  };
}

// ── OpenAI Messages conversion (for Unsloth training) ─────────────────────

export interface OpenAIMessageContent {
  type: 'text';
  text: string;
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: OpenAIMessageContent[];
}

export interface OpenAITrainingExample {
  messages: OpenAIMessage[];
  metadata: ShareGPTTrainingExample['metadata'];
}

const ROLE_MAP: Record<string, OpenAIMessage['role']> = {
  system: 'system',
  human: 'user',
  gpt: 'assistant',
  tool: 'tool',
};

/**
 * Convert a ShareGPT training example to OpenAI Messages format
 * required by Unsloth FastLanguageModel / FastVisionModel.
 *
 * Maps roles and wraps text values in typed content arrays.
 */
export function toOpenAIMessages(
  sharegpt: ShareGPTTrainingExample,
): OpenAITrainingExample {
  const messages: OpenAIMessage[] = sharegpt.conversations.map((msg) => ({
    role: ROLE_MAP[msg.from] || (msg.from as OpenAIMessage['role']),
    content: [{ type: 'text', text: msg.value }],
  }));

  return { messages, metadata: sharegpt.metadata };
}
