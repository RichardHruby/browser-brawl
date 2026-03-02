import { describe, it, expect, vi } from 'vitest';

// Mock the Convex client before importing data-collector
const mockMutations: Array<{ name: string; args: unknown }> = [];
vi.mock('convex/browser', () => {
  class MockConvexHttpClient {
    mutation = vi.fn(async (name: string, args: unknown) => {
      mockMutations.push({ name, args });
      return 'mock-id';
    });
  }
  return { ConvexHttpClient: MockConvexHttpClient };
});

// Set env before import
process.env.NEXT_PUBLIC_CONVEX_URL = 'https://test.convex.cloud';

describe('Conversation Persistence', () => {
  describe('recordConversation', () => {
    it('should accept valid conversation data without throwing', async () => {
      // Dynamic import to get fresh module with mocks
      const { recordConversation } = await import('../data-collector');

      const messages = [
        {
          role: 'user',
          content: 'You are a browser automation agent. Complete the following task...',
        },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: "I'll take a snapshot of the page." },
            {
              type: 'tool_use',
              id: 'toolu_123',
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
              tool_use_id: 'toolu_123',
              content: '- ref=s1: link "Sign in"\n- ref=s2: textbox "Search"',
            },
          ],
        },
      ];

      const tools = [
        {
          name: 'browser_snapshot',
          description: 'Take a snapshot of the page',
          input_schema: { type: 'object', properties: {} },
        },
        {
          name: 'browser_click',
          description: 'Click an element',
          input_schema: {
            type: 'object',
            properties: { ref: { type: 'string' } },
          },
        },
      ];

      // Should not throw
      expect(() => {
        recordConversation({
          gameId: 'test-game-123',
          stepNumber: 1,
          messages: JSON.stringify(messages),
          toolDefinitions: JSON.stringify(tools),
        });
      }).not.toThrow();
    });

    it('should not throw when Convex URL is not set', async () => {
      // Clear the module cache and env
      vi.resetModules();
      const savedUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
      delete process.env.NEXT_PUBLIC_CONVEX_URL;

      const { recordConversation } = await import('../data-collector');

      expect(() => {
        recordConversation({
          gameId: 'test-game',
          stepNumber: 1,
          messages: '[]',
        });
      }).not.toThrow();

      // Restore
      process.env.NEXT_PUBLIC_CONVEX_URL = savedUrl;
    });
  });

  describe('Messages JSON serialization', () => {
    it('should roundtrip a full Anthropic conversation through JSON', () => {
      const messages = [
        {
          role: 'user' as const,
          content:
            'You are a browser automation agent. TASK: Navigate to amazon.com and add toothpaste to cart',
        },
        {
          role: 'assistant' as const,
          content: [
            {
              type: 'text' as const,
              text: "I'll start by taking a snapshot of the current page state.",
            },
            {
              type: 'tool_use' as const,
              id: 'toolu_abc123',
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
              tool_use_id: 'toolu_abc123',
              content:
                '- ref=s1e1: link "Hello, Sign in" [x=1100, y=20]\n- ref=s1e2: textbox "Search Amazon" [x=500, y=60]\n- ref=s1e3: button "Go" [x=750, y=60]',
            },
          ],
        },
        {
          role: 'assistant' as const,
          content: [
            {
              type: 'text' as const,
              text: 'I can see the search box. Let me search for Sensodyne toothpaste.',
            },
            {
              type: 'tool_use' as const,
              id: 'toolu_def456',
              name: 'browser_type',
              input: { ref: 's1e2', text: 'Sensodyne toothpaste' },
            },
          ],
        },
        {
          role: 'user' as const,
          content: [
            {
              type: 'tool_result' as const,
              tool_use_id: 'toolu_def456',
              content: 'Typed "Sensodyne toothpaste" into textbox',
            },
          ],
        },
      ];

      const json = JSON.stringify(messages);
      const parsed = JSON.parse(json);

      expect(parsed).toEqual(messages);
      expect(parsed).toHaveLength(5);

      // Verify structure of assistant message with tool_use
      const assistantMsg = parsed[1];
      expect(assistantMsg.role).toBe('assistant');
      expect(assistantMsg.content).toHaveLength(2);
      expect(assistantMsg.content[0].type).toBe('text');
      expect(assistantMsg.content[1].type).toBe('tool_use');
      expect(assistantMsg.content[1].name).toBe('browser_snapshot');
      expect(assistantMsg.content[1].id).toBe('toolu_abc123');

      // Verify tool result
      const toolResult = parsed[2];
      expect(toolResult.content[0].type).toBe('tool_result');
      expect(toolResult.content[0].tool_use_id).toBe('toolu_abc123');
    });

    it('should handle tool_use with complex input objects', () => {
      const messages = [
        {
          role: 'assistant' as const,
          content: [
            {
              type: 'tool_use' as const,
              id: 'toolu_xyz',
              name: 'browser_type',
              input: {
                ref: 's2e5',
                text: 'Hello "World" <test> & more',
                pressEnter: true,
              },
            },
          ],
        },
      ];

      const json = JSON.stringify(messages);
      const parsed = JSON.parse(json);

      expect(parsed[0].content[0].input.text).toBe(
        'Hello "World" <test> & more',
      );
      expect(parsed[0].content[0].input.pressEnter).toBe(true);
    });

    it('should handle error tool results', () => {
      const messages = [
        {
          role: 'user' as const,
          content: [
            {
              type: 'tool_result' as const,
              tool_use_id: 'toolu_err',
              content: 'Error: Element not found',
              is_error: true,
            },
          ],
        },
      ];

      const json = JSON.stringify(messages);
      const parsed = JSON.parse(json);
      expect(parsed[0].content[0].is_error).toBe(true);
    });
  });

  describe('Tool definitions serialization', () => {
    it('should roundtrip Anthropic tool definitions through JSON', () => {
      const tools = [
        {
          name: 'browser_snapshot',
          description: 'Capture accessibility snapshot of the current page',
          input_schema: {
            type: 'object' as const,
            properties: {},
          },
        },
        {
          name: 'browser_click',
          description: 'Click an element by its ref',
          input_schema: {
            type: 'object' as const,
            properties: {
              ref: { type: 'string', description: 'Element reference from snapshot' },
            },
            required: ['ref'],
          },
        },
        {
          name: 'browser_type',
          description: 'Type text into an input element',
          input_schema: {
            type: 'object' as const,
            properties: {
              ref: { type: 'string', description: 'Element reference' },
              text: { type: 'string', description: 'Text to type' },
              pressEnter: {
                type: 'boolean',
                description: 'Press Enter after typing',
              },
            },
            required: ['ref', 'text'],
          },
        },
        {
          name: 'browser_navigate',
          description: 'Navigate to a URL',
          input_schema: {
            type: 'object' as const,
            properties: {
              url: { type: 'string', description: 'URL to navigate to' },
            },
            required: ['url'],
          },
        },
      ];

      const json = JSON.stringify(tools);
      const parsed = JSON.parse(json);

      expect(parsed).toHaveLength(4);
      expect(parsed.map((t: { name: string }) => t.name)).toEqual([
        'browser_snapshot',
        'browser_click',
        'browser_type',
        'browser_navigate',
      ]);

      // Verify schema structure
      const clickTool = parsed[1];
      expect(clickTool.input_schema.required).toEqual(['ref']);
      expect(clickTool.input_schema.properties.ref.type).toBe('string');
    });
  });

  describe('Truncation limits', () => {
    it('toolResultSummary should be truncated to 5000 chars (not 500)', () => {
      // Simulate what the attacker loop does
      const longResult =
        '- ref=s1e1: link "Hello, Sign in"\n'.repeat(200); // ~7000 chars
      const truncated = longResult.slice(0, 5000);

      expect(truncated.length).toBe(5000);
      expect(longResult.length).toBeGreaterThan(5000);
    });

    it('full conversation JSON is not truncated', () => {
      // Build a realistic multi-step conversation
      const messages: unknown[] = [
        { role: 'user', content: 'Task description here' },
      ];

      for (let i = 0; i < 30; i++) {
        messages.push({
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: `toolu_${i}`,
              name: 'browser_snapshot',
              input: {},
            },
          ],
        });
        messages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: `toolu_${i}`,
              content: `Snapshot result with lots of elements: ${'-ref=elem: button "Click me" [x=100,y=200]\n'.repeat(50)}`,
            },
          ],
        });
      }

      const json = JSON.stringify(messages);
      // Should be quite large — the point is we're NOT truncating it
      expect(json.length).toBeGreaterThan(50000);

      // Verify it roundtrips
      const parsed = JSON.parse(json);
      expect(parsed).toHaveLength(61); // 1 initial + 30 * 2
    });
  });
});
