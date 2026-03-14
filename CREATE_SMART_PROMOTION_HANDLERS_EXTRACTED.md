# Create Smart Promotion Click Handlers - Extracted

## StoreDraftReview.tsx

**Location:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`

**Handler Function:**
```typescript
// Handle create promotion action (legacy - keep for backward compat)
const handleCreatePromotion = useCallback((productId: string) => {
  setSelectedProductForPromo(productId);
  // Use Smart Content Upgrade modal instead
  setSmartUpgradeModalOpen(true);
}, []);

// Handle Smart Content Upgrade confirmation
const handleSmartUpgradeConfirm = useCallback(async (params: {
  environment: 'print' | 'screen' | 'social' | 'hybrid';
  format: string;
  goal?: 'visit' | 'order' | 'call' | 'book';
}) => {
  if (!selectedProductForPromo) return;

  setIsEmbedding(true);
  setSmartUpgradeModalOpen(false);

  try {
    // Get tenant/store context from baseDraft
    let tenantId = baseDraft.tenantId || baseDraft.meta?.tenantId;
    let storeId = baseDraft.storeId || baseDraft.meta?.storeId;
    
    // Normalize tenantId: treat "none (public)" as null
    if (tenantId === 'none (public)' || tenantId === 'none') {
      tenantId = null;
    }
    
    // Normalize storeId: treat "none (will be created)" as null
    if (storeId === 'none (will be created)' || storeId === 'none') {
      storeId = null;
    }
    
    // Fallback to user ID for tenantId if available
    if (!tenantId && user?.id) {
      tenantId = user.id;
    }

    // Debug logging (gated by localStorage flag)
    const debugEnabled = typeof localStorage !== 'undefined' && 
      (localStorage.getItem('debugPromo') === 'true' || localStorage.getItem('cardbey.debug') === 'true');
    
    let result;
    let path: 'product' | 'draft' | 'error';
    
    // Path 1: If tenantId+storeId exist and are valid, use product endpoint
    if (tenantId && storeId && tenantId !== 'none' && storeId !== 'none') {
      path = 'product';
      if (debugEnabled) {
        console.log('[StoreDraftReview] Using product endpoint:', { tenantId, storeId, productId: selectedProductForPromo });
      }
      
      result = await createPromoFromProduct({
        tenantId,
        storeId,
        productId: selectedProductForPromo,
        environment: params.environment,
        format: params.format,
        goal: params.goal,
      });
    }
    // Path 2: If jobId exists, use draft endpoint
    else if (jobId) {
      path = 'draft';
      if (debugEnabled) {
        console.log('[StoreDraftReview] Using draft endpoint:', { jobId, productId: selectedProductForPromo });
      }
      
      result = await createPromoFromDraft({
        jobId,
        productId: selectedProductForPromo,
        environment: params.environment,
        format: params.format,
        goal: params.goal,
      });
    }
    // Path 3: No valid context - show blocking message
    else {
      path = 'error';
      throw new Error('FINISH_STORE_FIRST');
    }

    if (!result.ok || !result.instanceId) {
      throw new Error(result.error?.message || 'Failed to create promo');
    }

    if (debugEnabled) {
      console.log('[StoreDraftReview] Promo created successfully:', { path, instanceId: result.instanceId });
    }

    // Navigate to editor
    navigate(`/app/creative-shell/edit/${result.instanceId}?source=promo&intent=promotion`);
    
    toast(t('contentStudio.smartUpgrade.success', 'Smart Promotion created! Opening editor...'), 'success');
  } catch (error: any) {
    console.error('[StoreDraftReview] Create promo failed:', error);
    
    // Special handling for "finish store first" error
    if (error?.message === 'FINISH_STORE_FIRST') {
      toast(
        t('contentStudio.smartUpgrade.errors.finishStoreFirst', 'Finish creating the store first'),
        'error'
      );
      // TODO: Add button to trigger commit/generate step
      setSmartUpgradeModalOpen(true);
      return;
    }
    
    const errorMessage = error?.message || t('contentStudio.smartUpgrade.errors.failed', 'Failed to create Smart Promotion');
    toast(errorMessage, 'error');
    setSmartUpgradeModalOpen(true); // Re-open modal on error
  } finally {
    setIsEmbedding(false);
  }
}, [selectedProductForPromo, baseDraft, jobId, user, navigate, t]);
```

**Trigger (in MenuItemCard actions):**
```typescript
{
  id: 'create-promotion',
  label: '✨ Create Smart Promotion',
  kind: 'primary' as const,
  onClick: () => handleCreatePromotion(product.id),
}
```

**Modal Usage:**
```typescript
{smartUpgradeModalOpen && selectedProductForPromo && (() => {
  // Compute validation state: valid if (tenantId && storeId) OR jobId exists
  let tenantId = baseDraft.tenantId || baseDraft.meta?.tenantId;
  let storeId = baseDraft.storeId || baseDraft.meta?.storeId;
  
  // Normalize: treat "none (public)" and "none (will be created)" as null
  if (tenantId === 'none (public)' || tenantId === 'none') {
    tenantId = null;
  }
  if (storeId === 'none (will be created)' || storeId === 'none') {
    storeId = null;
  }
  
  // Fallback to user ID for tenantId
  if (!tenantId && user?.id) {
    tenantId = user.id;
  }
  
  const hasValidContext = (tenantId && storeId && tenantId !== 'none' && storeId !== 'none') || !!jobId;
  const contextError = !hasValidContext 
    ? t('contentStudio.smartUpgrade.errors.finishStoreFirst', 'Finish creating the store first')
    : undefined;
  
  return (
    <SmartContentUpgradeModal
      open={smartUpgradeModalOpen}
      productName={effectiveDraft.catalog.products.find(p => p.id === selectedProductForPromo)?.name || 'Product'}
      onClose={() => {
        setSmartUpgradeModalOpen(false);
        setSelectedProductForPromo(null);
      }}
      onConfirm={handleSmartUpgradeConfirm}
      hasValidContext={hasValidContext}
      contextError={contextError}
    />
  );
})()}
```

---

## MenuPage.jsx

**Location:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/menu/MenuPage.jsx`

