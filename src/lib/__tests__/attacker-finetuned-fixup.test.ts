import { describe, it, expect, vi } from 'vitest';

// ── Mock heavy dependencies so we can import pure helpers ────────────────────

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({ Client: class {} }));
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({ StdioClientTransport: class {} }));
vi.mock('../game-session-store', () => ({ getSession: vi.fn(), createGate: vi.fn() }));
vi.mock('../sse-emitter', () => ({ emitEvent: vi.fn() }));
vi.mock('../defender-agent', () => ({ endGame: vi.fn() }));
vi.mock('../data-collector', () => ({
  recordAttackerStep: vi.fn(),
  recordConversation: vi.fn(),
  captureAndUploadScreenshot: vi.fn(),
}));
vi.mock('../browserbase', () => ({ snapshotDOM: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({ default: class {} }));
vi.mock('../env', () => ({ getAnthropicApiKey: () => 'test-key' }));
vi.mock('nanoid', () => ({ nanoid: () => 'test-id' }));

import { needsFixup, parseToolCalls } from '../attacker-finetuned';

// ── needsFixup ────────────────────────────────────────────────────────────────

describe('needsFixup()', () => {
  it('returns false for valid tool_call JSON', () => {
    const text = `<tool_call>
{"name": "browser_navigate", "arguments": {"url": "https://example.com"}}
</tool_call>`;
    expect(needsFixup(text)).toBe(false);
  });

  it('returns false when there are no tool_call blocks', () => {
    expect(needsFixup('I will now navigate to the page.')).toBe(false);
  });

  it('returns true when JSON parse fails (unescaped inner quotes)', () => {
    // Simulate what the model actually produces (raw unescaped inner quotes):
    const badText = `<tool_call>
{"name": "browser_run_code", "arguments": {"code": "async (page) => { await page.type('input[name="q"]', 'hello') }"}}
</tool_call>`;
    expect(needsFixup(badText)).toBe(true);
  });

  it('returns true when browser. variable is used', () => {
    const text = `<tool_call>
{"name": "browser_run_code", "arguments": {"code": "async (page) => { await browser.click('#btn') }"}}
</tool_call>`;
    expect(needsFixup(text)).toBe(true);
  });

  it('returns true for IIFE pattern (async () =>)', () => {
    const text = `<tool_call>
{"name": "browser_run_code", "arguments": {"code": "(async () => { await page.click('#btn') })()"}}
</tool_call>`;
    expect(needsFixup(text)).toBe(true);
  });

  it('returns true for old-style function IIFE', () => {
    const text = `<tool_call>
{"name": "browser_run_code", "arguments": {"code": "(function() { page.click('#btn') })()"}}
</tool_call>`;
    expect(needsFixup(text)).toBe(true);
  });

  it('returns false for valid browser_run_code with async (page) =>', () => {
    const text = `<tool_call>
{"name": "browser_run_code", "arguments": {"code": "async (page) => { await page.locator('button').click(); }"}}
</tool_call>`;
    expect(needsFixup(text)).toBe(false);
  });

  it('returns true if any block is bad even if others are good', () => {
    const text = `<tool_call>
{"name": "browser_navigate", "arguments": {"url": "https://example.com"}}
</tool_call>
<tool_call>
{"name": "browser_run_code", "arguments": {"code": "(async () => { await browser.type('x') })()"}}
</tool_call>`;
    expect(needsFixup(text)).toBe(true);
  });
});

// ── parseToolCalls ────────────────────────────────────────────────────────────

describe('parseToolCalls()', () => {
  it('parses a valid single tool_call', () => {
    const text = `<tool_call>
{"name": "browser_navigate", "arguments": {"url": "https://amazon.com"}}
</tool_call>`;
    const calls = parseToolCalls(text);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('browser_navigate');
    expect(calls[0].arguments).toEqual({ url: 'https://amazon.com' });
  });

  it('parses multiple tool_calls', () => {
    const text = `<tool_call>
{"name": "browser_navigate", "arguments": {"url": "https://amazon.com"}}
</tool_call>
<tool_call>
{"name": "browser_snapshot", "arguments": {}}
</tool_call>`;
    const calls = parseToolCalls(text);
    expect(calls).toHaveLength(2);
    expect(calls[0].name).toBe('browser_navigate');
    expect(calls[1].name).toBe('browser_snapshot');
  });

  it('silently skips unparseable tool_call blocks', () => {
    const text = `<tool_call>
{"name": "browser_run_code", "arguments": {"code": "async (page) => { await page.type('input[name="q"]') }"}}
</tool_call>`;
    const calls = parseToolCalls(text);
    expect(calls).toHaveLength(0);
  });

  it('supports "args" key as alias for "arguments"', () => {
    const text = `<tool_call>
{"name": "browser_click", "args": {"ref": "e123"}}
</tool_call>`;
    const calls = parseToolCalls(text);
    expect(calls).toHaveLength(1);
    expect(calls[0].arguments).toEqual({ ref: 'e123' });
  });

  it('returns empty array when no tool_calls present', () => {
    expect(parseToolCalls('I will navigate to the page now.')).toHaveLength(0);
  });

  it('parses tool_call correctly after fixup (inner quotes properly escaped)', () => {
    // Haiku fixes unescaped double-quotes by escaping them as \" — valid JSON
    const fixedText = `<tool_call>
{"name": "browser_run_code", "arguments": {"code": "async (page) => { await page.type('input[name=\\"q\\"]', 'hello') }"}}
</tool_call>`;
    const calls = parseToolCalls(fixedText);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('browser_run_code');
    expect(typeof calls[0].arguments.code).toBe('string');
    expect(calls[0].arguments.code as string).toContain('async (page) =>');
  });
});
