/**
 * Minimal language detect for inbox replies (en/vi). Does not translate the source message.
 */

const VI_DIACRITICS = /[ăâêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵđ]/i;
const VI_WORDS =
  /\b(tôi|bạn|không|được|muốn|cửa hàng|doanh nghiệp|đăng ký|hợp tác|sản phẩm|dịch vụ|pilot)\b/i;

export function detectInboxLanguage(text) {
  const raw = String(text || '');
  if (VI_DIACRITICS.test(raw) || VI_WORDS.test(raw)) return 'vi';
  return 'en';
}
