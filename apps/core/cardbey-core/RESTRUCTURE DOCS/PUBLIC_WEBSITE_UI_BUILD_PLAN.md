# Public Website UI Build Plan: Marketing Dashboard (B)

**Date:** 2025-01-25  
**Goal:** Design and implement the complete public-facing website in B using B's design system, replacing A as the main Cardbey website.

---

## Section 1: Public Route Map

| Route | Purpose | Layout Type | Reusable Components | Auth Required? | Priority | Notes |
|-------|---------|-------------|---------------------|----------------|----------|-------|
| `/` | Hero/landing page ("Cardbey = Canva-for-business + AI + C-Net") | Hero page | `PublicHeader`, `HeroSection`, `FeatureGrid`, `CTASection`, `PublicFooter` | ❌ No | P0 | Main entry point |
| `/features` | Feature overview and use cases | Two-column marketing | `PublicHeader`, `FeatureShowcase`, `UseCaseGrid`, `PublicFooter` | ❌ No | P0 | Product features |
| `/pricing` | Plans & pricing tiers | Two-column marketing | `PublicHeader`, `PricingTiers`, `FeatureComparison`, `FAQ`, `PublicFooter` | ❌ No | P0 | Static pricing (placeholder for now) |
| `/about` | Company story, mission, team | Two-column marketing | `PublicHeader`, `StorySection`, `TeamGrid`, `PublicFooter` | ❌ No | P1 | Brand storytelling |
| `/contact` | Contact form and support | Simple form page | `PublicHeader`, `ContactForm`, `PublicFooter` | ❌ No | P1 | Support/contact |
| `/help` or `/docs` | Getting started guide | Documentation layout | `PublicHeader`, `DocSidebar`, `DocContent`, `PublicFooter` | ❌ No | P1 | Simple guide/docs |
| `/store/:storeSlug` | Public store front page | Gallery/Detail page | `PublicHeader`, `StoreShowcase`, `ProductGrid`, `PublicFooter` | ❌ No | P0 | Public business showcase |
| `/store/:storeSlug/products` | Store's product catalog | Gallery | `PublicHeader`, `ProductGrid`, `FilterBar`, `PublicFooter` | ❌ No | P1 | Product listing |
| `/store/:storeSlug/services` | Store's services catalog | Gallery | `PublicHeader`, `ServiceGrid`, `FilterBar`, `PublicFooter` | ❌ No | P1 | Services listing |
| `/store/:storeSlug/videos` | Store's video/promo gallery | Gallery | `PublicHeader`, `VideoGrid`, `PublicFooter` | ❌ No | P1 | Promotional videos |
| `/products` | Public product catalog/search | Gallery | `PublicHeader`, `CatalogGrid`, `SearchBar`, `FilterBar`, `PublicFooter` | ❌ No | P1 | Global product search |
| `/services` | Public services catalog/search | Gallery | `PublicHeader`, `ServiceGrid`, `SearchBar`, `FilterBar`, `PublicFooter` | ❌ No | P1 | Global service search |
| `/videos` or `/promotions` | Public video/promo gallery | Gallery | `PublicHeader`, `VideoGallery`, `CategoryFilter`, `PublicFooter` | ❌ No | P1 | Promotional content |
| `/search` | Universal search (products, services, stores) | Search results | `PublicHeader`, `SearchBar`, `SearchResults`, `PublicFooter` | ❌ No | P1 | Global search |
| `/screens/:screenHash` | Public screen showcase | Full-screen player | `ScreenPlayer`, minimal header | ❌ No | P1 | Shareable screen demo |
| `/slideshow/:screenId` | Public slideshow/playlist view | Full-screen player | `PlaylistPlayer`, minimal header | ❌ No | P1 | Shareable playlist |
| `/demo` | Interactive demo/playground | Interactive demo | `PublicHeader`, `DemoInterface`, `PublicFooter` | ❌ No | P1 | Product demo |
| `/login` | Login page | Auth page | `AuthLayout`, `LoginForm` | ❌ No | P0 | Existing, may need update |
| `/register` | Registration page | Auth page | `AuthLayout`, `RegisterForm` | ❌ No | P0 | Existing, may need update |
| `/privacy` | Privacy policy | Legal page | `PublicHeader`, `LegalContent`, `PublicFooter` | ❌ No | P1 | Legal requirement |
| `/terms` | Terms of service | Legal page | `PublicHeader`, `LegalContent`, `PublicFooter` | ❌ No | P1 | Legal requirement |

