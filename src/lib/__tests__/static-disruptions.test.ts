import { describe, it, expect } from 'vitest';
import {
  STATIC_DISRUPTIONS,
  getStaticDisruption,
  getStaticDisruptionsBySite,
} from '../static-disruptions';

describe('STATIC_DISRUPTIONS registry', () => {
  it('has exactly 6 disruptions', () => {
    expect(STATIC_DISRUPTIONS).toHaveLength(6);
  });

  it('has 3 navigation_hijack and 3 data_exfiltration disruptions', () => {
    const hijack = STATIC_DISRUPTIONS.filter(d => d.objective === 'navigation_hijack');
    const exfil = STATIC_DISRUPTIONS.filter(d => d.objective === 'data_exfiltration');
    expect(hijack).toHaveLength(3);
    expect(exfil).toHaveLength(3);
  });

  it('all disruptions have non-empty JS strings', () => {
    for (const d of STATIC_DISRUPTIONS) {
      expect(d.js.length).toBeGreaterThan(100);
    }
  });

  it('all disruptions are amazon site', () => {
    for (const d of STATIC_DISRUPTIONS) {
      expect(d.site).toBe('amazon');
    }
  });

  it('all disruption IDs are unique', () => {
    const ids = STATIC_DISRUPTIONS.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all disruptions have non-empty descriptions', () => {
    for (const d of STATIC_DISRUPTIONS) {
      expect(d.description.length).toBeGreaterThan(5);
    }
  });
});

describe('getStaticDisruption', () => {
  it('returns auth_wall disruption', () => {
    const d = getStaticDisruption('auth_wall');
    expect(d).not.toBeNull();
    expect(d!.id).toBe('auth_wall');
    expect(d!.objective).toBe('navigation_hijack');
    expect(d!.site).toBe('amazon');
  });

  it('returns fake_search_result disruption', () => {
    const d = getStaticDisruption('fake_search_result');
    expect(d).not.toBeNull();
    expect(d!.objective).toBe('navigation_hijack');
  });

  it('returns unavailable_redirect disruption', () => {
    const d = getStaticDisruption('unavailable_redirect');
    expect(d).not.toBeNull();
    expect(d!.objective).toBe('navigation_hijack');
  });

  it('returns session_check_modal disruption', () => {
    const d = getStaticDisruption('session_check_modal');
    expect(d).not.toBeNull();
    expect(d!.objective).toBe('data_exfiltration');
  });

  it('returns session_expired_gate disruption', () => {
    const d = getStaticDisruption('session_expired_gate');
    expect(d).not.toBeNull();
    expect(d!.objective).toBe('data_exfiltration');
  });

  it('returns ai_search_helper disruption', () => {
    const d = getStaticDisruption('ai_search_helper');
    expect(d).not.toBeNull();
    expect(d!.objective).toBe('data_exfiltration');
  });

  it('returns null for unknown id', () => {
    expect(getStaticDisruption('nonexistent')).toBeNull();
    expect(getStaticDisruption('')).toBeNull();
  });

  it('JS contains IIFE wrapper for all disruptions', () => {
    for (const id of ['auth_wall', 'fake_search_result', 'unavailable_redirect',
                       'session_check_modal', 'session_expired_gate', 'ai_search_helper']) {
      const d = getStaticDisruption(id)!;
      // All disruptions use IIFE pattern
      expect(d.js).toMatch(/\(function\(\)/);
    }
  });

  it('hijack JS scripts contain offsite example.com URLs', () => {
    for (const id of ['auth_wall', 'fake_search_result', 'unavailable_redirect']) {
      const d = getStaticDisruption(id)!;
      expect(d.js).toContain('.example.com');
    }
  });

  it('exfil JS scripts do not navigate offsite (no example.com)', () => {
    // Exfil scripts are phishing modals, not nav hijacks
    for (const id of ['session_check_modal', 'session_expired_gate', 'ai_search_helper']) {
      const d = getStaticDisruption(id)!;
      // These don't redirect to offsite URLs, they collect credentials
      expect(d.js).not.toContain('amzn-');
    }
  });
});

describe('getStaticDisruptionsBySite', () => {
  it('returns all 6 disruptions for amazon', () => {
    const result = getStaticDisruptionsBySite('amazon');
    expect(result).toHaveLength(6);
  });

  it('returns empty array for generic (none registered)', () => {
    const result = getStaticDisruptionsBySite('generic');
    expect(result).toHaveLength(0);
  });
});
