/**
 * Quick Test Script - Post Rollback Store Creation
 * Tests store creation after rollback to 1pm restore point
 * 
 * Run: node test-rollback.js
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3001';

async function testStoreCreation() {
  console.log('🧪 Testing Store Creation After Rollback\n');
  console.log('='.repeat(50));
  
  const generationRunId = `test-rollback-${Date.now()}`;
  
  // Test 1: Create Orchestra Job
  console.log('\n[1/4] Creating orchestra job...');
  try {
    const createResponse = await fetch(`${BASE_URL}/api/mi/orchestra/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // NOTE: You'll need to add Authorization header with a valid token
        // 'Authorization': 'Bearer YOUR_TOKEN_HERE'
      },
      body: JSON.stringify({
        goal: 'build_store',
        rawInput: 'Test Chinese Restaurant. Type: Chinese. Location: Melbourne',
        generationRunId,
        createNewStore: true,
        businessName: 'Test Chinese Restaurant',
        request: {
          sourceType: 'form',
          generationRunId,
          businessType: 'chinese',
          location: 'Melbourne'
        },
        businessTypeHint: 'chinese'
      }),
    });

    if (createResponse.status >= 500) {
      console.error(`❌ Server error (${createResponse.status}): ${createResponse.statusText}`);
      const errorText = await createResponse.text();
      console.error(`Error: ${errorText}`);
      console.error('\n⚠️  This may indicate a rollback issue (TDZ error, Prisma error, etc.)');
      return false;
    }

    if (!createResponse.ok) {
      console.error(`❌ Job creation failed: ${createResponse.status} ${createResponse.statusText}`);
      const errorText = await createResponse.text();
      console.error(`Error: ${errorText}`);
      return false;
    }

    const createData = await createResponse.json();
    if (!createData.ok || !createData.jobId) {
      console.error(`❌ Invalid response:`, createData);
      return false;
    }

    const { jobId, storeId } = createData;
    console.log(`✅ Job created: ${jobId}`);
    console.log(`   Store ID: ${storeId}`);
    console.log(`   Generation Run ID: ${generationRunId}`);

    // Test 2: Run Job
    console.log(`\n[2/4] Running job ${jobId}...`);
    const runResponse = await fetch(`${BASE_URL}/api/mi/orchestra/job/${jobId}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 'Authorization': 'Bearer YOUR_TOKEN_HERE'
      },
      body: JSON.stringify({
        generationRunId
      }),
    });

    if (!runResponse.ok) {
      console.error(`❌ Job run failed: ${runResponse.status} ${runResponse.statusText}`);
      const errorText = await runResponse.text();
      console.error(`Error: ${errorText}`);
      return false;
    }

    const runData = await runResponse.json();
    console.log(`✅ Job started: ${runData.status || 'running'}`);

    // Wait for seed_catalog to complete
    console.log('\n⏳ Waiting for seed_catalog to complete (3 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Test 3: Sync Store
    console.log(`\n[3/4] Syncing store...`);
    const syncResponse = await fetch(`${BASE_URL}/api/mi/orchestra/job/${jobId}/sync-store`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 'Authorization': 'Bearer YOUR_TOKEN_HERE'
      },
      body: JSON.stringify({
        generationRunId
      }),
    });

    if (!syncResponse.ok) {
      console.error(`❌ Sync failed: ${syncResponse.status} ${syncResponse.statusText}`);
      const errorText = await syncResponse.text();
      console.error(`Error: ${errorText}`);
      return false;
    }

    const syncData = await syncResponse.json();
    if (!syncData.ok) {
      console.error(`❌ Sync returned error:`, syncData);
      return false;
    }

    const productsWritten = syncData.productsWritten || 0;
    console.log(`✅ Sync complete: ${productsWritten} products written`);

    if (productsWritten === 0) {
      console.error(`\n⚠️  WARNING: No products written! This may indicate a rollback issue.`);
      return false;
    }

    // Test 4: Check Draft
    console.log(`\n[4/4] Checking draft endpoint...`);
    const draftResponse = await fetch(`${BASE_URL}/api/stores/${storeId}/draft?generationRunId=${generationRunId}`, {
      headers: {
        // 'Authorization': 'Bearer YOUR_TOKEN_HERE'
      },
    });

    if (!draftResponse.ok) {
      console.error(`❌ Draft fetch failed: ${draftResponse.status} ${draftResponse.statusText}`);
      return false;
    }

    const draftData = await draftResponse.json();
    const productsCount = draftData.productsCount || 0;
    console.log(`✅ Draft retrieved: ${productsCount} products`);

    if (productsCount === 0) {
      console.error(`\n⚠️  WARNING: Draft shows 0 products! This may indicate a rollback issue.`);
      return false;
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('✅ ALL TESTS PASSED');
    console.log(`   Job ID: ${jobId}`);
    console.log(`   Store ID: ${storeId}`);
    console.log(`   Products Written: ${productsWritten}`);
    console.log(`   Products in Draft: ${productsCount}`);
    console.log('\n✅ Store creation is working after rollback!');
    return true;

  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

// Run test
testStoreCreation()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

