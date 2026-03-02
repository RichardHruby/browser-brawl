import { describe, it, expect } from 'vitest';
import {
  convertToolDefs,
  buildSystemPrompt,
  convertAssistantMessage,
  convertToolResults,
  convertTrajectory,
  type AnthropicToolDef,
  type AnthropicMessage,
  type RawTrajectory,
} from '../convert-to-sharegpt';

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
          { type: 'text', text: "I'll take a snapshot first." },
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'browser_snapshot',
            input: {},
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_1',
            content: '- ref=s1: link "Sign in"\n- ref=s2: textbox "Search"',
          },
        ],
      },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'I see the search box. Clicking it.' },
          {
            type: 'tool_use',
            id: 'toolu_2',
            name: 'browser_click',
            input: { ref: 's2' },
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_2',
            content: 'Clicked element',
          },
        ],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'I typed the search. Now clicking add to cart.',
          },
          {
            type: 'tool_use',
            id: 'toolu_3',
            name: 'browser_click',
            input: { ref: 's5' },
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_3',
            content: 'Added to cart',
          },
        ],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'TASK COMPLETE - Added toothpaste to cart.',
          },
        ],
      },
    ],
    toolDefinitions: SAMPLE_TOOLS,
    steps: [
      { stepNumber: 1, toolName: 'browser_snapshot' },
      { stepNumber: 2, toolName: 'browser_click' },
      { stepNumber: 3, toolName: 'browser_click' },
    ],
    defenderActions: [
      {
        actionNumber: 1,
        disruptionId: 'popup-overlay',
        disruptionName: 'Session Expired Popup',
        description: 'Showed popup overlay',
      },
    ],
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('convertToolDefs', () => {
  it('should convert Anthropic tool format to OpenAI function format', () => {
    const result = JSON.parse(convertToolDefs(SAMPLE_TOOLS));

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('function');
    expect(result[0].function.name).toBe('browser_snapshot');
    expect(result[0].function.description).toBe(
      'Capture accessibility snapshot of the current page',
    );
    expect(result[0].function.parameters).toEqual({
      type: 'object',
      properties: {},
    });
  });

  it('should preserve required fields in schema', () => {
    const result = JSON.parse(convertToolDefs(SAMPLE_TOOLS));
    expect(result[1].function.parameters.required).toEqual(['ref']);
  });
});

describe('buildSystemPrompt', () => {
  it('should include <tools> XML tags', () => {
    const prompt = buildSystemPrompt(SAMPLE_TOOLS);
    expect(prompt).toContain('<tools>');
    expect(prompt).toContain('</tools>');
  });

  it('should include <tool_call> format instructions', () => {
    const prompt = buildSystemPrompt(SAMPLE_TOOLS);
    expect(prompt).toContain('<tool_call>');
    expect(prompt).toContain('</tool_call>');
  });

  it('should include tool names in the JSON', () => {
    const prompt = buildSystemPrompt(SAMPLE_TOOLS);
    expect(prompt).toContain('"browser_snapshot"');
    expect(prompt).toContain('"browser_click"');
  });
});

describe('convertAssistantMessage', () => {
  it('should convert text + tool_use to text + <tool_call>', () => {
    const content = [
      { type: 'text' as const, text: 'Let me click that button.' },
      {
        type: 'tool_use' as const,
        id: 'toolu_abc',
        name: 'browser_click',
        input: { ref: 's1' },
      },
    ];

    const result = convertAssistantMessage(content);
    expect(result).toContain('Let me click that button.');
    expect(result).toContain('<tool_call>');
    expect(result).toContain('"name": "browser_click"');
    expect(result).toContain('"arguments": {"ref":"s1"}');
    expect(result).toContain('</tool_call>');
  });

  it('should handle text-only messages (no tool calls)', () => {
    const content = [
      {
        type: 'text' as const,
        text: 'TASK COMPLETE - I added the item to cart.',
      },
    ];

    const result = convertAssistantMessage(content);
    expect(result).toBe('TASK COMPLETE - I added the item to cart.');
    expect(result).not.toContain('<tool_call>');
  });

  it('should handle multiple tool calls in one message', () => {
    const content = [
      { type: 'text' as const, text: 'Doing two things.' },
      {
        type: 'tool_use' as const,
        id: 'toolu_1',
        name: 'browser_snapshot',
        input: {},
      },
      {
        type: 'tool_use' as const,
        id: 'toolu_2',
        name: 'browser_click',
        input: { ref: 'e5' },
      },
    ];

    const result = convertAssistantMessage(content);
    const toolCallCount = (result.match(/<tool_call>/g) || []).length;
    expect(toolCallCount).toBe(2);
  });
});

