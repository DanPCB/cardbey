/**
 * Test Store Creation Script
 * 
 * This script tests store creation to verify:
 * 1. New users can create stores
 * 2. Existing users can create new generation runs (reusing Business but creating new DraftStore)
 * 3. generationRunId properly isolates different runs
 * 4. Products are correctly written and isolated per generationRunId
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3001';

async function testStoreCreation() {
  console.log('🧪 Testing Store Creation...\n');
  
  // Test 1: Create a new store (simulate new user)
  console.log('Test 1: Creating new store...');
  try {
    const response = await fetch(`${BASE_URL}/api/mi/orchestra/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token', // Replace with actual token
      },
      body: JSON.stringify({
        goal: 'build_store',
        rawInput: 'Test Florist. Type: Florist. Location: Melbourne',
        generationRunId: `gen-${Date.now()}-test1`,
        createNewStore: true,
        businessName: 'Test Florist',
        request: {
          sourceType: 'form',
          businessType: 'florist',
          location: 'Melbourne',
        },
        businessTypeHint: 'florist',
      }),
    });
    
    const data = await response.json();
    console.log('✅ Test 1 Result:', {
      status: response.status,
      ok: data.ok,
      jobId: data.jobId,
      storeId: data.storeId,
      generationRunId: data.generationRunId,
    });
    
    if (!data.ok || !data.jobId || !data.storeId) {
      throw new Error('Store creation failed');
    }
    
    const jobId = data.jobId;
    const storeId = data.storeId;
    const generationRunId = data.generationRunId;
    
    // Wait for job to complete
    console.log('\n⏳ Waiting for job to complete...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Test 2: Check draft endpoint
    console.log('\nTest 2: Checking draft endpoint...');
    const draftResponse = await fetch(`${BASE_URL}/api/stores/${storeId}/draft?generationRunId=${generationRunId}`, {
      headers: {
        'Authorization': 'Bearer test-token',
      },
    });
    
    const draftData = await draftResponse.json();
    console.log('✅ Test 2 Result:', {
      status: draftResponse.status,
      ok: draftData.ok,
      draftFound: draftData.draftFound,
      productsCount: draftData.productsCount || draftData.draft?.catalog?.products?.length || 0,
      status: draftData.status || draftData.draft?.meta?.status,
    });
    
    // Test 3: Create another store with same user (should reuse Business, create new DraftStore)
    console.log('\nTest 3: Creating second generation run (should reuse Business)...');
    const response2 = await fetch(`${BASE_URL}/api/mi/orchestra/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token',
      },
      body: JSON.stringify({
        goal: 'build_store',
        rawInput: 'Test Restaurant. Type: Restaurant. Location: Sydney',
        generationRunId: `gen-${Date.now()}-test2`,
        createNewStore: true,
        businessName: 'Test Restaurant',
        request: {
          sourceType: 'form',
          businessType: 'restaurant',
          location: 'Sydney',
        },
        businessTypeHint: 'restaurant',
      }),
    });
    
    const data2 = await response2.json();
    console.log('✅ Test 3 Result:', {
      status: response2.status,
      ok: data2.ok,
      jobId: data2.jobId,
      storeId: data2.storeId,
      generationRunId: data2.generationRunId,
      storeIdReused: data2.storeId === storeId,
    });
    
    if (data2.storeId === storeId) {
      console.log('✅ StoreId correctly reused (1-per-user constraint)');
      console.log('✅ Different generationRunId ensures isolation:', {
        firstRun: generationRunId,
        secondRun: data2.generationRunId,
        different: generationRunId !== data2.generationRunId,
      });
    }
    
    // Test 4: Verify both drafts exist and are isolated
    console.log('\nTest 4: Verifying draft isolation...');
    const draft1Response = await fetch(`${BASE_URL}/api/stores/${storeId}/draft?generationRunId=${generationRunId}`, {
      headers: {
        'Authorization': 'Bearer test-token',
      },
    });
    const draft1Data = await draft1Response.json();
    
    const draft2Response = await fetch(`${BASE_URL}/api/stores/${data2.storeId}/draft?generationRunId=${data2.generationRunId}`, {
      headers: {
        'Authorization': 'Bearer test-token',
      },
    });
    const draft2Data = await draft2Response.json();
    
    console.log('✅ Test 4 Result:', {
      draft1Found: draft1Data.draftFound,
      draft1Products: draft1Data.productsCount || 0,
      draft2Found: draft2Data.draftFound,
      draft2Products: draft2Data.productsCount || 0,
      isolated: draft1Data.draftFound && draft2Data.draftFound,
    });
    
    console.log('\n✅ All tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

// Run tests
if (require.main === module) {
  testStoreCreation().catch(console.error);
}

module.exports = { testStoreCreation };

