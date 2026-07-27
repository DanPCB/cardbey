# Context Engine Examples

## Store creation then upload (Test Case 1)

```js
const provider = getContextProvider();

// User creates store
await provider.updateContext('user-1', 'session-1', {
  activeStoreId: 'store-abc',
  currentWorkflow: 'store_creation',
});
await provider.recordAction('user-1', 'session-1', 'store_created', 'create_store', { storeId: 'store-abc' }, true);

// After page refresh — context reloads
const ctx = await provider.getContext('user-1', 'session-1');
ContextQueries.hasActiveStore(ctx); // true

// Upload in context of existing store
ContextQueries.isInWorkflow(ctx, 'store_creation'); // true
```

## Context informs classification (Test Case 2)

```js
await provider.updateContext('user-1', 'session-1', {
  currentWorkflow: 'store_creation',
  activeStoreId: 'store-abc',
});

const currentContext = mergePersistedWithClientContext(ctx, {});
// classifyIntent receives currentFlow: 'store_creation', activeStoreId: 'store-abc'
// "add a product" → add_product (not create_store)
```

## Checkpoint persistence (Test Case 3)

```js
await provider.updateContext('user-1', 'session-1', {
  pendingCheckpoints: [{
    stepId: 'logo-upload',
    type: 'upload',
    prompt: 'Upload your logo',
    timestamp: new Date().toISOString(),
  }],
});

// After refresh
const reloaded = await provider.getContext('user-1', 'session-1');
ContextQueries.hasPendingCheckpoints(reloaded); // true
```

## Behavior learning (Test Case 4)

```js
const extractor = getContextExtractor();
const update = extractor.extractFromUserFeedback(
  { type: 'skipped_step', stepId: 'hero_video' },
  await provider.getContext('user-1', 'session-1'),
);
await provider.updateContext('user-1', 'session-1', update);
// preferences.skippedSteps includes 'hero_video'
```

## Campaign upload routing (Test Case 5)

```js
await provider.updateContext('user-1', 'session-1', {
  currentWorkflow: 'campaign_creation',
  activeCampaignId: 'camp-42',
});

if (ContextQueries.isInWorkflow(ctx, 'campaign_creation')) {
  // route file to campaign asset upload, not store creation
}
```
