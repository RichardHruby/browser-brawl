import { describe, it, expect } from 'vitest';
import {
  toOpenAIMessages,
  convertTrajectory,
  trimIncompleteTrailingTurn,
  type ShareGPTTrainingExample,
  type RawTrajectory,
  type AnthropicToolDef,
  type AnthropicMessage,
} from '@/lib/training-converter';

// ── Fixtures ───────────────────────────────────────────────────────

const SAMPLE_TOOLS: AnthropicToolDef[] = [
  {
    name: 'browser_snapshot',
    description: 'Capture accessibility snapshot of the current page',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'browser_click',
    description: 'Click an element by its ref',
    input_schema: {
      type: 'object',
      properties: { ref: { type: 'string' } },
      required: ['ref'],
    },
  },
];

function makeSampleShareGPT(): ShareGPTTrainingExample {
  return {
    conversations: [
      { from: 'system', value: 'You are a browser automation agent.\n<tools>[...]</tools>' },
      { from: 'human', value: 'Navigate to https://amazon.com and add toothpaste to cart' },
      {
        from: 'gpt',
        value: 'I\'ll start by taking a snapshot.\n<tool_call>\n{"name": "browser_snapshot", "arguments": {}}\n</tool_call>',
      },
      {
        from: 'tool',
        value: '<tool_response>\n{"name": "browser_snapshot", "content": "[snapshot content]"}\n</tool_response>',
      },
      {
        from: 'gpt',
        value: 'TASK COMPLETE — added toothpaste to cart.',
      },
    ],
    metadata: {
      gameId: 'test-game-123',
      task: 'Add toothpaste to cart',
      difficulty: 'medium',
      winner: 'attacker',
      winReason: 'task_complete',
      durationMs: 60000,
      numSteps: 3,
      numToolCalls: 1,
      hadDisruptions: false,
      source: 'browser-brawl',
    },
  };
}

function makeTrajectory(
  overrides: Partial<RawTrajectory> = {},
): RawTrajectory {
  return {
    gameId: 'test-game-123',
    task: {
      description: 'Add toothpaste to cart on Amazon',
      startUrl: 'https://amazon.com',
      difficulty: 'medium',
    },
    winner: 'attacker',
    winReason: 'task_complete',
    durationMs: 60000,
    messages: [
      {
        role: 'user',
        content:
          'You are a browser automation agent.\n\nTASK: Add toothpaste to cart\n\nIMPORTANT:\n- Use browser_snapshot...',
      },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'I\'ll take a snapshot first.' },
          { type: 'tool_use', id: 'tu_1', name: 'browser_snapshot', input: {} },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'tu_1', content: '[snapshot text]' },
        ],
      },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'I see a search box. Let me click it.' },
          { type: 'tool_use', id: 'tu_2', name: 'browser_click', input: { ref: 'e5' } },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'tu_2', content: 'Clicked.' },
        ],
      },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'I see a search box. Let me type in it.' },
          { type: 'tool_use', id: 'tu_3', name: 'browser_click', input: { ref: 'e6' } },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'tu_3', content: 'Clicked.' },
        ],
      },
      {
        role: 'assistant',
        content: 'TASK COMPLETE — added toothpaste to cart.',
      },
    ],
    toolDefinitions: SAMPLE_TOOLS,
    steps: [
      { stepNumber: 1, toolName: 'browser_snapshot' },
      { stepNumber: 2, toolName: 'browser_click' },
      { stepNumber: 3, toolName: 'browser_click' },
    ],
    defenderActions: [],
    ...overrides,
  } as RawTrajectory;
}

// ── toOpenAIMessages tests ─────────────────────────────────────────

