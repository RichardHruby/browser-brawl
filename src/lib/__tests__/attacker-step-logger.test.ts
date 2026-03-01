import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSession } from '../game-session-store';
import { AttackerStepLogger } from '../attacker-step-logger';

// ── Mocks ──────────────────────────────────────────────────────────

// Mock session store
const mockSession = {
  gameId: 'test-game-1',
  attackerSteps: [] as Array<{ id: string; step: number; description: string; timestamp: string; agentStatus: string }>,
  attackerStatus: 'idle' as string,
  defenderStatus: 'idle' as string,
  phase: 'arena' as string,
};

vi.mock('../game-session-store', () => ({
  getSession: vi.fn(() => mockSession),
}));

// Track all emitted SSE events
const emittedEvents: Array<{ sessionId: string; type: string; payload: unknown }> = [];
vi.mock('../sse-emitter', () => ({
  emitEvent: vi.fn((sessionId: string, type: string, payload: unknown) => {
    emittedEvents.push({ sessionId, type, payload });
  }),
}));

// Track all Convex-recorded steps
const recordedSteps: Array<Record<string, unknown>> = [];
vi.mock('../data-collector', () => ({
  recordAttackerStep: vi.fn((params: Record<string, unknown>) => {
    recordedSteps.push(params);
  }),
}));

// Mock nanoid
vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'mock-id1'),
}));

// ── Tests ──────────────────────────────────────────────────────────

