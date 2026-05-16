Cardbey Starter Library

Structure:
- public/assets/library/...  -> place this inside your cardbey-core/public/assets/library
- data/templates/*.json      -> template layer definitions referenced by the manifest
- cardbey-starter-library.json -> master manifest for marketplace/studio

Usage:
1. Copy the 'public/assets/library' folder into cardbey-core/public/assets/library.
2. Serve static assets under /assets in cardbey-core.
3. Import cardbey-starter-library.json in your marketing dashboard to power the Template Marketplace.