**Legend:**
- **Hero page**: Full-width hero section, sections below
- **Two-column marketing**: Sidebar or alternating content sections
- **Gallery**: Grid/list of items with filters/search
- **Detail page**: Single item focus with related items
- **Auth page**: Centered form, minimal navigation

---

## Section 2: Layout Strategy & Components

### 2.1 Layout Shell Strategy

#### Public Marketing Layout (`MarketingLayout.tsx`)

**Purpose:** Unified layout for all public pages (no sidebar, clean marketing design)

**Structure:**
```typescript
<MarketingLayout>
  <PublicHeader />       // Top navigation, logo, CTA buttons
  <main>{children}</main> // Page content
  <PublicFooter />       // Links, social, copyright
</MarketingLayout>
```

**Features:**
- Responsive navigation (mobile hamburger menu)
- Sticky header (optional, for long pages)
- Footer with links (Features, Pricing, About, Contact, Legal)
- Theme toggle (light/dark mode) - reuse from B
- Language toggle (if i18n exists in B)
- No sidebar (clean, focused)

**Reuse from B:**
- Existing theme system (if B has dark mode)
- Responsive utilities
- Navigation patterns (adapt dashboard nav to public)

**Files to Create:**
- `src/layouts/MarketingLayout.tsx`
- `src/components/layout/public/PublicHeader.tsx`
- `src/components/layout/public/PublicFooter.tsx`

---

#### Authenticated Dashboard Layout (`DashboardLayout.tsx`)

**Purpose:** Existing dashboard layout (keep as-is, verify it works)

**Status:** ✅ Likely exists in B

**Action:** Verify and ensure separation from public layout

---

### 2.2 Reusable Marketing Components

#### Header Components

| Component | Purpose | Reuse from B? | Create/Adapt |
|-----------|---------|---------------|--------------|
| `PublicHeader` | Top navigation for public pages | ❌ | Create new (adapt from dashboard nav) |
| `PublicNav` | Navigation menu (Features, Pricing, etc.) | ❌ | Create new |
| `Logo` | Cardbey logo/brand | ✅ | Reuse (if exists) |
| `CTAButton` | Call-to-action buttons (Sign Up, Get Started) | ⚠️ | Create or adapt existing Button |
| `AuthButtons` | Login/Register buttons (for unauthenticated) | ⚠️ | Create or adapt |
| `UserMenu` | User dropdown (for authenticated users) | ✅ | Reuse (if exists) |

**Create New:**
- `src/components/layout/public/PublicHeader.tsx`
- `src/components/layout/public/PublicNav.tsx`
- `src/components/ui/CTAButton.tsx`

---

#### Footer Components

| Component | Purpose | Reuse from B? | Create/Adapt |
|-----------|---------|---------------|--------------|
| `PublicFooter` | Footer with links, social, copyright | ❌ | Create new |
| `FooterLinks` | Organized footer links (Features, Legal, etc.) | ❌ | Create new |
| `SocialLinks` | Social media icons/links | ❌ | Create new |
| `NewsletterSignup` | Email newsletter signup (optional) | ❌ | Create (if needed) |

**Create New:**
- `src/components/layout/public/PublicFooter.tsx`
- `src/components/layout/public/FooterLinks.tsx`
- `src/components/layout/public/SocialLinks.tsx`

---

#### Hero & Marketing Sections