describe('toOpenAIMessages', () => {
  it('maps ShareGPT roles to OpenAI roles correctly', () => {
    const sharegpt = makeSampleShareGPT();
    const result = toOpenAIMessages(sharegpt);

    expect(result.messages[0].role).toBe('system');
    expect(result.messages[1].role).toBe('user');
    expect(result.messages[2].role).toBe('assistant');
    expect(result.messages[3].role).toBe('tool');
    expect(result.messages[4].role).toBe('assistant');
  });

  it('wraps all values in typed content arrays', () => {
    const sharegpt = makeSampleShareGPT();
    const result = toOpenAIMessages(sharegpt);

    for (const msg of result.messages) {
      expect(Array.isArray(msg.content)).toBe(true);
      expect(msg.content.length).toBeGreaterThanOrEqual(1);
      expect(msg.content[0].type).toBe('text');
      expect(typeof msg.content[0].text).toBe('string');
    }
  });

  it('preserves the text content from ShareGPT value field', () => {
    const sharegpt = makeSampleShareGPT();
    const result = toOpenAIMessages(sharegpt);

    // System message
    expect(result.messages[0].content[0].text).toContain('browser automation agent');

    // Human → user
    expect(result.messages[1].content[0].text).toContain('amazon.com');

    // gpt → assistant with tool_call
    expect(result.messages[2].content[0].text).toContain('<tool_call>');
    expect(result.messages[2].content[0].text).toContain('browser_snapshot');

    // tool → tool with tool_response
    expect(result.messages[3].content[0].text).toContain('<tool_response>');

    // Final assistant message
    expect(result.messages[4].content[0].text).toContain('TASK COMPLETE');
  });

  it('preserves metadata from the ShareGPT example', () => {
    const sharegpt = makeSampleShareGPT();
    const result = toOpenAIMessages(sharegpt);

    expect(result.metadata.gameId).toBe('test-game-123');
    expect(result.metadata.task).toBe('Add toothpaste to cart');
    expect(result.metadata.winner).toBe('attacker');
    expect(result.metadata.source).toBe('browser-brawl');
  });

  it('produces correct message count', () => {
    const sharegpt = makeSampleShareGPT();
    const result = toOpenAIMessages(sharegpt);

    expect(result.messages.length).toBe(sharegpt.conversations.length);
  });

  it('handles empty conversations array', () => {
    const sharegpt: ShareGPTTrainingExample = {
      conversations: [],
      metadata: makeSampleShareGPT().metadata,
    };
    const result = toOpenAIMessages(sharegpt);

    expect(result.messages).toEqual([]);
    expect(result.metadata.gameId).toBe('test-game-123');
  });
});

// ── trimIncompleteTrailingTurn tests ───────────────────────────────

describe('trimIncompleteTrailingTurn', () => {
  it('removes trailing user messages (tool results without assistant response)', () => {
    const messages: AnthropicMessage[] = [
      { role: 'user', content: 'Do something' },
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'tu_1', name: 'browser_snapshot', input: {} },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'tu_1', content: 'result' },
        ],
      },
    ];

    const trimmed = trimIncompleteTrailingTurn(messages);
    expect(trimmed.length).toBe(2);
    expect(trimmed[trimmed.length - 1].role).toBe('assistant');
  });

  it('preserves conversation ending with assistant message', () => {
    const messages: AnthropicMessage[] = [
      { role: 'user', content: 'Do something' },
      { role: 'assistant', content: 'TASK COMPLETE' },
    ];

    const trimmed = trimIncompleteTrailingTurn(messages);
    expect(trimmed.length).toBe(2);
    expect(trimmed[trimmed.length - 1].role).toBe('assistant');
  });

  it('does not modify the original array', () => {
    const messages: AnthropicMessage[] = [
      { role: 'user', content: 'Do something' },
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'tu_1', name: 'browser_snapshot', input: {} },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'tu_1', content: 'result' },
        ],
      },
    ];

    trimIncompleteTrailingTurn(messages);
    expect(messages.length).toBe(3); // original unchanged
  });

  it('handles empty array', () => {
    const trimmed = trimIncompleteTrailingTurn([]);
    expect(trimmed).toEqual([]);
  });
});

// ── convertTrajectory quality filters ─────────────────────────────

describe('convertTrajectory quality filters', () => {
  it('includes defender-win games by default (requireAttackerWin=false)', () => {
    const raw = makeTrajectory({
      winner: 'defender',
      winReason: 'health_depleted',
    });

    const result = convertTrajectory(raw);
    expect(result).not.toBeNull();
  });

  it('skips defender-win games when requireAttackerWin=true', () => {
    const raw = makeTrajectory({
      winner: 'defender',
      winReason: 'health_depleted',
    });

    const result = convertTrajectory(raw, { requireAttackerWin: true });
    expect(result).toBeNull();
  });

  it('skips unknown winner games when requireAttackerWin=true', () => {
    const raw = makeTrajectory({
      winner: 'unknown',
      winReason: 'unknown',
    });

    const result = convertTrajectory(raw, { requireAttackerWin: true });
    expect(result).toBeNull();
  });

  it('trims trailing tool results and still produces valid output', () => {
    // Simulate a conversation that was recorded mid-turn
    const raw = makeTrajectory({
      messages: [
        {
          role: 'user',
          content: 'TASK: Add toothpaste\n\nIMPORTANT: do it',
        },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Taking snapshot.' },
            { type: 'tool_use', id: 'tu_1', name: 'browser_snapshot', input: {} },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'tu_1', content: '[snapshot]' },
          ],
        },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Clicking button.' },
            { type: 'tool_use', id: 'tu_2', name: 'browser_click', input: { ref: 'e1' } },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'tu_2', content: 'Clicked' },
          ],
        },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Clicking again.' },
            { type: 'tool_use', id: 'tu_3', name: 'browser_click', input: { ref: 'e2' } },
          ],
        },
        // Trailing tool result with no assistant response (game ended mid-turn)
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'tu_3', content: 'Error: timeout' },
          ],
        },
      ] as AnthropicMessage[],
    });

    const result = convertTrajectory(raw, { minToolCalls: 1 });
    expect(result).not.toBeNull();

    // Last converted message should be assistant (gpt), not tool
    const lastConv = result!.conversations[result!.conversations.length - 1];
    expect(lastConv.from).toBe('gpt');
  });

  it('rejects conversations that end with tool message after trimming', () => {
    // Edge case: all messages are tool results after the initial user message
    const raw = makeTrajectory({
      messages: [
        { role: 'user', content: 'TASK: do something' },
        // No assistant messages at all — just user messages
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'tu_1', content: 'result' },
          ],
        },
      ] as AnthropicMessage[],
    });

    const result = convertTrajectory(raw, { minToolCalls: 0 });
    // After trimming, only the first user message remains → too few messages
    // and even if it had enough, last message is 'human' not 'gpt'
    expect(result).toBeNull();
  });

  it('supports legacy numeric minSteps parameter', () => {
    const raw = makeTrajectory();
    // 3 tool calls in the fixture, so minSteps=5 should filter it out
    const result = convertTrajectory(raw, 5);
    expect(result).toBeNull();
  });
});

