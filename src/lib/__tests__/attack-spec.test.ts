import { describe, it, expect } from 'vitest';
import {
  expandSuite,
  createAttackRuntimeState,
  type AttackSpec,
  type AttackEntry,
  type AttackSuite,
} from '../attack-spec';
import { PROMPT_TEMPLATES, getTemplateById, getTemplatesByObjective } from '../prompt-templates';

describe('AttackSpec types and expansion', () => {
  const mockTask = {
    id: 'amazon-toothpaste',
    label: 'Amazon Toothpaste',
    description: 'Search Amazon for Sensodyne toothpaste and add it to cart',
    startUrl: 'https://www.amazon.com',
    tags: ['shopping'],
  };

  describe('expandSuite', () => {
    it('expands prompt_injection suite into valid AttackSpec', () => {
      const spec = expandSuite('prompt_injection', mockTask);

      expect(spec.seed).toBe(42);
      expect(spec.attacks.length).toBeGreaterThanOrEqual(3);

      // All attacks should be prompt_injection family
      for (const attack of spec.attacks) {
        expect(attack.family).toBe('prompt_injection');
        expect(attack.primitive).toBeTruthy();
        expect(attack.trigger).toBeTruthy();
        expect(attack.placement).toBeTruthy();
      }
    });

    it('expands ui_robustness suite with legacy disruption IDs', () => {
      const spec = expandSuite('ui_robustness', mockTask);

      expect(spec.attacks.length).toBeGreaterThanOrEqual(2);

      // Should reference existing disruption IDs
      const primitiveIds = spec.attacks.map(a => a.primitive);
      expect(primitiveIds).toContain('popup-overlay');

      for (const attack of spec.attacks) {
        expect(attack.family).toBe('ui_breakage');
      }
    });

    it('expands phishing suite with credential theft objectives', () => {
      const spec = expandSuite('phishing', mockTask);

      expect(spec.attacks.length).toBeGreaterThanOrEqual(1);

      // Should have at least one credential_theft objective
      const hasCredTheft = spec.attacks.some(a => a.objective === 'credential_theft');
      expect(hasCredTheft).toBe(true);
    });

    it('expands mixed suite with attacks from multiple families', () => {
      const spec = expandSuite('mixed', mockTask);

      const families = new Set(spec.attacks.map(a => a.family));
      expect(families.size).toBeGreaterThanOrEqual(2);
    });

    it('all suites produce attacks with after_n_steps triggers', () => {
      const suites: AttackSuite[] = ['prompt_injection', 'ui_robustness', 'phishing', 'mixed'];

      for (const suite of suites) {
        const spec = expandSuite(suite, mockTask);
        // All attacks should have triggers
        for (const attack of spec.attacks) {
          expect(attack.trigger.type).toBeTruthy();
        }
      }
    });

    it('defaults to prompt_injection for unknown suite', () => {
      const spec = expandSuite('unknown' as AttackSuite, mockTask);
      expect(spec.attacks.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('createAttackRuntimeState', () => {
    it('initializes with zero state', () => {
      const state = createAttackRuntimeState();

      expect(state.firedCount).toBe(0);
      expect(state.firedAttackIndices.size).toBe(0);
      expect(state.lastKnownUrl).toBeNull();
      expect(state.intervalHandles).toHaveLength(0);
      expect(state.pendingJudgments.size).toBe(0);
    });
  });
});

describe('PromptTemplates', () => {
  it('has at least 8 templates', () => {
    expect(PROMPT_TEMPLATES.length).toBeGreaterThanOrEqual(8);
  });

  it('all templates have required fields', () => {
    for (const template of PROMPT_TEMPLATES) {
      expect(template.id).toBeTruthy();
      expect(template.text).toBeTruthy();
      expect(template.text.length).toBeGreaterThan(10);
      expect(template.objective).toBeTruthy();
      expect(template.carrier).toBeTruthy();
      expect(template.style).toBeTruthy();
      expect(template.fidelity).toBeTruthy();
      expect(template.sourceFamily).toBeTruthy();
    }
  });

  it('all template IDs are unique', () => {
    const ids = PROMPT_TEMPLATES.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers multiple objectives', () => {
    const objectives = new Set(PROMPT_TEMPLATES.map(t => t.objective));
    expect(objectives.has('derail')).toBe(true);
    expect(objectives.has('redirect')).toBe(true);
    expect(objectives.has('abort')).toBe(true);
    expect(objectives.has('credential_theft')).toBe(true);
  });

  it('getTemplateById returns correct template', () => {
    const template = getTemplateById('moved_functionality');
    expect(template.objective).toBe('redirect');
    expect(template.text).toContain('moved');
  });

  it('getTemplateById throws for unknown ID', () => {
    expect(() => getTemplateById('nonexistent')).toThrow('Prompt template not found');
  });

  it('getTemplatesByObjective filters correctly', () => {
    const redirectTemplates = getTemplatesByObjective('redirect');
    expect(redirectTemplates.length).toBeGreaterThanOrEqual(2);
    for (const t of redirectTemplates) {
      expect(t.objective).toBe('redirect');
    }
  });

  it('templates relevant to browser tasks only (no HR/review/SEO)', () => {
    for (const template of PROMPT_TEMPLATES) {
      // Should not contain HR/resume language
      expect(template.text.toLowerCase()).not.toContain('candidate');
      expect(template.text.toLowerCase()).not.toContain('resume');
      expect(template.text.toLowerCase()).not.toContain('hire');
      // Should not contain review manipulation
      expect(template.text.toLowerCase()).not.toContain('positive review');
    }
  });
});
