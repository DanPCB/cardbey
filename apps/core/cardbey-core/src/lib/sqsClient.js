// src/lib/sqsClient.js
// AWS SQS client for publishing video optimization jobs

import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { info, error } from './logger.js';

// Initialize SQS client
const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || 'ap-southeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const queueUrl = process.env.AWS_SQS_VIDEO_QUEUE_URL;

/**
 * Publish a video optimization job to SQS
 * 
 * @param {object} params - Job parameters
 * @param {string} params.assetId - Media asset ID
 * @param {string} params.bucket - S3 bucket name
 * @param {string} params.storageKey - S3 key for original video
 * @param {string} params.mimeType - MIME type of the video
 * @returns {Promise<object>} SQS message result
 */
export async function publishVideoOptimizeJob({ assetId, bucket, storageKey, mimeType }) {
  if (!queueUrl) {
    throw new Error('AWS_SQS_VIDEO_QUEUE_URL environment variable is not set');
  }
  
  if (!assetId || !bucket || !storageKey || !mimeType) {
    throw new Error('Missing required parameters: assetId, bucket, storageKey, mimeType');
  }
  
  // Validate it's a video
  if (!mimeType.startsWith('video/')) {
    throw new Error(`Invalid MIME type for video optimization: ${mimeType}`);
  }
  
  const messageBody = JSON.stringify({
    assetId,
    bucket,
    storageKey,
    mimeType,
  });
  
  try {
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: messageBody,
      // For FIFO queues, you'd add:
      // MessageGroupId: 'video-optimization',
      // MessageDeduplicationId: `${assetId}-${Date.now()}`,
    });
    
    const result = await sqsClient.send(command);
    
    info('OPTIMIZER', 'Published SQS optimize job', {
      assetId,
      storageKey,
      messageId: result.MessageId,
      queueUrl: queueUrl.substring(0, 50) + '...', // Log partial URL for security
    });
    
    return result;
  } catch (err) {
    error('OPTIMIZER', 'Failed to publish SQS optimize job', {
      assetId,
      storageKey,
      errorMessage: err.message,
      errorCode: err.code,
    });
    throw err;
  }
}


