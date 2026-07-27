/**
 * Refusal detection so OCR never stores assistant-style refusals as business card text.
 */

import { describe, it, expect } from 'vitest';
import {
  businessCardLooksLikeOcrText,
  isRefusalResponse,
  invalidTextForBusinessCard,
} from '../src/modules/vision/runOcr.js';

describe('runOcr refusal detection', () => {
  describe('isRefusalResponse', () => {
    it('detects "I\'m unable to process this request."', () => {
      expect(isRefusalResponse("I'm unable to process this request.")).toBe(true);
    });
    it('detects "I\'m unable to process this request.." (double period)', () => {
      expect(isRefusalResponse("I'm unable to process this request..")).toBe(true);
    });
    it('detects Unicode apostrophe in I\'m', () => {
      expect(isRefusalResponse("I\u2019m unable to process this request.")).toBe(true);
    });
    it('detects "I\'m sorry, I can\'t assist"', () => {
      expect(isRefusalResponse("I'm sorry, but I can't assist with that.")).toBe(true);
    });
    it('detects "unable to process"', () => {
      expect(isRefusalResponse('Sorry, I am unable to process this image.')).toBe(true);
    });
    it('detects "cannot process" / "can\'t process"', () => {
      expect(isRefusalResponse('I cannot process this request.')).toBe(true);
      expect(isRefusalResponse("I can't process that.")).toBe(true);
    });
    it('detects "I\'m unable" / "I am unable"', () => {
      expect(isRefusalResponse("I'm unable to help with that.")).toBe(true);
      expect(isRefusalResponse('I am unable to assist.')).toBe(true);
    });
    it('detects "I don\'t have access" and "cannot view images"', () => {
      expect(isRefusalResponse("I don't have access to that.")).toBe(true);
      expect(isRefusalResponse('I cannot view images.')).toBe(true);
      expect(isRefusalResponse("I can't view images in this context.")).toBe(true);
    });
    it('detects "unable to extract"', () => {
      expect(isRefusalResponse('I am unable to extract text from this image.')).toBe(true);
    });
    it('does not flag valid business card excerpt', () => {
      expect(isRefusalResponse('PTH International Furniture\nUnit 5/12 Makland Drive\n0413 091 777')).toBe(false);
    });
  });

  describe('invalidTextForBusinessCard', () => {
    it('returns true for refusal text', () => {
      expect(invalidTextForBusinessCard("I'm unable to process this request.")).toBe(true);
    });
    it('returns true for too short text', () => {
      expect(invalidTextForBusinessCard('Hi')).toBe(true);
    });
    it('returns false for valid card-like text', () => {
      expect(
        invalidTextForBusinessCard('PTH Furniture\nDerrimut VIC 3026\n0413 091 777\npth.aus2023@gmail.com')
      ).toBe(false);
    });
  });

  describe('businessCardLooksLikeOcrText', () => {
    it('returns true when text contains email (@)', () => {
      expect(businessCardLooksLikeOcrText('Contact: john@example.com')).toBe(true);
      expect(businessCardLooksLikeOcrText('Sales team sales@company.com.au')).toBe(true);
    });
    it('returns true when text contains url/domain (www, http, .com, .au)', () => {
      expect(businessCardLooksLikeOcrText('Visit www.example.com')).toBe(true);
      expect(businessCardLooksLikeOcrText('https://company.com.au')).toBe(true);
      expect(businessCardLooksLikeOcrText('Website example.com')).toBe(true);
      expect(businessCardLooksLikeOcrText('Domain company.au')).toBe(true);
    });
    it('returns true when text has phone-like digit run (>= 8 digits)', () => {
      expect(businessCardLooksLikeOcrText('Phone 0413091777')).toBe(true);
      expect(businessCardLooksLikeOcrText('0413 091 777')).toBe(true);
      expect(businessCardLooksLikeOcrText('Call 03 9876 5432')).toBe(true);
    });
    it('returns true when text has state + 4-digit postcode', () => {
      expect(businessCardLooksLikeOcrText('Derrimut VIC 3026')).toBe(true);
      expect(businessCardLooksLikeOcrText('Sydney NSW 2000')).toBe(true);
      expect(businessCardLooksLikeOcrText('Perth WA 6000')).toBe(true);
    });
    it('returns false for refusal or non-card text', () => {
      expect(businessCardLooksLikeOcrText("I'm unable to process this request.")).toBe(false);
      expect(businessCardLooksLikeOcrText('Hello world')).toBe(false);
      expect(businessCardLooksLikeOcrText('Just a business name')).toBe(false);
    });
    it('returns false for empty or too short text', () => {
      expect(businessCardLooksLikeOcrText('')).toBe(false);
      expect(businessCardLooksLikeOcrText('Hi')).toBe(false);
    });
  });
});
