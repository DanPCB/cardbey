# Loyalty Engine v1

## Overview

The Loyalty Engine provides a complete set of tools for managing loyalty programs, customer stamps, and reward redemptions. It's designed as a modular engine that can be integrated into various workflows.

## Database Schema

The engine uses three Prisma models:

- **LoyaltyProgram**: Stores program configuration (name, stamps required, reward, expiration)
- **LoyaltyStamp**: Tracks customer stamp counts per program
- **LoyaltyReward**: Records reward redemptions

## Installation

After updating the schema, run the migration:

```bash
cd apps/core/cardbey-core
npx prisma migrate dev --name add_loyalty_engine
```

## Tools

### 1. `configureProgram`

Create or update a loyalty program.

**Input:**
```typescript
{
  tenantId: string;
  storeId: string;
  programId: string | null; // null for new, string for update
  name: string;
  stampsRequired: number; // min: 1
  reward: string;
  expiresAt: string | null; // ISO date string or null
}
```

**Output:**
```typescript
{
  ok: boolean;
  data: {
    programId: string;
  };
}
```

### 2. `generateAssets`

Generate QR code, card image, and PDF for a loyalty program.

**Input:**
```typescript
{
  tenantId: string;
  storeId: string;
  programId: string;
}
```

**Output:**
```typescript
{
  ok: boolean;
  data: {
    qrUrl: string;
    cardImageUrl: string;
    pdfUrl: string;
  };
}
```

**Note:** Currently uses placeholder/fallback services. Integrate real QR, image rendering, and PDF generation services via context.

### 3. `queryCustomerStatus`

Get customer's current stamp count and reward eligibility.

**Input:**
```typescript
{
  tenantId: string;
  storeId: string;
  customerId: string;
  programId: string;
}
```

**Output:**
```typescript
{
  ok: boolean;
  data: {
    count: number;
    stampsRequired: number;
    rewardPending: boolean;
    rewardEligible: boolean;
  };
}
```

### 4. `addStamp`

Add a stamp to a customer's loyalty card.

**Input:**
```typescript
{
  tenantId: string;
  storeId: string;
  customerId: string;
  programId: string;
}
```

**Output:**
```typescript
{
  ok: boolean;
  data: {
    newCount: number;
  };
}
```

### 5. `redeemReward`

Redeem a reward for a customer (requires sufficient stamps).

**Input:**
```typescript
{
  tenantId: string;
  storeId: string;
  customerId: string;
  programId: string;
}
```

**Output:**
```typescript
{
  ok: boolean;
  data: {
    reward: string;
    redeemedAt: string; // ISO date string
  };
}
```

## Usage

### Basic Usage

```typescript
import { loyaltyTools } from './engines/loyalty/index.js';

// Create a program
const program = await loyaltyTools.configureProgram({
  tenantId: 'tenant-123',
  storeId: 'store-456',
  programId: null, // null = create new
  name: 'Coffee Rewards',
  stampsRequired: 10,
  reward: 'Free coffee',
  expiresAt: null,
});

// Add a stamp
const stamp = await loyaltyTools.addStamp({
  tenantId: 'tenant-123',
  storeId: 'store-456',
  customerId: 'customer-789',
  programId: program.data.programId,
});

// Query status
const status = await loyaltyTools.queryCustomerStatus({
  tenantId: 'tenant-123',
  storeId: 'store-456',
  customerId: 'customer-789',
  programId: program.data.programId,
});

// Redeem reward (if eligible)
if (status.data.rewardEligible) {
  const reward = await loyaltyTools.redeemReward({
    tenantId: 'tenant-123',
    storeId: 'store-456',
    customerId: 'customer-789',
    programId: program.data.programId,
  });
}
```

### With Custom Context

```typescript
import { PrismaClient } from '@prisma/client';
import { loyaltyTools } from './engines/loyalty/index.js';
import { getEventEmitter } from './engines/loyalty/events.js';

const prisma = new PrismaClient();
const events = getEventEmitter();

const ctx = {
  services: {
    db: prisma,
    events,
    qr: {
      generate: async ({ url }) => {
        // Your QR code generation logic
        return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
      },
    },
    images: {
      renderLoyaltyCard: async ({ programId }) => {
        // Your image rendering logic
        return `https://example.com/cards/${programId}.png`;
      },
    },
    pdf: {
      generateLoyaltyCard: async ({ programId }) => {
        // Your PDF generation logic
        return `https://example.com/cards/${programId}.pdf`;
      },
    },
  },
};

const result = await loyaltyTools.configureProgram(input, ctx);
```

## Events

The engine emits events for all major actions:

- `loyalty.program_configured` - When a program is created/updated
- `loyalty.card_generated` - When assets are generated
- `loyalty.stamp_added` - When a stamp is added
- `loyalty.reward_redeemed` - When a reward is redeemed

Events are logged to console by default. Integrate with your event bus by providing a custom event emitter in the context.

## Validation

All inputs are validated using Zod schemas defined in `types.ts`. Invalid inputs will throw validation errors.

## Error Handling

Functions throw errors for:
- Invalid input (Zod validation errors)
- Program not found
- Insufficient stamps for redemption
- Reward already redeemed

Handle errors appropriately in your application code.

## Next Steps

1. **Run Migration**: Execute `npx prisma migrate dev` to create the database tables
2. **Integrate Services**: Connect real QR, image, and PDF generation services
3. **Event Integration**: Connect events to your event bus (SSE, WebSocket, etc.)
4. **API Routes**: Create Express routes that use these tools
5. **Testing**: Add unit and integration tests

## File Structure

```
src/engines/loyalty/
├── index.ts                 # Main exports
├── types.ts                 # Zod schemas and TypeScript types
├── loyaltyTools.ts          # Tool collection
├── configureProgram.ts      # Program creation/update
├── generateAssets.ts         # Asset generation
├── queryCustomerStatus.ts   # Status queries
├── addStamp.ts              # Stamp addition
├── redeemReward.ts          # Reward redemption
├── events.ts                # Event emission
└── README.md                # This file
```


