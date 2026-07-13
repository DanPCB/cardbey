/**
 * create_creator_content_draft — explicit draft creation alias (Runtime Authority).
 */

import { execute as publishExecute } from './publish_creator_content.js';

export async function execute(input = {}, context = {}) {
  return publishExecute(
    {
      ...input,
      publish: false,
      action: 'draft',
    },
    context,
  );
}

export default { execute };
