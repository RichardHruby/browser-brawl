import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  sessions: defineTable({
    gameId: v.string(),
    userId: v.optional(v.string()), // for future auth
    taskId: v.string(),
    taskLabel: v.string(),
    taskDescription: v.string(),
    taskStartUrl: v.string(),
    difficulty: v.union(
      v.literal('easy'),
      v.literal('medium'),
      v.literal('hard'),
      v.literal('nightmare'),
    ),
    mode: v.union(v.literal('realtime'), v.literal('turnbased')),
    phase: v.string(),
    healthFinal: v.optional(v.number()),
    startedAt: v.string(),
    endedAt: v.optional(v.string()),
    winner: v.optional(v.union(v.literal('attacker'), v.literal('defender'))),
    winReason: v.optional(
      v.union(
        v.literal('task_complete'),
        v.literal('health_depleted'),
        v.literal('aborted'),
      ),
    ),
    attackerType: v.optional(v.string()),
    attackerModel: v.string(),
    defenderModel: v.string(),
    hasDefender: v.optional(v.boolean()),
    durationSeconds: v.optional(v.number()),
    recordingStorageId: v.optional(v.id('_storage')),
    // Controllable defender fields
    attackSuite: v.optional(v.string()),
  }).index('by_gameId', ['gameId']),

  attackerSteps: defineTable({
    gameId: v.string(),
    stepNumber: v.number(),
    toolName: v.optional(v.string()),
    toolInput: v.optional(v.string()), // JSON
    toolResultSummary: v.optional(v.string()),
    description: v.string(),
    agentStatus: v.string(),
    timestamp: v.string(),
    screenshotBeforeId: v.optional(v.id('_storage')),
    screenshotAfterId: v.optional(v.id('_storage')),
    domSnapshot: v.optional(v.string()), // JSON of interactive elements
  }).index('by_gameId', ['gameId', 'stepNumber']),

  defenderActions: defineTable({
    gameId: v.string(),
    actionNumber: v.number(),
    disruptionId: v.string(),
    disruptionName: v.string(),
    description: v.string(),
    healthDamage: v.number(),
    success: v.boolean(),
    reasoning: v.string(),
    timestamp: v.string(),
    injectionPayload: v.optional(v.string()),
    domSnapshot: v.optional(v.string()),
    screenshotBeforeId: v.optional(v.id('_storage')),
    screenshotAfterId: v.optional(v.id('_storage')),
    attackerStepAtTime: v.optional(v.number()),
    // Structured labels (present when attackSpec is used)
    attackFamily: v.optional(v.string()),
    objective: v.optional(v.string()),
    concealment: v.optional(v.string()),
    authority: v.optional(v.string()),
    placement: v.optional(v.string()),
    // LLM judge verdict (populated async after injection)
    agentResponse: v.optional(v.string()),    // 'followed' | 'ignored' | 'partial'
    judgeReasoning: v.optional(v.string()),
  }).index('by_gameId', ['gameId', 'actionNumber']),

  healthTimeline: defineTable({
    gameId: v.string(),
    timestamp: v.string(),
    health: v.number(),
    delta: v.number(),
    cause: v.string(), // 'decay', 'disruption:<id>', 'initial'
  }).index('by_gameId', ['gameId']),

  eventsLog: defineTable({
    gameId: v.string(),
    eventType: v.string(),
    payloadJson: v.string(),
    timestamp: v.string(),
  }).index('by_gameId', ['gameId', 'timestamp']),

  networkRequests: defineTable({
    gameId: v.string(),
    timestamp: v.string(),
    method: v.string(),
    url: v.string(),
    status: v.optional(v.number()),
    resourceType: v.optional(v.string()),
    responseSize: v.optional(v.number()),
    stepRef: v.optional(v.string()),
  }).index('by_gameId', ['gameId']),

  // Full Claude conversation history for training data extraction
  conversations: defineTable({
    gameId: v.string(),
    stepNumber: v.number(),
    messages: v.string(), // JSON — full Anthropic messages array
    toolDefinitions: v.optional(v.string()), // JSON — tool schemas from MCP
    timestamp: v.string(),
  }).index('by_gameId', ['gameId', 'stepNumber']),

  // Training pipeline job tracking
  trainingJobs: defineTable({
    experimentName: v.string(),
    status: v.union(
      v.literal('preparing'),
      v.literal('uploading'),
      v.literal('training'),
      v.literal('merging'),
      v.literal('deploying'),
      v.literal('ready'),
      v.literal('failed'),
    ),
    gameIds: v.array(v.string()),
    gameCount: v.number(),
    textOnly: v.boolean(),
    startedAt: v.string(),
    completedAt: v.optional(v.string()),
    error: v.optional(v.string()),
    // Training metrics (updated by Modal callback)
    currentStep: v.optional(v.number()),
    totalSteps: v.optional(v.number()),
    currentLoss: v.optional(v.number()),
    // Deployment info
    serveUrl: v.optional(v.string()),
    // Convex file storage for the training JSONL
    trainingDataStorageId: v.optional(v.id('_storage')),
  }).index('by_experimentName', ['experimentName']),

  // Early access waitlist
  waitlist: defineTable({
    email: v.string(),
    joinedAt: v.string(),
    source: v.optional(v.string()),
  }).index('by_email', ['email']),
});
