# Security Checklist

## Transport

- [x] HTTPS only in staging/production flavors
- [x] `network_security_config.xml` — cleartext permitted only for `dev` flavor (localhost / 10.0.2.2)
- [ ] Certificate pinning — documented, not enabled until ops support rotation

## Secrets

- [x] No JWT secrets in repo
- [x] Signing keys not committed (release docs only)
- [x] Logs redact Bearer tokens

## Token storage

- Encrypted DataStore / EncryptedSharedPreferences via Android Keystore
- Clear on sign-out and 401 session invalidation

## Deep links

- Validate host against `APP_LINK_HOST` allow-list
- Privileged routes require auth + confirmation
- No arbitrary URL execution

## Files

- Content URI sharing via FileProvider
- MIME validation before upload
- Reject path traversal in filenames

## Permissions

Minimize — see [uploads-and-scanning.md](./uploads-and-scanning.md) permission table.

## Rooted devices

Policy: document in release notes; no hard block in v1.

## Debug developer screen

Shows environment and diagnostics — **never** secrets or full tokens.