describe('AttackerStepLogger', () => {
  beforeEach(() => {
    mockSession.attackerSteps = [];
    mockSession.attackerStatus = 'idle';
    mockSession.defenderStatus = 'idle';
    mockSession.phase = 'arena';
    emittedEvents.length = 0;
    recordedSteps.length = 0;
  });

  describe('logThinking', () => {
    it('increments step number and returns it', () => {
      const logger = new AttackerStepLogger('test-game-1');
      const step1 = logger.logThinking({ description: 'Analyzing the page' });
      const step2 = logger.logThinking({ description: 'Planning next action' });
      expect(step1).toBe(1);
      expect(step2).toBe(2);
    });

    it('pushes to session.attackerSteps in-memory', () => {
      const logger = new AttackerStepLogger('test-game-1');
      logger.logThinking({ description: 'Analyzing the page' });

      expect(mockSession.attackerSteps).toHaveLength(1);
      expect(mockSession.attackerSteps[0]).toMatchObject({
        step: 1,
        description: 'Analyzing the page',
        agentStatus: 'thinking',
      });
      expect(mockSession.attackerSteps[0].id).toBeTruthy();
      expect(mockSession.attackerSteps[0].timestamp).toBeTruthy();
    });

    it('emits attacker_step and status_update SSE events', () => {
      const logger = new AttackerStepLogger('test-game-1');
      logger.logThinking({ description: 'Analyzing the page' });

      const stepEvent = emittedEvents.find(e => e.type === 'attacker_step');
      expect(stepEvent).toBeDefined();
      expect(stepEvent!.payload).toMatchObject({
        step: 1,
        description: 'Analyzing the page',
        agentStatus: 'thinking',
        isComplete: false,
      });

      const statusEvent = emittedEvents.find(e => e.type === 'status_update');
      expect(statusEvent).toBeDefined();
      expect(statusEvent!.payload).toMatchObject({
        attackerStatus: 'thinking',
      });
    });

    it('updates session.attackerStatus', () => {
      const logger = new AttackerStepLogger('test-game-1');
      logger.logThinking({ description: 'Analyzing' });
      expect(mockSession.attackerStatus).toBe('thinking');
    });

    it('persists to Convex via recordAttackerStep', () => {
      const logger = new AttackerStepLogger('test-game-1');
      logger.logThinking({
        description: 'Analyzing the page',
        screenshotId: 'ss-123',
        domSnapshot: '[{"tag":"button"}]',
      });

      expect(recordedSteps).toHaveLength(1);
      expect(recordedSteps[0]).toMatchObject({
        gameId: 'test-game-1',
        stepNumber: 1,
        description: 'Analyzing the page',
        agentStatus: 'thinking',
        screenshotBeforeId: 'ss-123',
        domSnapshot: '[{"tag":"button"}]',
      });
      expect(recordedSteps[0].timestamp).toBeTruthy();
    });

    it('truncates description to 300 chars', () => {
      const logger = new AttackerStepLogger('test-game-1');
      const longDesc = 'x'.repeat(500);
      logger.logThinking({ description: longDesc });

      expect(mockSession.attackerSteps[0].description).toHaveLength(300);
      expect(recordedSteps[0].description).toHaveLength(300);
    });

    it('handles null screenshot/dom gracefully', () => {
      const logger = new AttackerStepLogger('test-game-1');
      logger.logThinking({
        description: 'test',
        screenshotId: null,
        domSnapshot: null,
      });

      expect(recordedSteps[0].screenshotBeforeId).toBeUndefined();
      expect(recordedSteps[0].domSnapshot).toBeUndefined();
    });
  });

  describe('logAction', () => {
    it('increments step number correctly after thinking steps', () => {
      const logger = new AttackerStepLogger('test-game-1');
      logger.logThinking({ description: 'thinking' });
      const actionStep = logger.logAction({ description: 'click button' });
      expect(actionStep).toBe(2);
    });

    it('persists tool details to Convex', () => {
      const logger = new AttackerStepLogger('test-game-1');
      logger.logAction({
        description: 'browser_click(ref: "btn1")',
        toolName: 'browser_click',
        toolInput: '{"ref":"btn1"}',
        toolResult: 'Clicked button successfully',
        screenshotId: 'ss-456',
        domSnapshot: '[{"tag":"button","id":"btn1"}]',
      });

      expect(recordedSteps[0]).toMatchObject({
        gameId: 'test-game-1',
        stepNumber: 1,
        toolName: 'browser_click',
        toolInput: '{"ref":"btn1"}',
        toolResultSummary: 'Clicked button successfully',
        description: 'browser_click(ref: "btn1")',
        agentStatus: 'acting',
        screenshotBeforeId: 'ss-456',
        domSnapshot: '[{"tag":"button","id":"btn1"}]',
      });
    });

    it('truncates toolInput to 2000 chars and toolResult to 500 chars', () => {
      const logger = new AttackerStepLogger('test-game-1');
      logger.logAction({
        description: 'test',
        toolInput: 'i'.repeat(3000),
        toolResult: 'r'.repeat(1000),
      });

      expect((recordedSteps[0].toolInput as string).length).toBe(2000);
      expect((recordedSteps[0].toolResultSummary as string).length).toBe(500);
    });

    it('includes screenshotUrl in SSE payload for live display', () => {
      const logger = new AttackerStepLogger('test-game-1');
      logger.logAction({
        description: 'click',
        screenshotUrl: 'https://browser-use.com/screenshot.png',
      });

      const stepEvent = emittedEvents.find(e => e.type === 'attacker_step');
      expect((stepEvent!.payload as Record<string, unknown>).screenshotUrl).toBe(
        'https://browser-use.com/screenshot.png',
      );
    });

    it('sets session.attackerStatus to acting', () => {
      const logger = new AttackerStepLogger('test-game-1');
      logger.logAction({ description: 'click' });
      expect(mockSession.attackerStatus).toBe('acting');
    });
  });

  describe('logComplete', () => {
    it('sets agentStatus to complete on success', () => {
      const logger = new AttackerStepLogger('test-game-1');
      logger.logComplete({ description: 'Task completed', success: true });

      expect(mockSession.attackerSteps[0].agentStatus).toBe('complete');
      expect(recordedSteps[0].agentStatus).toBe('complete');

      const stepEvent = emittedEvents.find(e => e.type === 'attacker_step');
      expect((stepEvent!.payload as Record<string, unknown>).isComplete).toBe(true);
    });

    it('sets agentStatus to failed on failure', () => {
      const logger = new AttackerStepLogger('test-game-1');
      logger.logComplete({ description: 'Task failed', success: false });

      expect(mockSession.attackerSteps[0].agentStatus).toBe('failed');
      expect(recordedSteps[0].agentStatus).toBe('failed');

      const stepEvent = emittedEvents.find(e => e.type === 'attacker_step');
      expect((stepEvent!.payload as Record<string, unknown>).isComplete).toBe(false);
    });

    it('truncates description to 200 chars', () => {
      const logger = new AttackerStepLogger('test-game-1');
      const longDesc = 'x'.repeat(400);
      logger.logComplete({ description: longDesc, success: true });

      expect(mockSession.attackerSteps[0].description).toHaveLength(200);
      expect(recordedSteps[0].description).toHaveLength(200);
    });
  });

  describe('currentStep', () => {
    it('starts at 0', () => {
      const logger = new AttackerStepLogger('test-game-1');
      expect(logger.currentStep).toBe(0);
    });

    it('tracks step count across mixed step types', () => {
      const logger = new AttackerStepLogger('test-game-1');
      logger.logThinking({ description: 'think' });
      expect(logger.currentStep).toBe(1);
      logger.logAction({ description: 'act' });
      expect(logger.currentStep).toBe(2);
      logger.logAction({ description: 'act2' });
      expect(logger.currentStep).toBe(3);
      logger.logComplete({ description: 'done', success: true });
      expect(logger.currentStep).toBe(4);
    });
  });

  describe('full step sequence', () => {
    it('produces correct Convex records for a typical attacker run', () => {
      const logger = new AttackerStepLogger('test-game-1');

      // Step 1: thinking
      logger.logThinking({
        description: 'I need to navigate to the search page',
        screenshotId: 'ss-1',
        domSnapshot: '[{"tag":"input","id":"search"}]',
      });

      // Step 2: action
      logger.logAction({
        description: 'browser_navigate(url: "https://amazon.com")',
        toolName: 'browser_navigate',
        toolInput: '{"url":"https://amazon.com"}',
        toolResult: 'Navigated to https://amazon.com',
        screenshotId: 'ss-2',
        domSnapshot: '[{"tag":"input","id":"search"},{"tag":"button","id":"go"}]',
      });

      // Step 3: action
      logger.logAction({
        description: 'browser_type(text: "toothpaste")',
        toolName: 'browser_type',
        toolInput: '{"ref":"search","text":"toothpaste"}',
        toolResult: 'Typed "toothpaste" into search box',
        screenshotId: 'ss-3',
      });

      // Step 4: complete
      logger.logComplete({
        description: 'TASK COMPLETE: Added Sensodyne to cart',
        success: true,
        screenshotId: 'ss-4',
      });

      // Verify 4 Convex records
      expect(recordedSteps).toHaveLength(4);
      expect(recordedSteps.map(s => s.agentStatus)).toEqual([
        'thinking', 'acting', 'acting', 'complete',
      ]);
      expect(recordedSteps.map(s => s.stepNumber)).toEqual([1, 2, 3, 4]);

      // Verify tool data only on action steps
      expect(recordedSteps[0].toolName).toBeUndefined();
      expect(recordedSteps[1].toolName).toBe('browser_navigate');
      expect(recordedSteps[2].toolName).toBe('browser_type');
      expect(recordedSteps[3].toolName).toBeUndefined();

      // Verify in-memory steps match
      expect(mockSession.attackerSteps).toHaveLength(4);
      expect(mockSession.attackerSteps.map(s => s.step)).toEqual([1, 2, 3, 4]);

      // Verify SSE events: 4 attacker_step + 4 status_update (3 from thinking/action + 0 from complete)
      const stepEvents = emittedEvents.filter(e => e.type === 'attacker_step');
      expect(stepEvents).toHaveLength(4);
    });
  });

  describe('edge cases', () => {
    it('handles missing session gracefully (no crash)', () => {
      vi.mocked(getSession).mockReturnValueOnce(undefined);

      const logger = new AttackerStepLogger('nonexistent-game');
      // Should not throw
      const step = logger.logThinking({ description: 'test' });
      expect(step).toBe(1);
      // Convex still called (fire-and-forget, doesn't depend on session)
      expect(recordedSteps).toHaveLength(1);
    });

    it('handles empty description', () => {
      const logger = new AttackerStepLogger('test-game-1');
      logger.logAction({ description: '' });
      expect(mockSession.attackerSteps[0].description).toBe('');
      expect(recordedSteps[0].description).toBe('');
    });

    it('handles undefined optional fields', () => {
      const logger = new AttackerStepLogger('test-game-1');
      logger.logAction({ description: 'test' });
      expect(recordedSteps[0].toolName).toBeUndefined();
      expect(recordedSteps[0].toolInput).toBeUndefined();
      expect(recordedSteps[0].toolResultSummary).toBeUndefined();
      expect(recordedSteps[0].screenshotBeforeId).toBeUndefined();
      expect(recordedSteps[0].domSnapshot).toBeUndefined();
    });
  });
});