| Component | Purpose | Create/Adapt |
|-----------|---------|--------------|
| `HeroSection` | Hero banner with headline, subheadline, CTA | Create new |
| `FeatureGrid` | Grid of feature cards (3-4 columns) | Create new |
| `FeatureCard` | Individual feature card (icon, title, description) | Create new |
| `UseCaseSection` | Use case showcase (alternating left/right) | Create new |
| `CTASection` | Call-to-action section (centered, with button) | Create new |
| `TestimonialSection` | Customer testimonials/social proof | Create new |
| `VideoDemo` | Embedded video demo | Create or adapt |
| `ScreenshotGallery` | Product screenshots/gallery | Create new |
| `StatsSection` | Key metrics/stats (e.g., "10k+ screens", "50k+ designs") | Create new |

**Create New:**
- `src/components/marketing/HeroSection.tsx`
- `src/components/marketing/FeatureGrid.tsx`
- `src/components/marketing/FeatureCard.tsx`
- `src/components/marketing/UseCaseSection.tsx`
- `src/components/marketing/CTASection.tsx`
- `src/components/marketing/TestimonialSection.tsx`
- `src/components/marketing/StatsSection.tsx`

---

#### Pricing Components

| Component | Purpose | Create/Adapt |
|-----------|---------|--------------|
| `PricingTiers` | Container for pricing cards | Create new |
| `PricingCard` | Individual pricing tier (Free, Pro, Enterprise) | Create new |
| `FeatureComparison` | Comparison table of features across tiers | Create new |
| `FAQ` | Frequently asked questions (accordion) | Create or adapt |
| `PricingToggle` | Monthly/Annual toggle | Create new |

**Create New:**
- `src/components/pricing/PricingTiers.tsx`
- `src/components/pricing/PricingCard.tsx`
- `src/components/pricing/FeatureComparison.tsx`
- `src/components/pricing/FAQ.tsx`

---

#### Storefront Components

| Component | Purpose | Data Source | Create/Adapt |
|-----------|---------|-------------|--------------|
| `StoreShowcase` | Store header with logo, name, description | `GET /api/business/:slug` | Create new |
| `ProductGrid` | Grid of product cards | `GET /api/products?storeId=...` | Create new |
| `ProductCard` | Individual product card (image, name, price) | Product data | Create new |
| `ServiceGrid` | Grid of service cards | `GET /api/services?storeId=...` | Create new |
| `ServiceCard` | Individual service card | Service data | Create new |
| `VideoGallery` | Grid of video thumbnails | `GET /api/media?storeId=...&kind=VIDEO` | Create new |
| `StoreHeader` | Store header with logo, nav, social | Business data | Create new |
| `ShareButton` | Share store/screen link | - | Create or adapt |

**Create New:**
- `src/components/storefront/StoreShowcase.tsx`
- `src/components/storefront/ProductGrid.tsx`
- `src/components/storefront/ProductCard.tsx`
- `src/components/storefront/ServiceGrid.tsx`
- `src/components/storefront/VideoGallery.tsx`
- `src/components/storefront/ShareButton.tsx`

**Backend Dependencies:**
- `GET /api/business/:slug` - Get business by slug (needs implementation)
- `GET /api/products` - List products (needs implementation or use Media)
- `GET /api/services` - List services (needs implementation)
- `GET /api/media?storeId=...` - Filter media by store (extend existing)

---

#### Catalog & Search Components

| Component | Purpose | Data Source | Create/Adapt |
|-----------|---------|-------------|--------------|
| `CatalogGrid` | Universal grid (products/services/stores) | `GET /api/search?q=...&type=...` | Create new |
| `SearchBar` | Global search input with suggestions | `GET /api/search/suggestions?q=...` | Create new |
| `FilterBar` | Category, location, price filters | - | Create new |
| `SearchResults` | Search results list with tabs | `GET /api/search?q=...` | Create new |
| `CategoryFilter` | Category/chip filter component | - | Create or adapt |
| `SortDropdown` | Sort options (Price, Rating, Newest) | - | Create or adapt |

