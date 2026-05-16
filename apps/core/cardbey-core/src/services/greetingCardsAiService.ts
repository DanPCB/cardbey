/**
 * Greeting Cards AI Service
 * Generates greeting messages using AI
 */

import { generateText } from './aiService.js';

export interface GreetingAiInput {
  type: string;
  templateKey: string;
  tone?: string;
  language?: string;
}

/**
 * Generate a greeting message for a greeting card
 */
export async function generateGreetingMessage(
  input: GreetingAiInput
): Promise<string> {
  const language = input.language === 'vi' ? 'vi' : 'en';
  const tone = input.tone || 'warm';

  const promptEn = `
You are an assistant that writes short, heartfelt greeting messages.

Context:
- Occasion type: ${input.type}
- Template: ${input.templateKey}
- Tone: ${tone}

Write a short greeting message (2–4 lines) for a digital greeting card.
Do not include a title or signature, just the body of the message.
  `.trim();

  const promptVi = `
Bạn là trợ lý viết lời chúc ngắn gọn, ấm áp.

Ngữ cảnh:
- Dịp: ${input.type}
- Mẫu thiệp: ${input.templateKey}
- Giọng điệu: ${tone}

Hãy viết 1 lời chúc (2–4 dòng) để in trên thiệp chúc mừng kỹ thuật số.
Không cần tiêu đề hay chữ ký, chỉ cần nội dung lời chúc.
  `.trim();

  const prompt = language === 'vi' ? promptVi : promptEn;

  try {
    // Use existing text-generation function
    const result = await generateText({
      prompt,
      language,
      tone: tone as 'neutral' | 'friendly' | 'professional' | 'playful',
      context: {
        section: 'body',
        templateName: input.templateKey,
      },
    });

    const text = result.text?.trim() || '';

    // Fallback if AI failed or returned empty
    if (!text || text.length === 0) {
      return language === 'vi'
        ? 'Chúc bạn một mùa lễ thật ấm áp, tràn đầy yêu thương và niềm vui.'
        : 'Wishing you a warm holiday season filled with love, joy and little moments of magic.';
    }

    return text;
  } catch (error) {
    console.error('[GreetingCardsAI] Error generating message:', error);
    
    // Return fallback message on error
    return language === 'vi'
      ? 'Chúc bạn một mùa lễ thật ấm áp, tràn đầy yêu thương và niềm vui.'
      : 'Wishing you a warm holiday season filled with love, joy and little moments of magic.';
  }
}

