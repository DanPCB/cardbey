# Release Builds

## Flavors

| Flavor | `applicationId` suffix | API |
|--------|------------------------|-----|
| `dev` | `.dev` | `http://10.0.2.2:3001` |
| `staging` | `.staging` | `https://cardbey-core-staging.onrender.com` |
| `production` | (none) `com.cardbey.app` | `https://cardbey-core.onrender.com` |

## Outputs

```bash
./gradlew :app:assembleDevDebug          # local debug APK
./gradlew :app:assembleStagingRelease    # staging APK
./gradlew :app:bundleProductionRelease   # Play Store AAB
```

## Signing

1. Create upload keystore outside repo
2. `keystore.properties` local only (gitignored)
3. CI uses encrypted secrets for release bundles

## Play Store

Document separately:

- Package: `com.cardbey.app`
- App Links: `cardbey.com`
- Privacy policy URL
- Content rating questionnaire

## Versioning

`versionName` from `gradle.properties` `CARDNEY_VERSION_NAME`.
`versionCode` CI increment or manual bump per release.
