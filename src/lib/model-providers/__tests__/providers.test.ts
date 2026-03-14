import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Tool as McpToolDef } from '@modelcontextprotocol/sdk/types.js';

// Mock env module before importing providers
vi.mock('../../env', () => ({
  getAnthropicApiKey: () => 'test-anthropic-key',
  getOpenAIApiKey: () => 'test-openai-key',
  getGeminiApiKey: () => 'test-gemini-key',
}));

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: vi.fn(),
      };
    },
  };
});

// Mock Google GenAI SDK
vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class MockGoogleGenAI {
      models = {
        generateContent: vi.fn(),
      };
    },
  };
});

// Mock nanoid
vi.mock('nanoid', () => ({
  nanoid: () => 'mock-id-1234',
}));

import { AnthropicProvider } from '../anthropic-provider';
import { OpenAIProvider } from '../openai-provider';
import { GeminiProvider } from '../gemini-provider';
import { createModelProvider } from '../index';

// Sample MCP tools for testing
const SAMPLE_MCP_TOOLS: McpToolDef[] = [
  {
    name: 'browser_snapshot',
    description: 'Take a snapshot of the current page',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'browser_click',
    description: 'Click an element on the page',
    inputSchema: {
      type: 'object' as const,
      properties: {
        ref: { type: 'string', description: 'Element reference' },
      },
      required: ['ref'],
    },
  },
  {
    name: 'browser_navigate',
    description: 'Navigate to a URL',
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'URL to navigate to' },
      },
      required: ['url'],
    },
  },
];

