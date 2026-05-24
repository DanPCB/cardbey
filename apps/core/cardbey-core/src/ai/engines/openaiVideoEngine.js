/**
 * OpenAI Video Engine — Sora via Videos API.
 */

import { generateOpenAiPromoVideo } from '../../lib/video/openaiVideoProvider.js';

export const openaiVideoEngine = {
  name: 'openai-sora-videos-v1',

  /**
   * @param {{ prompt: string; lengthSeconds?: number; style?: string; storeId?: string; aspectRatio?: string }} params
   * @param {{ onJobCreated?: Function; onPoll?: Function }} [hooks]
   */
  async generateVideo(params, hooks) {
    const result = await generateOpenAiPromoVideo(
      {
        prompt: params.prompt,
        lengthSeconds: params.lengthSeconds,
        style: params.style,
        storeId: params.storeId,
        aspectRatio: params.aspectRatio,
      },
      {},
      hooks,
    );

    return {
      videoUrl: result.url,
      thumbnailUrl: result.thumbnailUrl,
      providerJobId: result.providerJobId,
      raw: result.metadata,
    };
  },
};