**Create New:**
- `src/components/catalog/CatalogGrid.tsx`
- `src/components/catalog/SearchBar.tsx`
- `src/components/catalog/FilterBar.tsx`
- `src/components/catalog/SearchResults.tsx`

**Backend Dependencies:**
- `GET /api/search?q=...&type=product|service|store` - Universal search (needs implementation)
- `GET /api/search/suggestions?q=...` - Search autocomplete (needs implementation)

---

#### Player/Viewer Components

| Component | Purpose | Data Source | Create/Adapt |
|-----------|---------|-------------|--------------|
| `ScreenPlayer` | Public screen viewer (full-screen) | `GET /api/screens/:id/playlist/full` | Adapt existing |
| `PlaylistPlayer` | Public playlist slideshow viewer | `GET /api/playlists/:id` | Adapt existing |
| `MinimalHeader` | Minimal header for player pages | - | Create new |

**Adapt Existing:**
- Use existing screen/playlist player components from B (dashboard)
- Simplify for public view (remove controls, make auto-play)

---

#### Form Components

| Component | Purpose | Reuse from B? | Create/Adapt |
|-----------|---------|---------------|--------------|
| `ContactForm` | Contact/support form | ⚠️ | Create or adapt existing Form |
| `NewsletterForm` | Newsletter signup | ❌ | Create new |
| `SearchForm` | Search input form | ⚠️ | Create or adapt |

**Reuse from B:**
- Existing form components (Input, Textarea, Button)
- Form validation utilities
- Form submission handlers

---

### 2.3 Component Library Organization

**Proposed Structure:**
```
src/components/
├── layout/
│   ├── public/
│   │   ├── PublicHeader.tsx
│   │   ├── PublicNav.tsx
│   │   ├── PublicFooter.tsx
│   │   └── FooterLinks.tsx
│   └── MarketingLayout.tsx
├── marketing/
│   ├── HeroSection.tsx
│   ├── FeatureGrid.tsx
│   ├── FeatureCard.tsx
│   ├── UseCaseSection.tsx
│   ├── CTASection.tsx
│   ├── TestimonialSection.tsx
│   └── StatsSection.tsx
├── pricing/
│   ├── PricingTiers.tsx
│   ├── PricingCard.tsx
│   ├── FeatureComparison.tsx
│   └── FAQ.tsx
├── storefront/
│   ├── StoreShowcase.tsx
│   ├── ProductGrid.tsx
│   ├── ProductCard.tsx
│   ├── ServiceGrid.tsx
│   ├── ServiceCard.tsx
│   ├── VideoGallery.tsx
│   └── ShareButton.tsx
├── catalog/
│   ├── CatalogGrid.tsx
│   ├── SearchBar.tsx
│   ├── FilterBar.tsx
│   └── SearchResults.tsx
└── ui/  (reuse from B)
    ├── Button.tsx
    ├── Card.tsx
    ├── Input.tsx
    └── ...
```

---

## Section 3: Storefront & Catalog Mapping (A → B)

### 3.1 Store Public Page (`/store/:storeSlug`)

**Reference from A:**
- Store header with logo, name, description
- Product/service listings
- Store location/hours
- Social media links
- Share functionality

**Data Model Mapping:**

| A Concept | Core (C) Model | Backend Endpoint | Status |
|-----------|---------------|------------------|--------|
| Store/Business | `Business` model | `GET /api/business/:slug` | ⚠️ Needs implementation |
| Store Logo | `Business.logo` (JSON string) | Included in business | ✅ Exists |
| Store Description | `Business.description` | Included in business | ✅ Exists |
| Products | `Media` (kind=IMAGE) or new `Product` model | `GET /api/products?storeId=...` | ❌ Needs implementation |
| Services | New `Service` model or extend `Media` | `GET /api/services?storeId=...` | ❌ Needs implementation |
| Store Location | `Business.region` or new field | Included in business | ⚠️ Partial |
| Store Hours | Not in schema | - | ❌ Needs schema addition |