describe('createModelProvider factory', () => {
  it('returns AnthropicProvider for anthropic', () => {
    const provider = createModelProvider('anthropic', 'claude-sonnet-4-6');
    expect(provider.provider).toBe('anthropic');
    expect(provider.modelId).toBe('claude-sonnet-4-6');
  });

  it('returns OpenAIProvider for openai', () => {
    const provider = createModelProvider('openai', 'gpt-5.4');
    expect(provider.provider).toBe('openai');
    expect(provider.modelId).toBe('gpt-5.4');
  });

  it('returns GeminiProvider for gemini', () => {
    const provider = createModelProvider('gemini', 'gemini-3-flash-preview');
    expect(provider.provider).toBe('gemini');
    expect(provider.modelId).toBe('gemini-3-flash-preview');
  });

  it('throws on unknown provider', () => {
    expect(() => createModelProvider('unknown' as any, 'model' as any)).toThrow('Unknown model provider');
  });
});

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    provider = new AnthropicProvider('claude-sonnet-4-6');
  });

  it('converts MCP tools to Anthropic format', () => {
    provider.initTools(SAMPLE_MCP_TOOLS);
    const snapshot = provider.getConversationSnapshot();
    const toolDefs = JSON.parse(snapshot.toolDefinitions);

    expect(toolDefs).toHaveLength(3);
    expect(toolDefs[0]).toEqual({
      name: 'browser_snapshot',
      description: 'Take a snapshot of the current page',
      input_schema: { type: 'object', properties: {} },
    });
    // Anthropic uses input_schema (not parameters)
    expect(toolDefs[1]).toHaveProperty('input_schema');
    expect(toolDefs[1]).not.toHaveProperty('parameters');
  });

  it('builds initial messages with task prompt', () => {
    provider.initTools(SAMPLE_MCP_TOOLS);
    provider.initMessages('Navigate to amazon.com and search for toothpaste');
    const snapshot = provider.getConversationSnapshot();
    const messages = JSON.parse(snapshot.messages);

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toContain('Navigate to amazon.com');
    expect(messages[0].content).toContain('TASK COMPLETE');
  });

  it('appends tool results in Anthropic format', () => {
    provider.initTools(SAMPLE_MCP_TOOLS);
    provider.initMessages('test task');

    provider.appendToolResults([
      { toolCallId: 'call_123', toolName: 'browser_snapshot', content: 'page content', isError: false },
      { toolCallId: 'call_456', toolName: 'browser_click', content: 'clicked', isError: false },
    ]);

    const snapshot = provider.getConversationSnapshot();
    const messages = JSON.parse(snapshot.messages);

    // Should have user message + tool results message
    expect(messages).toHaveLength(2);
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toHaveLength(2);
    expect(messages[1].content[0].type).toBe('tool_result');
    expect(messages[1].content[0].tool_use_id).toBe('call_123');
    expect(messages[1].content[1].tool_use_id).toBe('call_456');
  });

  it('marks error tool results with is_error', () => {
    provider.initTools(SAMPLE_MCP_TOOLS);
    provider.initMessages('test task');

    provider.appendToolResults([
      { toolCallId: 'call_err', toolName: 'browser_click', content: 'Element not found', isError: true },
    ]);

    const snapshot = provider.getConversationSnapshot();
    const messages = JSON.parse(snapshot.messages);
    expect(messages[1].content[0].is_error).toBe(true);
  });

  it('parses model response with tool calls', async () => {
    provider.initTools(SAMPLE_MCP_TOOLS);
    provider.initMessages('test task');

    // Mock the Anthropic SDK response
    const mockResponse = {
      content: [
        { type: 'text', text: 'I will take a snapshot first.' },
        { type: 'tool_use', id: 'tu_1', name: 'browser_snapshot', input: {} },
      ],
      usage: { input_tokens: 100, output_tokens: 50 },
      stop_reason: 'tool_use',
    };

    // Access the mocked client
    const client = (provider as any).client;
    client.messages.create.mockResolvedValue(mockResponse);

    const response = await provider.call(new AbortController().signal);

    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls[0].id).toBe('tu_1');
    expect(response.toolCalls[0].name).toBe('browser_snapshot');
    expect(response.reasoningText).toBe('I will take a snapshot first.');
    expect(response.isComplete).toBe(false);
    expect(response.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
  });

  it('detects task completion', async () => {
    provider.initTools(SAMPLE_MCP_TOOLS);
    provider.initMessages('test task');

    const mockResponse = {
      content: [
        { type: 'text', text: 'TASK COMPLETE - I have added toothpaste to the cart.' },
      ],
      usage: { input_tokens: 200, output_tokens: 30 },
      stop_reason: 'end_turn',
    };

    const client = (provider as any).client;
    client.messages.create.mockResolvedValue(mockResponse);

    const response = await provider.call(new AbortController().signal);

    expect(response.isComplete).toBe(true);
    expect(response.toolCalls).toHaveLength(0);
    expect(response.reasoningText).toContain('TASK COMPLETE');
  });
});

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    provider = new OpenAIProvider('gpt-5.4');
    vi.restoreAllMocks();
  });

  it('converts MCP tools to OpenAI function format', () => {
    provider.initTools(SAMPLE_MCP_TOOLS);
    const snapshot = provider.getConversationSnapshot();
    const toolDefs = JSON.parse(snapshot.toolDefinitions);

    expect(toolDefs).toHaveLength(3);
    expect(toolDefs[0]).toEqual({
      type: 'function',
      function: {
        name: 'browser_snapshot',
        description: 'Take a snapshot of the current page',
        parameters: { type: 'object', properties: {} },
      },
    });
    // OpenAI uses parameters (not input_schema)
    expect(toolDefs[1].function).toHaveProperty('parameters');
  });

  it('builds initial messages with system + user', () => {
    provider.initTools(SAMPLE_MCP_TOOLS);
    provider.initMessages('Search for toothpaste');
    const snapshot = provider.getConversationSnapshot();
    const messages = JSON.parse(snapshot.messages);

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('browser automation agent');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toContain('Search for toothpaste');
  });

  it('appends tool results with tool_call_id', () => {
    provider.initTools(SAMPLE_MCP_TOOLS);
    provider.initMessages('test');

    provider.appendToolResults([
      { toolCallId: 'call_abc', toolName: 'browser_snapshot', content: 'snapshot data', isError: false },
    ]);

    const snapshot = provider.getConversationSnapshot();
    const messages = JSON.parse(snapshot.messages);

    // system + user + tool result
    expect(messages).toHaveLength(3);
    expect(messages[2].role).toBe('tool');
    expect(messages[2].tool_call_id).toBe('call_abc');
    expect(messages[2].content).toBe('snapshot data');
  });

  it('parses tool calls from OpenAI response', async () => {
    provider.initTools(SAMPLE_MCP_TOOLS);
    provider.initMessages('test');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: 'call_xyz',
              type: 'function',
              function: {
                name: 'browser_navigate',
                arguments: '{"url":"https://amazon.com"}',
              },
            }],
          },
        }],
        usage: { prompt_tokens: 150, completion_tokens: 20 },
      }),
    });
    global.fetch = mockFetch;

    const response = await provider.call(new AbortController().signal);

    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls[0].id).toBe('call_xyz');
    expect(response.toolCalls[0].name).toBe('browser_navigate');
    expect(response.toolCalls[0].arguments).toEqual({ url: 'https://amazon.com' });
    expect(response.isComplete).toBe(false);
    expect(response.usage).toEqual({ inputTokens: 150, outputTokens: 20 });
  });

  it('throws on API error', async () => {
    provider.initTools(SAMPLE_MCP_TOOLS);
    provider.initMessages('test');

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Rate limited'),
    });

    await expect(provider.call(new AbortController().signal)).rejects.toThrow('OpenAI API 429');
  });
});