describe('convertToolResults', () => {
  it('should convert tool_result to <tool_response> with correct tool name', () => {
    const messages: AnthropicMessage[] = [
      {
        role: 'assistant' as const,
        content: [
          {
            type: 'tool_use' as const,
            id: 'toolu_xyz',
            name: 'browser_snapshot',
            input: {},
          },
        ],
      },
      {
        role: 'user' as const,
        content: [
          {
            type: 'tool_result' as const,
            tool_use_id: 'toolu_xyz',
            content: '- ref=s1: link "Home"',
          },
        ],
      },
    ];
    const toolResultContent = messages[1].content;
    if (!Array.isArray(toolResultContent)) {
      throw new Error('Expected tool result content array');
    }

    const result = convertToolResults(
      toolResultContent,
      messages,
      1,
    );
    expect(result).toContain('<tool_response>');
    expect(result).toContain('"name": "browser_snapshot"');
    expect(result).toContain('</tool_response>');
  });

  it('should handle error tool results', () => {
    const messages: AnthropicMessage[] = [
      {
        role: 'assistant' as const,
        content: [
          {
            type: 'tool_use' as const,
            id: 'toolu_err',
            name: 'browser_click',
            input: { ref: 'missing' },
          },
        ],
      },
      {
        role: 'user' as const,
        content: [
          {
            type: 'tool_result' as const,
            tool_use_id: 'toolu_err',
            content: 'Element not found',
            is_error: true,
          },
        ],
      },
    ];
    const toolResultContent = messages[1].content;
    if (!Array.isArray(toolResultContent)) {
      throw new Error('Expected tool result content array');
    }

    const result = convertToolResults(
      toolResultContent,
      messages,
      1,
    );
    expect(result).toContain('Error: Element not found');
  });
});

describe('convertTrajectory', () => {
  it('should produce correct ShareGPT structure', () => {
    const raw = makeTrajectory();
    const result = convertTrajectory(raw);

    expect(result).not.toBeNull();
    expect(result!.conversations[0].from).toBe('system');
    expect(result!.conversations[1].from).toBe('human');
    expect(result!.conversations[1].value).toBe('Add toothpaste to cart');
  });

  it('should use "tool" role for tool responses, not "human"', () => {
    const raw = makeTrajectory();
    const result = convertTrajectory(raw);

    const roles = result!.conversations.map((c) => c.from);
    // system, human, gpt, tool, gpt, tool, gpt, tool, gpt
    expect(roles[0]).toBe('system');
    expect(roles[1]).toBe('human'); // only human message — the task
    expect(roles[2]).toBe('gpt');
    expect(roles[3]).toBe('tool'); // tool response, NOT human
    expect(roles[4]).toBe('gpt');
    expect(roles[5]).toBe('tool');

    // No "human" after the first task message
    const humanMessages = roles.filter((r) => r === 'human');
    expect(humanMessages).toHaveLength(1);
  });

  it('should populate metadata correctly', () => {
    const raw = makeTrajectory();
    const result = convertTrajectory(raw);

    expect(result!.metadata.gameId).toBe('test-game-123');
    expect(result!.metadata.task).toBe('Add toothpaste to cart on Amazon');
    expect(result!.metadata.difficulty).toBe('medium');
    expect(result!.metadata.numToolCalls).toBe(3);
    expect(result!.metadata.hadDisruptions).toBe(true);
    expect(result!.metadata.source).toBe('browser-brawl');
  });

  it('should skip trajectories with too few tool calls', () => {
    const raw = makeTrajectory({
      messages: [
        { role: 'user', content: 'TASK: do something' },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'TASK COMPLETE' }],
        },
      ],
    });

    // Default MIN_STEPS is 3
    const result = convertTrajectory(raw);
    expect(result).toBeNull();
  });

  it('should skip trajectories with too few messages', () => {
    const raw = makeTrajectory({ messages: [] });
    const result = convertTrajectory(raw);
    expect(result).toBeNull();
  });

  it('should extract task from TASK: prefix in system prompt', () => {
    const raw = makeTrajectory();
    const result = convertTrajectory(raw);

    // Should extract "Add toothpaste to cart" from "TASK: Add toothpaste to cart\n\nIMPORTANT:..."
    expect(result!.conversations[1].value).toBe('Add toothpaste to cart');
    expect(result!.conversations[1].value).not.toContain('IMPORTANT');
    expect(result!.conversations[1].value).not.toContain(
      'browser automation agent',
    );
  });
});
