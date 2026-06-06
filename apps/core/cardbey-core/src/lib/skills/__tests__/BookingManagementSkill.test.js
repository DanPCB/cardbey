import { describe, it, expect } from 'vitest';
import { skillRegistry } from '../SkillRegistry.js';
import { BookingManagementSkill } from '../definitions/BookingManagementSkill.js';

describe('BookingManagementSkill', () => {
  it("registers under 'booking_management'", () => {
    expect(skillRegistry.has('booking_management')).toBe(true);
    expect(skillRegistry.get('booking_management')?.name).toBe('booking_management');
  });

  it('findByTrigger(book_appointment) returns BookingManagementSkill', () => {
    expect(skillRegistry.findByTrigger('book_appointment')?.name).toBe('booking_management');
  });

  it('findByTrigger(reserve_slot) returns BookingManagementSkill', () => {
    expect(skillRegistry.findByTrigger('reserve_slot')?.name).toBe('booking_management');
  });

  it('findByTrigger(booking) returns BookingManagementSkill', () => {
    expect(skillRegistry.findByTrigger('booking')?.name).toBe('booking_management');
  });

  it('findByTrigger(appointment) returns BookingManagementSkill', () => {
    expect(skillRegistry.findByTrigger('appointment')?.name).toBe('booking_management');
  });

  it('has 6 steps including optional booking summary', () => {
    const steps = BookingManagementSkill.steps;
    expect(steps).toHaveLength(6);
    expect(steps.map((s) => s.tool)).toEqual([
      'get_booking_summary',
      'check_booking_availability',
      'create_booking_record',
      'confirm_booking_customer',
      'schedule_booking_reminder',
      'handle_booking_outcome',
    ]);
  });

  it('create_booking condition is false when openSlots is 0', () => {
    const step = BookingManagementSkill.steps.find((s) => s.id === 'create_booking');
    expect(
      step?.condition?.({}, { check_availability: { output: { availability: { openSlots: 0 } } } }),
    ).toBe(false);
    expect(
      step?.condition?.({}, { check_availability: { output: { availability: { openSlots: 2 } } } }),
    ).toBe(true);
  });

  it('confirm_customer condition is false when no booking created', () => {
    const step = BookingManagementSkill.steps.find((s) => s.id === 'confirm_customer');
    expect(step?.condition?.({}, { create_booking: { output: {} } })).toBe(false);
    expect(
      step?.condition?.({}, { create_booking: { output: { booking: { id: 'b1' } } } }),
    ).toBe(true);
  });

  it('handle_outcome condition is false when no outcome in input', () => {
    const step = BookingManagementSkill.steps.find((s) => s.id === 'handle_outcome');
    expect(step?.condition?.({ toolInput: {} }, {})).toBe(false);
    expect(step?.condition?.({ toolInput: { outcome: 'completed' } }, {})).toBe(true);
  });

  it('retryPolicy shouldRetry is false for SLOT_UNAVAILABLE', () => {
    const shouldRetry = BookingManagementSkill.retryPolicy?.shouldRetry;
    expect(shouldRetry?.({ code: 'SLOT_UNAVAILABLE' })).toBe(false);
    expect(shouldRetry?.({ code: 'PERMISSION_DENIED' })).toBe(false);
    expect(shouldRetry?.({ code: 'TIMEOUT' })).toBe(true);
  });
});