**Handler (inline in SmartContentUpgradeModal onConfirm):**
```typescript
<SmartContentUpgradeModal
  open={smartUpgradeModalOpen}
  productName={selectedItemForPromo.name}
  onClose={() => {
    setSmartUpgradeModalOpen(false);
    setSelectedItemForPromo(null);
  }}
  onConfirm={async (params) => {
    setSmartUpgradeModalOpen(false);
    setIsEmbedding(true);

    try {
      // Get store context
      const activeContext = getActiveContext({ user, stores });
      const tenantId = activeContext?.tenantId || user?.id;
      const contextStoreId = activeContext?.storeId || storeId;

      if (!tenantId || !contextStoreId) {
        toast('Please select a store first', 'error');
        setIsEmbedding(false);
        return;
      }

      // Call canonical promo from product endpoint
      const result = await createPromoFromProduct({
        tenantId,
        storeId: contextStoreId,
        productId: selectedItemForPromo.id,
        environment: params.environment,
        format: params.format,
        goal: params.goal,
      });

      if (!result.ok || !result.instanceId) {
        throw new Error(result.error?.message || 'Failed to create promo');
      }

      // Navigate to editor
      navigate(`/app/creative-shell/edit/${result.instanceId}?source=menu&intent=promotion`);
      
      toast('Smart Promotion created! Opening editor...', 'success');
    } catch (error) {
      console.error('[MenuPage] Create promo failed:', error);
      const errorMessage = error?.message || 'Failed to create Smart Promotion';
      
      toast(errorMessage, 'error');
      setSmartUpgradeModalOpen(true); // Re-open modal on error
    } finally {
      setIsEmbedding(false);
      setSelectedItemForPromo(null);
    }
  }}
/>
```

**Trigger:** Not shown in extracted section, but likely similar button/action in MenuItemCard or menu item list.

---

## FeaturesPage.tsx

**Status:** No "Create Smart Promotion" handler found in FeaturesPage.tsx. This page appears to be for initial business creation, not for creating promotions from menu items.

---

## Summary

### StoreDraftReview.tsx
- **Handler:** `handleSmartUpgradeConfirm`
- **Context Source:** `baseDraft.tenantId/storeId` + `user.id` fallback
- **Fallback:** Uses `createPromoFromDraft` if `jobId` exists but no storeId
- **Error Handling:** Shows toast + re-opens modal on error, special handling for `FINISH_STORE_FIRST`

### MenuPage.jsx
- **Handler:** Inline `onConfirm` in `SmartContentUpgradeModal`
- **Context Source:** `getActiveContext({ user, stores })` + `user.id` fallback
- **Error Handling:** Shows toast + re-opens modal on error
- **Validation:** Checks `tenantId` and `contextStoreId` before proceeding

### Common Pattern
Both handlers:
1. Get context from various sources (baseDraft, activeContext, user)
2. Call `createPromoFromProduct()` or `createPromoFromDraft()`
3. Navigate to editor on success: `/app/creative-shell/edit/${instanceId}?source=...&intent=promotion`
4. Show toast on success/error
5. Re-open modal on error

### Issues to Fix
1. **Multiple context sources** - Should use `getCanonicalContext()` instead
2. **No FinishSetupModal** - Should show modal instead of just toast on missing context
3. **Inconsistent error handling** - StoreDraftReview has special `FINISH_STORE_FIRST` handling, MenuPage doesn't




