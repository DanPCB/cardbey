#!/usr/bin/env node

/**
 * ============================================================
 * LEARNING LAYER — E2E TEST SCRIPT
 * ============================================================
 *
 * Run: node scripts/test-learning-e2e.js
 *
 * Requires core API running (default http://localhost:3001).
 */

import '../src/env/loadEnv.js';
import { getPrismaClient } from '../src/lib/prisma.js';

const BASE_URL =
  process.env.LEARNING_E2E_BASE_URL ||
  process.env.CORE_PUBLIC_URL ||
  process.env.API_BASE_URL ||
  'http://localhost:3001';
const prisma = getPrismaClient();
const testUserId = `e2e_test_${Date.now()}`;

async function log(result, success) {
  console.log(success ? '✅' : '❌', result);
}

async function testFeedback() {
  console.log('\n📝 Testing Feedback API...');

  const postResult = await fetch(`${BASE_URL}/api/learning/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: testUserId,
      type: 'thumbs_up',
      targetType: 'intent',
      targetId: 'create_store',
      metadata: { confidence: 0.95 },
    }),
  });

  if (!postResult.ok) {
    await log(`POST feedback failed (${postResult.status})`, false);
    console.log(await postResult.text());
    return false;
  }

  const postData = await postResult.json();
  await log(`POST feedback: ${postResult.status}`, true);

  const getResult = await fetch(`${BASE_URL}/api/learning/feedback?userId=${testUserId}`);
  const feedbackData = await getResult.json();

  if (!getResult.ok || !feedbackData.feedback || feedbackData.feedback.length === 0) {
    await log('GET feedback failed or empty', false);
    return false;
  }

  await log(`GET feedback: ${feedbackData.feedback.length} records`, true);

  const feedbackId = postData.feedback?.id;
  const dbRecord = feedbackId
    ? await prisma.userFeedback.findUnique({ where: { id: feedbackId } })
    : null;

  if (!dbRecord) {
    const dbRecords = await prisma.userFeedback.count({
      where: { userId: testUserId },
    });
    if (dbRecords === 0) {
      await log(
        'Database records not found (ensure script and API server share the same DATABASE_URL)',
        false,
      );
      return false;
    }
  }

  await log(`Database: verified feedback persisted`, true);
  return true;
}

async function testCorrection() {
  console.log('\n📝 Testing Correction API...');

  const result = await fetch(`${BASE_URL}/api/learning/correction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: testUserId,
      originalIntent: 'create_store',
      correctedIntent: 'add_product',
    }),
  });

  if (!result.ok) {
    await log(`POST correction failed (${result.status})`, false);
    console.log(await result.text());
    return false;
  }

  await log(`POST correction: ${result.status}`, true);
  return true;
}

async function testProfile() {
  console.log('\n📝 Testing Profile API...');

  const result = await fetch(`${BASE_URL}/api/learning/profile?userId=${testUserId}`);
  const data = await result.json();

  if (!result.ok) {
    await log('GET profile failed', false);
    console.log(data);
    return false;
  }

  await log(`GET profile: ${data.hasLearningData ? 'has data' : 'no data'}`, true);
  return true;
}

async function testHealth() {
  console.log('\n📝 Testing Health API...');

  const result = await fetch(`${BASE_URL}/api/learning/health`);
  const data = await result.json();

  if (!result.ok || !data.success) {
    await log('GET health failed', false);
    return false;
  }

  await log(`Health: ${data.status}`, true);
  return true;
}

async function main() {
  console.log('🧪 Learning Layer E2E Test');
  console.log('===========================');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test User: ${testUserId}`);
  console.log(`Database: ${process.env.DATABASE_URL?.split('?')[0] ?? '(unset)'}`);

  try {
    const healthOk = await testHealth();
    const feedbackOk = await testFeedback();
    const correctionOk = await testCorrection();
    const profileOk = await testProfile();

    console.log('\n===========================');
    if (healthOk && feedbackOk && correctionOk && profileOk) {
      console.log('✅ All E2E tests passed!');
    } else {
      console.log('❌ Some tests failed. See logs above.');
      process.exitCode = 1;
    }

    await prisma.userFeedback.deleteMany({ where: { userId: testUserId } });
    await prisma.behaviorPattern.deleteMany({ where: { userId: testUserId } });
    await prisma.userProfile.deleteMany({ where: { userId: testUserId } });
    console.log('🧹 Cleanup complete');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main();