**Simplified UX in B:**
- ✅ Clean, modern card-based layout
- ✅ Responsive grid (2-3 columns desktop, 1 mobile)
- ✅ Lazy-loading images
- ✅ Share button (copy link, social share)
- ❌ Remove: Complex filtering (keep simple)
- ❌ Remove: Advanced search (use global search instead)
- ✅ Keep: Essential info (name, description, products/services)

**Implementation Plan:**
1. Create `Business` CRUD endpoints in Core (P0)
2. Create product/service models or use `Media` with metadata
3. Build `StoreShowcase` component
4. Build product/service grid components
5. Add share functionality

---

### 3.2 Catalog List Pages (`/products`, `/services`)

**Reference from A:**
- Grid/list view of all products/services
- Category filtering
- Search within catalog
- Location/region filtering
- Sorting options

**Data Model Mapping:**

| A Concept | Core (C) Model | Backend Endpoint | Status |
|-----------|---------------|------------------|--------|
| Products | `Media` (kind=IMAGE) or `Product` | `GET /api/products` | ❌ Needs implementation |
| Services | `Service` model or extend `Media` | `GET /api/services` | ❌ Needs implementation |
| Categories | Tags/metadata or new `Category` | Filter by `category` field | ⚠️ Partial |
| Location | `Business.region` | Filter by `region` | ⚠️ Partial |
| Search | - | `GET /api/search?q=...&type=product` | ❌ Needs implementation |

**Simplified UX in B:**
- ✅ Clean grid layout (3-4 columns)
- ✅ Simple category chips/filters
- ✅ Search bar (top of page)
- ✅ Location dropdown (optional)
- ❌ Remove: Advanced filters (price range, ratings, etc.)
- ❌ Remove: Complex sorting (keep: Newest, Popular, A-Z)
- ✅ Keep: Essential filtering (category, location, search)

**Implementation Plan:**
1. Create product/service listing endpoints
2. Add category/metadata to items
3. Build `CatalogGrid` component
4. Build `FilterBar` with simple filters
5. Add search integration

---

### 3.3 Public Search (`/search`)

**Reference from A:**
- Universal search (products, services, stores)
- Search suggestions/autocomplete
- Results tabs (All, Products, Services, Stores)
- Filters after search

**Data Model Mapping:**

| A Concept | Core (C) Model | Backend Endpoint | Status |
|-----------|---------------|------------------|--------|
| Search Query | - | `GET /api/search?q=...&type=...` | ❌ Needs implementation |
| Search Suggestions | - | `GET /api/search/suggestions?q=...` | ❌ Needs implementation |
| Product Results | `Media` or `Product` | Include in search response | ❌ Needs implementation |
| Service Results | `Service` | Include in search response | ❌ Needs implementation |
| Store Results | `Business` | Include in search response | ⚠️ Needs integration |

**Simplified UX in B:**
- ✅ Large search bar (centered, hero-style)
- ✅ Real-time suggestions dropdown
- ✅ Results tabs (All, Products, Services, Stores)
- ✅ Simple filters (category, location)
- ❌ Remove: Advanced search operators
- ❌ Remove: Saved searches
- ✅ Keep: Essential search (text query, type filter)

**Implementation Plan:**
1. Create unified search endpoint in Core
2. Create search suggestions endpoint
3. Build `SearchBar` with autocomplete
4. Build `SearchResults` with tabs
5. Add search result cards (product/service/store)

---

### 3.4 Video Gallery / Promotions (`/videos` or `/promotions`)

**Reference from A:**
- Grid of promotional videos
- Category/theme filtering
- Video thumbnails
- Play on click (modal or full-page)

**Data Model Mapping:**

| A Concept | Core (C) Model | Backend Endpoint | Status |
|-----------|---------------|------------------|--------|
| Videos | `Media` (kind=VIDEO) | `GET /api/media?kind=VIDEO` | ✅ Exists |
| Video Thumbnails | `Media.url` or generate | Included in media | ✅ Exists |
| Categories | `Media` metadata or tags | Filter by metadata | ⚠️ Partial |
| Promotions | `Media` with `promo=true` tag | Filter by tag | ⚠️ Partial |

