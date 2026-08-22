/**
 * EOI confirmation + SMS E.164 helpers + V2 receipt tests.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

const sendMail = vi.fn(async () => ({ ok: true, messageId: 'm1' }));
const sendSms = vi.fn(async () => ({ ok: true, sid: 'SM1' }));

vi.mock('../../services/email/mailer.js', () => ({
  sendMail: (...args) => sendMail(...args),
}));

vi.mock('../../services/sms/sendSms.js', async () => {
  const actual = await vi.importActual('../../services/sms/sendSms.js');
  return {
    ...actual,
    sendSms: (...args) => sendSms(...args),
  };
});

vi.mock('../../utils/publicWebBase.js', () => ({
  publicWebBase: () => 'https://cardbey.com',
}));

const { sendEoiConfirmation } = await import('./sendEoiConfirmation.js');
const { toE164Phone } = await import('../../services/sms/sendSms.js');
const { buildEoiConfirmationEmail, buildEoiConfirmationEmailV2 } = await import(
  './confirmationEmailTemplates.js'
);

describe('toE164Phone', () => {
  it('converts VN local numbers', () => {
    expect(toE164Phone('0451867365', { defaultCountry: 'VN' })).toBe('+84451867365');
  });

  it('returns null for empty / unparseable', () => {
    expect(toE164Phone('', { defaultCountry: 'VN' })).toBeNull();
  });
});

describe('buildEoiConfirmationEmailV2', () => {
  const prevTrack = process.env.ENABLE_GLOBAL_LIVE_EOI_APPLICANT_TRACKING_V1;

  beforeEach(() => {
    delete process.env.ENABLE_GLOBAL_LIVE_EOI_APPLICANT_TRACKING_V1;
  });

  afterEach(() => {
    if (prevTrack == null) delete process.env.ENABLE_GLOBAL_LIVE_EOI_APPLICANT_TRACKING_V1;
    else process.env.ENABLE_GLOBAL_LIVE_EOI_APPLICANT_TRACKING_V1 = prevTrack;
  });

  it('renders Vietnamese subject, preheader, reference and escapes HTML', () => {
    const built = buildEoiConfirmationEmailV2({
      name: 'Lan <script>',
      businessName: 'Cafe & Co',
      language: 'vi',
      pilotId: 'vn_au_global_live_v1',
      publicReference: 'GLabc1234567',
      createdAt: new Date('2026-08-14T10:00:00Z'),
      showcaseTypes: ['products', 'demonstration'],
      status: 'SUBMITTED',
    });

    expect(built.subject).toBe(
      'Cardbey đã nhận hồ sơ đăng ký thí điểm Global Live của bạn',
    );
    expect(built.preheader).toMatch(/đã được nhận/i);
    expect(built.preheader).not.toMatch(/Theo dõi trạng thái hồ sơ/);
    expect(built.html).toContain('GLabc1234567');
    expect(built.html).toContain('Cafe &amp; Co');
    expect(built.html).toContain('Lan &lt;script&gt;');
    expect(built.html).not.toContain('<script>');
    expect(built.html).toMatch(/Đã nhận/);
    expect(built.text).toContain('GLabc1234567');
    expect(built.text).not.toMatch(/theo dõi trạng thái hồ sơ/i);
  });

  it('renders English tracking CTA when tracking enabled + linked user', () => {
    process.env.ENABLE_GLOBAL_LIVE_EOI_APPLICANT_TRACKING_V1 = 'true';
    const built = buildEoiConfirmationEmailV2({
      name: 'Alex',
      businessName: 'Alex Store',
      language: 'en',
      publicReference: 'GLzzzzzzzzzz',
      userId: 'user_1',
      showcaseTypes: ['services'],
    });
    expect(built.subject).toBe('Cardbey has received your Global Live pilot application');
    expect(built.preheader).toMatch(/Track your application status/i);
    expect(built.html).toContain('View application status');
    expect(built.html).toContain('/me/global-live-applications');
    expect(built.text).toContain('does not guarantee selection');
  });

  it('uses safe name fallbacks', () => {
    const built = buildEoiConfirmationEmailV2({
      language: 'en',
      publicReference: 'GLfallback01',
    });
    expect(built.html).toMatch(/Hi there,/);
    expect(built.html).toMatch(/your business/);
  });
});

describe('sendEoiConfirmation', () => {
  const prevConfirm = process.env.ENABLE_GLOBAL_LIVE_EOI_CONFIRMATIONS;
  const prevV2 = process.env.ENABLE_GLOBAL_LIVE_EOI_CONFIRMATION_EMAIL_V2;
  const prevSms = process.env.ENABLE_GLOBAL_LIVE_EOI_CONFIRMATION_SMS;

  beforeEach(() => {
    sendMail.mockClear();
    sendSms.mockClear();
    delete process.env.ENABLE_GLOBAL_LIVE_EOI_CONFIRMATIONS;
    delete process.env.ENABLE_GLOBAL_LIVE_EOI_CONFIRMATION_SMS;
    delete process.env.ENABLE_GLOBAL_LIVE_EOI_CONFIRMATION_EMAIL_V2;
  });

  afterEach(() => {
    if (prevConfirm == null) delete process.env.ENABLE_GLOBAL_LIVE_EOI_CONFIRMATIONS;
    else process.env.ENABLE_GLOBAL_LIVE_EOI_CONFIRMATIONS = prevConfirm;
    if (prevV2 == null) delete process.env.ENABLE_GLOBAL_LIVE_EOI_CONFIRMATION_EMAIL_V2;
    else process.env.ENABLE_GLOBAL_LIVE_EOI_CONFIRMATION_EMAIL_V2 = prevV2;
    if (prevSms == null) delete process.env.ENABLE_GLOBAL_LIVE_EOI_CONFIRMATION_SMS;
    else process.env.ENABLE_GLOBAL_LIVE_EOI_CONFIRMATION_SMS = prevSms;
  });

  it('sends V2 subject when flag enabled', async () => {
    process.env.ENABLE_GLOBAL_LIVE_EOI_CONFIRMATION_EMAIL_V2 = 'true';
    await sendEoiConfirmation({
      name: 'Lan',
      businessName: 'Lan Cafe',
      email: 'lan@example.com',
      language: 'vi',
      publicReference: 'GLtestref001',
      pilotId: 'vn_au_global_live_v1',
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].subject).toBe(
      'Cardbey đã nhận hồ sơ đăng ký thí điểm Global Live của bạn',
    );
    expect(sendMail.mock.calls[0][0].text).toContain('GLtestref001');
  });

  it('keeps V1 subject when V2 flag off', async () => {
    process.env.ENABLE_GLOBAL_LIVE_EOI_CONFIRMATION_EMAIL_V2 = 'false';
    await sendEoiConfirmation({
      email: 'lan@example.com',
      language: 'vi',
      businessName: 'Lan Cafe',
    });
    expect(sendMail.mock.calls[0][0].subject).toBe(
      'Cardbey đã nhận đăng ký Global Live của bạn',
    );
  });

  it('buildEoiConfirmationEmail respects V2 flag', () => {
    process.env.ENABLE_GLOBAL_LIVE_EOI_CONFIRMATION_EMAIL_V2 = 'true';
    const v2 = buildEoiConfirmationEmail({ language: 'en', publicReference: 'GLx' });
    expect(v2.subject).toMatch(/has received your Global Live pilot application/i);
    process.env.ENABLE_GLOBAL_LIVE_EOI_CONFIRMATION_EMAIL_V2 = 'false';
    const v1 = buildEoiConfirmationEmail({ language: 'en', businessName: 'X' });
    expect(v1.subject).toMatch(/received your Global Live registration/i);
  });

  it('sends email only by default (SMS deferred)', async () => {
    const result = await sendEoiConfirmation({
      email: 'sumsign@gmail.com',
      phone: '0451867365',
      language: 'vi',
    });
    expect(result.email.ok).toBe(true);
    expect(result.sms.skipped).toBe(true);
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('skips when already sent (idempotent)', async () => {
    const result = await sendEoiConfirmation({
      email: 'a@b.com',
      confirmationEmailStatus: 'sent',
    });
    expect(result.email.skipped).toBe(true);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('skips when kill switch is off', async () => {
    process.env.ENABLE_GLOBAL_LIVE_EOI_CONFIRMATIONS = 'false';
    const result = await sendEoiConfirmation({ email: 'a@b.com' });
    expect(result.email.skipped).toBe(true);
    expect(sendMail).not.toHaveBeenCalled();
  });
});