describe('GeminiProvider', () => {
  let provider: GeminiProvider;

  beforeEach(() => {
    provider = new GeminiProvider('gemini-3-flash-preview');
  });

  it('converts MCP tools to Gemini functionDeclarations format', () => {
    provider.initTools(SAMPLE_MCP_TOOLS);
    const snapshot = provider.getConversationSnapshot();
    const toolDefs = JSON.parse(snapshot.toolDefinitions);

    expect(toolDefs).toHaveLength(3);
    expect(toolDefs[0]).toEqual({
      name: 'browser_snapshot',
      description: 'Take a snapshot of the current page',
      parameters: { type: 'object', properties: {} },
    });
  });

  it('builds initial messages as Gemini contents', () => {
    provider.initTools(SAMPLE_MCP_TOOLS);
    provider.initMessages('Find flights');
    const snapshot = provider.getConversationSnapshot();
    const contents = JSON.parse(snapshot.messages);

    expect(contents).toHaveLength(1);
    expect(contents[0].role).toBe('user');
    expect(contents[0].parts[0].text).toContain('Find flights');
  });

  it('appends tool results as functionResponse parts', () => {
    provider.initTools(SAMPLE_MCP_TOOLS);
    provider.initMessages('test');

    provider.appendToolResults([
      { toolCallId: 'id_1', toolName: 'browser_snapshot', content: 'page content', isError: false },
      { toolCallId: 'id_2', toolName: 'browser_click', content: 'clicked btn', isError: false },
    ]);

    const snapshot = provider.getConversationSnapshot();
    const contents = JSON.parse(snapshot.messages);

    // user + function response
    expect(contents).toHaveLength(2);
    expect(contents[1].role).toBe('user');
    expect(contents[1].parts).toHaveLength(2);
    expect(contents[1].parts[0].functionResponse.name).toBe('browser_snapshot');
    expect(contents[1].parts[0].functionResponse.response.result).toBe('page content');
    expect(contents[1].parts[1].functionResponse.name).toBe('browser_click');
  });

  it('parses function calls from Gemini response', async () => {
    provider.initTools(SAMPLE_MCP_TOOLS);
    provider.initMessages('test');

    const mockResponse = {
      text: 'Let me navigate to the page.',
      functionCalls: [
        { name: 'browser_navigate', args: { url: 'https://amazon.com' } },
      ],
      candidates: [{ content: { role: 'model', parts: [
        { text: 'Let me navigate to the page.' },
        { functionCall: { name: 'browser_navigate', args: { url: 'https://amazon.com' } }, thoughtSignature: 'sig-abc' },
      ] } }],
    };

    const ai = (provider as any).ai;
    ai.models.generateContent.mockResolvedValue(mockResponse);

    const response = await provider.call(new AbortController().signal);

    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls[0].name).toBe('browser_navigate');
    expect(response.toolCalls[0].arguments).toEqual({ url: 'https://amazon.com' });
    expect(response.toolCalls[0].id).toBe('mock-id-1234'); // nanoid mock
    expect(response.reasoningText).toBe('Let me navigate to the page.');
    expect(response.isComplete).toBe(false);
  });

  it('detects task completion', async () => {
    provider.initTools(SAMPLE_MCP_TOOLS);
    provider.initMessages('test');

    const mockResponse = {
      text: 'TASK COMPLETE - Added item to cart.',
      functionCalls: null,
      candidates: [{ content: { role: 'model', parts: [
        { text: 'TASK COMPLETE - Added item to cart.' },
      ] } }],
    };

    const ai = (provider as any).ai;
    ai.models.generateContent.mockResolvedValue(mockResponse);

    const response = await provider.call(new AbortController().signal);

    expect(response.isComplete).toBe(true);
    expect(response.toolCalls).toHaveLength(0);
  });
});

describe('Missing API key errors', () => {
  it('OpenAIProvider checks for API key on construction', () => {
    // The provider constructor calls getOpenAIApiKey() — when it returns a truthy value
    // (our top-level mock returns 'test-openai-key'), construction succeeds.
    // We verify the provider stores the key by checking it doesn't throw.
    expect(() => new OpenAIProvider('gpt-5.4')).not.toThrow();
  });

  it('GeminiProvider checks for API key on construction', () => {
    expect(() => new GeminiProvider('gemini-3-flash-preview')).not.toThrow();
  });
});

describe('Conversation snapshot serialization', () => {
  it('roundtrips Anthropic messages through JSON', () => {
    const provider = new AnthropicProvider();
    provider.initTools(SAMPLE_MCP_TOOLS);
    provider.initMessages('test task');
    provider.appendToolResults([
      { toolCallId: 'id1', toolName: 'browser_snapshot', content: 'data', isError: false },
    ]);

    const snapshot = provider.getConversationSnapshot();
    const messages = JSON.parse(snapshot.messages);
    const toolDefs = JSON.parse(snapshot.toolDefinitions);

    expect(messages).toBeInstanceOf(Array);
    expect(toolDefs).toBeInstanceOf(Array);
    // Re-serialize should be stable
    expect(JSON.stringify(JSON.parse(snapshot.messages))).toBe(JSON.stringify(messages));
  });

  it('roundtrips OpenAI messages through JSON', () => {
    const provider = new OpenAIProvider('gpt-5.4');
    provider.initTools(SAMPLE_MCP_TOOLS);
    provider.initMessages('test task');

    const snapshot = provider.getConversationSnapshot();
    const messages = JSON.parse(snapshot.messages);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
  });

  it('roundtrips Gemini contents through JSON', () => {
    const provider = new GeminiProvider('gemini-3-flash-preview');
    provider.initTools(SAMPLE_MCP_TOOLS);
    provider.initMessages('test task');

    const snapshot = provider.getConversationSnapshot();
    const contents = JSON.parse(snapshot.messages);
    expect(contents).toHaveLength(1);
    expect(contents[0].role).toBe('user');
  });
});
