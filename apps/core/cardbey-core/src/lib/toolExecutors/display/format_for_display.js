/**
 * format_for_display — Adapt content to screen display profile.
 */

const DEFAULT_DISPLAY_PROFILE = {
  width: 1920,
  height: 1080,
  durationPerSlide: 5000,
  loop: true,
  transition: 'fade',
};

/**
 * @param {object} [input]
 * @param {object} [input.content]
 * @param {object} [input.displayProfile]
 */
export async function execute(input = {}) {
  try {
    const content = input?.content && typeof input.content === 'object' ? input.content : {};
    const displayProfile = {
      ...DEFAULT_DISPLAY_PROFILE,
      ...(input?.displayProfile && typeof input.displayProfile === 'object'
        ? input.displayProfile
        : {}),
    };

    const formatted = {
      ...content,
      displayProfile,
      formattedAt: new Date().toISOString(),
      readyForDevice: true,
    };

    return {
      status: 'ok',
      output: {
        ok: true,
        formatted,
      },
    };
  } catch (err) {
    const message = err?.message || String(err);
    return {
      status: 'failed',
      error: { code: 'FORMAT_FAILED', message },
      output: { ok: false, error: message },
    };
  }
}

export default execute;
