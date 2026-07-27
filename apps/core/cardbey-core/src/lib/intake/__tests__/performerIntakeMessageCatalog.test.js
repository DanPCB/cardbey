/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { intakeMessage } from '../performerIntakeMessageCatalog.js';
import { localeInstruction } from '../../localePrompt.js';

describe('performerIntakeMessageCatalog', () => {
  it('returns Vietnamese strings for vi locale', () => {
    expect(intakeMessage('signInToContinue', 'vi')).toBe('Cần đăng nhập để tiếp tục.');
    expect(intakeMessage('signInToAddProducts', 'en')).toContain('Sign in to add products');
    expect(intakeMessage('planBuildFailed', 'vi-VN')).toBe('Chưa đủ bước cho kế hoạch.');
    expect(intakeMessage('storeCheckpointStore', 'vi', { businessName: 'Hoa Shop' })).toContain(
      'Hoa Shop',
    );
  });

  it('localeInstruction produces Vietnamese guidance for store tools', () => {
    expect(localeInstruction('vi')).toContain('Vietnamese');
  });
});
