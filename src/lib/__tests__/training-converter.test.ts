import { describe, it, expect } from 'vitest';
import {
  toOpenAIMessages,
  convertTrajectory,
  type ShareGPTTrainingExample,
  type RawTrajectory,
  type AnthropicToolDef,
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

// ── End-to-end: convertTrajectory → toOpenAIMessages ───────────────

describe('convertTrajectory → toOpenAIMessages pipeline', () => {
  it('produces valid OpenAI Messages from raw Anthropic trajectory', () => {
    const raw = makeTrajectory();
    const sharegpt = convertTrajectory(raw, 1);
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
    const sharegpt = convertTrajectory(raw, 1)!;
    const openai = toOpenAIMessages(sharegpt);

    const assistantMessages = openai.messages.filter((m) => m.role === 'assistant');
    const withToolCalls = assistantMessages.filter((m) =>
      m.content[0].text.includes('<tool_call>'),
    );

    expect(withToolCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('preserves tool_response XML in tool messages through the pipeline', () => {
    const raw = makeTrajectory();
    const sharegpt = convertTrajectory(raw, 1)!;
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

    const sharegpt = convertTrajectory(raw, 3);
    expect(sharegpt).toBeNull();
  });

  it('output format matches what Unsloth expects', () => {
    const raw = makeTrajectory();
    const sharegpt = convertTrajectory(raw, 1)!;
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
});
