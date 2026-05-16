/**
 * Unit tests for mission config (text-only mission handling).
 */
import { describe, it, expect } from 'vitest';
import { TEST_MISSION_AGENT_CHAT, isTextOnlyMission } from './missionConfig.js';

describe('missionConfig', () => {
  describe('TEST_MISSION_AGENT_CHAT', () => {
    it('equals test-mission-agent-chat', () => {
      expect(TEST_MISSION_AGENT_CHAT).toBe('test-mission-agent-chat');
    });
  });

  describe('isTextOnlyMission', () => {
    it('returns true for test-mission-agent-chat', () => {
      expect(isTextOnlyMission('test-mission-agent-chat')).toBe(true);
    });

    it('returns true for trimmed test-mission-agent-chat', () => {
      expect(isTextOnlyMission('  test-mission-agent-chat  ')).toBe(true);
    });

    it('returns false for other mission ids', () => {
      expect(isTextOnlyMission('loyalty_from_card')).toBe(false);
      expect(isTextOnlyMission('')).toBe(false);
      expect(isTextOnlyMission('mission-123')).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(isTextOnlyMission(null)).toBe(false);
      expect(isTextOnlyMission(undefined)).toBe(false);
    });

    it('returns false for non-string', () => {
      expect(isTextOnlyMission(123)).toBe(false);
    });
  });
});
