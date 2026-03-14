# @cardbey/api-client

Shared API client package for communicating with Cardbey Core backend.

## Installation

This package is part of the Cardbey monorepo and is automatically linked via workspace dependencies.

## Usage

```typescript
import { registerUser, loginUser, getCurrentUser, createStore } from '@cardbey/api-client';

// Register a new user
await registerUser({
  fullName: 'John Doe',
  email: 'john@example.com',
  password: 'password123'
});

// Login
const loginResponse = await loginUser({
  email: 'john@example.com',
  password: 'password123',
  role: 'store' // optional
});

// Get current user
const user = await getCurrentUser(accessToken);

// Create a store
const store = await createStore({
  name: 'My Store',
  creationMethod: 'manual'
}, accessToken);
```

## Configuration

The API client automatically detects the Core base URL from:
1. `window.__APP_API_BASE__` (runtime override)
2. `VITE_CORE_BASE_URL` (build-time environment variable)

## Error Handling

All functions throw `ApiClientError` with:
- `message`: Error message
- `status`: HTTP status code (if available)
- `details`: Additional error details








