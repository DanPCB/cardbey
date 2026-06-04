import { describe, expect, it } from 'vitest';
import { validateVideoBinary, detectVideoContainer, MIN_VIDEO_BYTES } from './videoBinaryValidation.js';

function padMp4Header() {
  const buf = Buffer.alloc(MIN_VIDEO_BYTES + 8);
  buf.writeUInt32BE(0, 0);
  buf.write('ftyp', 4);
  return buf;
}

function padWebmHeader() {
  const buf = Buffer.alloc(MIN_VIDEO_BYTES + 4);
  buf[0] = 0x1a;
  buf[1] = 0x45;
  buf[2] = 0xdf;
  buf[3] = 0xa3;
  return buf;
}

describe('videoBinaryValidation', () => {
  it('rejects tiny video body', () => {
    const buf = Buffer.alloc(3000);
    buf.write('ftyp', 4);
    const r = validateVideoBinary(buf, 'video/mp4');
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('too_small');
  });

  it('rejects HTML response', () => {
    const html = Buffer.alloc(MIN_VIDEO_BYTES + 20, 0x20);
    html.write('<!DOCTYPE html><html>', 0);
    const r = validateVideoBinary(html, 'text/html');
    expect(r.valid).toBe(false);
  });

  it('valid MP4 ftyp passes', () => {
    const buf = padMp4Header();
    expect(detectVideoContainer(buf)).toBe('mp4');
    const r = validateVideoBinary(buf, 'video/mp4');
    expect(r.valid).toBe(true);
  });

  it('valid WebM header passes', () => {
    const buf = padWebmHeader();
    expect(detectVideoContainer(buf)).toBe('webm');
    const r = validateVideoBinary(buf, 'video/webm');
    expect(r.valid).toBe(true);
  });
});