**Simplified UX in B:**
- ✅ Clean video grid (3-4 columns)
- ✅ Thumbnail hover preview (optional)
- ✅ Play in modal or full-screen
- ✅ Simple category filter
- ❌ Remove: Video editing tools
- ❌ Remove: Video upload (use dashboard)
- ✅ Keep: Essential viewing (play, share, browse)

**Implementation Plan:**
1. Extend media endpoint to filter by kind=VIDEO
2. Add category/tag metadata to media
3. Build `VideoGallery` component
4. Add video player modal/fullscreen
5. Add share functionality

---

## Section 4: Implementation Tickets

### P0 (Launch - Critical)

#### Ticket 1: Marketing Layout Shell
**Title:** Implement MarketingLayout for public pages  
**Scope:** Create `MarketingLayout.tsx` with `PublicHeader` and `PublicFooter` components. Header includes logo, navigation (Features, Pricing, About, Contact), CTA buttons (Sign Up, Login). Footer includes links, social media, copyright.  
**Dependencies:** None  
**Files:**
- `src/layouts/MarketingLayout.tsx` (new)
- `src/components/layout/public/PublicHeader.tsx` (new)
- `src/components/layout/public/PublicFooter.tsx` (new)
- Router config (add layout wrapper)

**Deliverable:** Public pages can use MarketingLayout wrapper

---

#### Ticket 2: Landing/Hero Page
**Title:** Implement `/` landing page with hero section  
**Scope:** Create landing page with hero section ("Cardbey = Canva-for-business + AI + C-Net"), feature grid (3-4 key features), CTA section, stats section. Use MarketingLayout. Connect to `/api/v2/home/sections` for dynamic content if available.  
**Dependencies:** MarketingLayout (Ticket 1)  
**Files:**
- `src/pages/Landing.tsx` (new)
- `src/components/marketing/HeroSection.tsx` (new)
- `src/components/marketing/FeatureGrid.tsx` (new)
- `src/components/marketing/FeatureCard.tsx` (new)
- `src/components/marketing/CTASection.tsx` (new)
- `src/components/marketing/StatsSection.tsx` (new)

**Deliverable:** Landing page accessible at `/`

---

#### Ticket 3: Features Page
**Title:** Implement `/features` page  
**Scope:** Create features page showcasing product capabilities: Content Studio, AI Design Assistant, Screen Management, Playlists, Analytics. Use alternating sections (left/right) for visual interest.  
**Dependencies:** MarketingLayout (Ticket 1)  
**Files:**
- `src/pages/Features.tsx` (new)
- `src/components/marketing/UseCaseSection.tsx` (new)
- `src/components/marketing/FeatureShowcase.tsx` (new)

**Deliverable:** Features page accessible at `/features`

---

#### Ticket 4: Pricing Page
**Title:** Implement `/pricing` page with static tiers  
**Scope:** Create pricing page with 3-4 pricing tiers (Free, Pro, Enterprise). Include feature comparison table, FAQ section. Pricing can be hardcoded for now (no billing integration yet).  
**Dependencies:** MarketingLayout (Ticket 1)  
**Files:**
- `src/pages/Pricing.tsx` (new)
- `src/components/pricing/PricingTiers.tsx` (new)
- `src/components/pricing/PricingCard.tsx` (new)
- `src/components/pricing/FeatureComparison.tsx` (new)
- `src/components/pricing/FAQ.tsx` (new)

**Deliverable:** Pricing page accessible at `/pricing`

---

