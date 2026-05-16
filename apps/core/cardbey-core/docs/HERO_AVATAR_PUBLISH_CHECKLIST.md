# Hero + Avatar First-Class Publish – Manual Checklist

After applying the migration and deploying:

1. **Create store → review**  
   Draft review shows hero/avatar (unchanged; still from draft preview/meta).

2. **Publish**  
   - Click Publish.  
   - Open `/preview/store/:id?view=public` (use the store id from the response or URL).  
   - Public store page should show hero background and avatar (from new `Business.heroImageUrl` / `Business.avatarImageUrl`).

3. **/frontscreen/stores**  
   - Open `/frontscreen/stores`.  
   - Feed loads from GET /api/public/stores/feed.  
   - Each card uses hero (heroUrl/bannerUrl) as fullscreen background and avatar; no polling.

4. **Backward compatibility**  
   - Stores published before this change have null heroImageUrl/avatarImageUrl.  
   - toPublicStore falls back to logo-derived avatar and bannerUrl; frontend can use gradient/avatar blur when hero is missing.

## Apply schema (before running app/tests)

From `apps/core/cardbey-core`:

```bash
npx prisma migrate deploy
# or, if not using migrate history:
npx prisma db push
npx prisma generate
```

Migration name: `20260208120000_add_business_hero_avatar_published`.