// ── End-to-end: convertTrajectory → toOpenAIMessages ───────────────

describe('convertTrajectory → toOpenAIMessages pipeline', () => {
  it('produces valid OpenAI Messages from raw Anthropic trajectory', () => {
    const raw = makeTrajectory();
    const sharegpt = convertTrajectory(raw, { minToolCalls: 1 });
    expect(sharegpt).not.toBeNull();

    const openai = toOpenAIMessages(sharegpt!);

    // First message should be system
    expect(openai.messages[0].role).toBe('system');
    expect(openai.messages[0].content[0].text).toContain('<tools>');

    // Second message should be user (task)
    expect(openai.messages[1].role).toBe('user');

    // Should have assistant and tool messages
    const roles = openai.messages.map((m) => m.role);
    expect(roles).toContain('assistant');
    expect(roles).toContain('tool');
  });

  it('preserves tool_call XML in assistant messages through the pipeline', () => {
    const raw = makeTrajectory();
    const sharegpt = convertTrajectory(raw, { minToolCalls: 1 })!;
    const openai = toOpenAIMessages(sharegpt);

    const assistantMessages = openai.messages.filter((m) => m.role === 'assistant');
    const withToolCalls = assistantMessages.filter((m) =>
      m.content[0].text.includes('<tool_call>'),
    );

    expect(withToolCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('preserves tool_response XML in tool messages through the pipeline', () => {
    const raw = makeTrajectory();
    const sharegpt = convertTrajectory(raw, { minToolCalls: 1 })!;
    const openai = toOpenAIMessages(sharegpt);

    const toolMessages = openai.messages.filter((m) => m.role === 'tool');
    for (const msg of toolMessages) {
      expect(msg.content[0].text).toContain('<tool_response>');
    }
  });

  it('filters out trajectories with too few tool calls', () => {
    const raw = makeTrajectory({
      messages: [
        { role: 'user', content: 'TASK: do something' },
        { role: 'assistant', content: 'TASK COMPLETE' },
      ],
    });

    const sharegpt = convertTrajectory(raw, { minToolCalls: 3 });
    expect(sharegpt).toBeNull();
  });

  it('output format matches what Unsloth expects', () => {
    const raw = makeTrajectory();
    const sharegpt = convertTrajectory(raw, { minToolCalls: 1 })!;
    const openai = toOpenAIMessages(sharegpt);

    // Unsloth expects: { messages: [{ role, content: [{ type, text }] }] }
    expect(openai).toHaveProperty('messages');
    expect(Array.isArray(openai.messages)).toBe(true);

    for (const msg of openai.messages) {
      expect(msg).toHaveProperty('role');
      expect(msg).toHaveProperty('content');
      expect(Array.isArray(msg.content)).toBe(true);
      for (const block of msg.content) {
        expect(block).toHaveProperty('type', 'text');
        expect(block).toHaveProperty('text');
        expect(typeof block.text).toBe('string');
      }
    }

    // JSON serialization roundtrip should work (JSONL format)
    const jsonl = JSON.stringify(openai);
    const parsed = JSON.parse(jsonl);
    expect(parsed.messages.length).toBe(openai.messages.length);
  });

  it('ensures converted conversation ends with assistant message', () => {
    const raw = makeTrajectory();
    const sharegpt = convertTrajectory(raw, { minToolCalls: 1 })!;

    const lastConv = sharegpt.conversations[sharegpt.conversations.length - 1];
    expect(lastConv.from).toBe('gpt');
  });
});