#### Ticket 5: Business/Store Public Page
**Title:** Implement `/store/:storeSlug` public store page  
**Scope:** Create public store showcase page showing business info (logo, name, description), product/service grid, video gallery. Uses MarketingLayout. Backend needs `GET /api/business/:slug` endpoint (create in Core).  
**Dependencies:** MarketingLayout (Ticket 1), Business CRUD endpoints in Core  
**Files:**
- `src/pages/StorePublic.tsx` (new)
- `src/components/storefront/StoreShowcase.tsx` (new)
- `src/components/storefront/ProductGrid.tsx` (new)
- `src/components/storefront/ProductCard.tsx` (new)
- `src/components/storefront/VideoGallery.tsx` (new)
- Backend: `src/routes/business.js` in Core (new)

**Deliverable:** Public store pages accessible at `/store/:slug`

---

### P1 (Post-Launch - Important)

#### Ticket 6: About Page
**Title:** Implement `/about` page  
**Scope:** Create about page with company story, mission, team (if applicable). Use MarketingLayout.  
**Dependencies:** MarketingLayout (Ticket 1)  
**Files:**
- `src/pages/About.tsx` (new)
- `src/components/marketing/StorySection.tsx` (new)

**Deliverable:** About page accessible at `/about`

---

#### Ticket 7: Contact Page
**Title:** Implement `/contact` page with contact form  
**Scope:** Create contact page with contact form (name, email, message). Form submits to backend endpoint (create `POST /api/contact` in Core). Use MarketingLayout.  
**Dependencies:** MarketingLayout (Ticket 1)  
**Files:**
- `src/pages/Contact.tsx` (new)
- `src/components/forms/ContactForm.tsx` (new)
- Backend: `src/routes/contact.js` in Core (new)

**Deliverable:** Contact page accessible at `/contact`

---

#### Ticket 8: Help/Docs Page
**Title:** Implement `/help` getting started guide  
**Scope:** Create simple help/documentation page with getting started steps. Can be static content for now. Use MarketingLayout.  
**Dependencies:** MarketingLayout (Ticket 1)  
**Files:**
- `src/pages/Help.tsx` (new)
- `src/components/docs/DocSidebar.tsx` (new)
- `src/components/docs/DocContent.tsx` (new)

**Deliverable:** Help page accessible at `/help`

---

#### Ticket 9: Public Product Catalog
**Title:** Implement `/products` catalog page  
**Scope:** Create product catalog page with product grid, search bar, category filters. Backend needs `GET /api/products` endpoint or use `Media` filtered by metadata.  
**Dependencies:** MarketingLayout (Ticket 1), Product listing endpoint  
**Files:**
- `src/pages/Products.tsx` (new)
- `src/components/catalog/CatalogGrid.tsx` (new)
- `src/components/catalog/SearchBar.tsx` (new)
- `src/components/catalog/FilterBar.tsx` (new)

**Deliverable:** Product catalog accessible at `/products`

---

#### Ticket 10: Public Services Catalog
**Title:** Implement `/services` catalog page  
**Scope:** Similar to products catalog, but for services. Backend needs `GET /api/services` endpoint.  
**Dependencies:** MarketingLayout (Ticket 1), Service listing endpoint  
**Files:**
- `src/pages/Services.tsx` (new)
- Reuse catalog components from Ticket 9

**Deliverable:** Services catalog accessible at `/services`

---

#### Ticket 11: Universal Search
**Title:** Implement `/search` universal search page  
**Scope:** Create search page with large search bar, real-time suggestions, results tabs (All, Products, Services, Stores). Backend needs `GET /api/search?q=...&type=...` endpoint.  
**Dependencies:** MarketingLayout (Ticket 1), Search endpoint in Core  
**Files:**
- `src/pages/Search.tsx` (new)
- `src/components/catalog/SearchBar.tsx` (enhance with suggestions)
- `src/components/catalog/SearchResults.tsx` (new)
- Backend: `src/routes/search.js` in Core (new)

**Deliverable:** Search page accessible at `/search`

---

#### Ticket 12: Public Video Gallery
**Title:** Implement `/videos` or `/promotions` video gallery  
**Scope:** Create video gallery page showing promotional videos from stores. Uses existing `Media` (kind=VIDEO) endpoint. Add category filtering.  
**Dependencies:** MarketingLayout (Ticket 1), Media endpoint supports kind=VIDEO filter  
**Files:**
- `src/pages/Videos.tsx` (new)
- Enhance `VideoGallery` component (from Ticket 5)

