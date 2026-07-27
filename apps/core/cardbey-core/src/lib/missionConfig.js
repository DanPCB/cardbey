/**
 * Mission configuration for agent chat and OCR behavior.
 * Single source of truth for mission IDs that have special handling (e.g. text-only test mission).
 */

/** Mission ID used by the dashboard Agent Chat test page (/app/back/agent-chat-test). Text-only; no OCR required. */
export const TEST_MISSION_AGENT_CHAT = 'test-mission-agent-chat';

/**
 * Whether this mission is configured as text-only (no mandatory OCR, planner-only chat).
 * Used to skip OCR runs and fail OCR gracefully with a planner reply instead of "Run failed".
 *
 * @param {string} missionId
 * @returns {boolean}
 */
export function isTextOnlyMission(missionId) {
  if (!missionId || typeof missionId !== 'string') return false;
  return missionId.trim() === TEST_MISSION_AGENT_CHAT;
}
