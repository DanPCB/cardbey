/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  GUEST_POST_DRAFT_STORE_TOOLS,
  hasGuestDraftContext,
  hasGuestStoreBuildContext,
  missionPipelineOwnedByUser,
  shouldGateGuestPostDraftStoreAction,
} from '../guestDraftSignInGate.js';

describe('guestDraftSignInGate', () => {
  const guestReq = { isGuest: true, user: null };

  it('gates replace_store_catalog for guest with draft but no store', () => {
    expect(
      shouldGateGuestPostDraftStoreAction({
        req: guestReq,
        effectiveStoreId: null,
        draftId: 'draft-1',
        runway: null,
        tool: 'replace_store_catalog',
      }),
    ).toBe(true);
  });

  it('gates guest even when temp store id exists after store build', () => {
    expect(
      shouldGateGuestPostDraftStoreAction({
        req: guestReq,
        effectiveStoreId: 'store-guest-abc',
        draftId: 'draft-1',
        missionId: 'mission-1',
        runway: null,
        tool: 'replace_store_catalog',
      }),
    ).toBe(true);
  });

  it('does not gate signed-in users', () => {
    expect(
      shouldGateGuestPostDraftStoreAction({
        req: { isGuest: false, user: { id: 'user-1' } },
        effectiveStoreId: 'store-1',
        draftId: 'draft-1',
        runway: null,
        tool: 'replace_store_catalog',
      }),
    ).toBe(false);
  });

  it('hasGuestStoreBuildContext accepts mission or store id', () => {
    expect(hasGuestStoreBuildContext({ missionId: 'm-1' })).toBe(true);
    expect(hasGuestStoreBuildContext({ effectiveStoreId: 's-1' })).toBe(true);
    expect(hasGuestDraftContext({ draftId: 'd-1' })).toBe(true);
  });

  it('hasGuestDraftContext accepts runway.activeDraftId', () => {
    expect(hasGuestDraftContext({ runway: { activeDraftId: 'd-9' } })).toBe(true);
  });

  it('missionPipelineOwnedByUser allows null createdBy for guest actors', () => {
    expect(missionPipelineOwnedByUser({ createdBy: null }, 'guest_abc')).toBe(true);
    expect(missionPipelineOwnedByUser({ createdBy: null }, 'user-1')).toBe(false);
    expect(missionPipelineOwnedByUser({ createdBy: 'user-1' }, 'user-1')).toBe(true);
  });

  it('includes post-build store tools in gate set', () => {
    expect(GUEST_POST_DRAFT_STORE_TOOLS.has('replace_store_catalog')).toBe(true);
    expect(GUEST_POST_DRAFT_STORE_TOOLS.has('create_store')).toBe(false);
  });
});