**Deliverable:** Video gallery accessible at `/videos`

---

#### Ticket 13: Public Screen Player
**Title:** Implement `/screens/:screenHash` public screen viewer  
**Scope:** Create public screen showcase page that shows a screen's playlist in full-screen mode. Minimal header (just logo). Uses existing screen playlist endpoint.  
**Dependencies:** Screen playlist endpoint (exists)  
**Files:**
- `src/pages/ScreenPublic.tsx` (new)
- Adapt existing screen player component for public view

**Deliverable:** Public screen viewer accessible at `/screens/:hash`

---

#### Ticket 14: Legal Pages
**Title:** Implement `/privacy` and `/terms` legal pages  
**Scope:** Create privacy policy and terms of service pages. Can use static content for now. Use MarketingLayout.  
**Dependencies:** MarketingLayout (Ticket 1)  
**Files:**
- `src/pages/Privacy.tsx` (new)
- `src/pages/Terms.tsx` (new)
- `src/components/legal/LegalContent.tsx` (new)

**Deliverable:** Legal pages accessible at `/privacy` and `/terms`

---

### P2 (Later - Nice to Have)

#### Ticket 15: Demo/Playground Page
**Title:** Implement `/demo` interactive demo page  
**Scope:** Create interactive demo showcasing Cardbey features. Can embed actual demo or use screenshots/videos.  
**Dependencies:** MarketingLayout (Ticket 1)  
**Files:**
- `src/pages/Demo.tsx` (new)
- `src/components/marketing/DemoInterface.tsx` (new)

**Deliverable:** Demo page accessible at `/demo`

---

#### Ticket 16: Store Product/Service Detail Pages
**Title:** Implement `/store/:slug/products/:id` detail pages  
**Scope:** Create individual product/service detail pages with full description, images, pricing, contact info.  
**Dependencies:** Store public page (Ticket 5), Product detail endpoint  
**Files:**
- `src/pages/ProductDetail.tsx` (new)
- `src/pages/ServiceDetail.tsx` (new)

**Deliverable:** Product/service detail pages

---

#### Ticket 17: Public Playlist Viewer
**Title:** Implement `/slideshow/:playlistId` public playlist viewer  
**Scope:** Create public playlist slideshow viewer (similar to screen viewer but for standalone playlists).  
**Dependencies:** Playlist endpoint (exists)  
**Files:**
- `src/pages/PlaylistPublic.tsx` (new)

**Deliverable:** Public playlist viewer accessible at `/slideshow/:id`

---

## Summary

**Total Tickets:** 17  
**P0 (Launch):** 5 tickets  
**P1 (Post-Launch):** 9 tickets  
**P2 (Later):** 3 tickets

**Estimated Timeline:**
- **Week 1-2:** P0 tickets (MarketingLayout, Landing, Features, Pricing, Store page)
- **Week 3-4:** P1 tickets (About, Contact, Help, Catalogs, Search)
- **Week 5+:** P2 tickets (Demo, Detail pages, Playlist viewer)

**Backend Dependencies (to create in Core):**
1. `GET /api/business/:slug` - Business by slug
2. `GET /api/products` - Product listing
3. `GET /api/services` - Service listing
4. `GET /api/search?q=...&type=...` - Universal search
5. `GET /api/search/suggestions?q=...` - Search autocomplete
6. `POST /api/contact` - Contact form submission

**Key Success Metrics:**
- ✅ Public user can understand Cardbey and sign up (Landing, Features, Pricing)
- ✅ Public user can view a demo store or example screens (Store page, Screen viewer)
- ✅ Existing user can share a store/screen link that looks good (Share buttons, Public pages)

---

**Document Version:** 1.0  
**Last Updated:** 2025-01-25  
**Status:** Ready for Implementation

