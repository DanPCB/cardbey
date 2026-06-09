// DANH: skill-round5-video
/**
 * generate_video_script — 15–30s script scaffold (read-only, no video API).
 */

export async function execute(input = {}) {
  // @pure-transform: deterministic video script scaffold; no DB/API side effects by design.
  const style = String(input?.style ?? 'brand_story');
  const duration = Number(input?.duration) || 30;
  const mood = String(input?.mood ?? 'warm');
  const storeName = String(input?.storeName ?? 'your store');
  const brandTone = String(input?.brandTone ?? 'friendly');

  const scenes = [
    { id: 1, shot: 'Opening logo / storefront', durationSec: 3 },
    { id: 2, shot: 'Hero product or service highlight', durationSec: Math.min(12, duration - 8) },
    { id: 3, shot: 'Call to action — visit or book', durationSec: 5 },
  ];

  const script = [
    `[${mood} ${style} — ${duration}s]`,
    `Welcome to ${storeName}.`,
    `Discover what makes us special — crafted with care for our community.`,
    `Visit us today. We're ready when you are.`,
  ].join(' ');

  return {
    status: 'ok',
    output: {
      script,
      scenes,
      voiceover: script,
      brandTone,
      duration,
    },
  };
}

export default execute;
