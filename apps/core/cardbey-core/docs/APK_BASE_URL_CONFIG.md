# APK Base URL Configuration Guide

## Where to Locate Base URL in Android APK

The APK base URL is typically configured in one of these locations in your Android project:

### Option 1: Build Configuration (Recommended)

**Location:** `app/build.gradle` or `app/build.gradle.kts`

```gradle
// app/build.gradle (Groovy)
android {
    buildTypes {
        debug {
            buildConfigField "String", "BASE_URL", '"http://192.168.1.7:3001"'
        }
        release {
            buildConfigField "String", "BASE_URL", '"https://cardbey-core.onrender.com"'
        }
    }
}
```

**Or in Kotlin DSL:**
```kotlin
// app/build.gradle.kts
android {
    buildTypes {
        debug {
            buildConfigField("String", "BASE_URL", "\"http://192.168.1.7:3001\"")
        }
        release {
            buildConfigField("String", "BASE_URL", "\"https://cardbey-core.onrender.com\"")
        }
    }
}
```

**Usage in Kotlin/Java:**
```kotlin
val baseUrl = BuildConfig.BASE_URL
```

### Option 2: Strings Resource File

**Location:** `app/src/main/res/values/strings.xml` or `app/src/main/res/values/config.xml`

```xml
<!-- app/src/main/res/values/strings.xml -->
<resources>
    <string name="base_url">http://192.168.1.7:3001</string>
</resources>
```

**For production, create:** `app/src/main/res/values/config.xml`

```xml
<!-- app/src/main/res/values/config.xml -->
<resources>
    <string name="base_url">https://cardbey-core.onrender.com</string>
</resources>
```

**Usage in Kotlin/Java:**
```kotlin
val baseUrl = context.getString(R.string.base_url)
```

### Option 3: Environment Variables / Build Config

**Location:** `local.properties` (for local dev) or Gradle properties

```properties
# local.properties (local development)
BASE_URL=http://192.168.1.7:3001
```

**In `app/build.gradle`:**
```gradle
def baseUrl = project.findProperty("BASE_URL") ?: "https://cardbey-core.onrender.com"

android {
    buildTypes {
        debug {
            buildConfigField "String", "BASE_URL", "\"$baseUrl\""
        }
        release {
            buildConfigField "String", "BASE_URL", "\"https://cardbey-core.onrender.com\""
        }
    }
}
```

### Option 4: Constants Class

**Location:** `app/src/main/java/com/yourpackage/config/Config.kt` or `Config.java`

```kotlin
// Config.kt
object Config {
    // For production, change this:
    const val BASE_URL = "https://cardbey-core.onrender.com"
    
    // For local development, change this:
    // const val BASE_URL = "http://192.168.1.7:3001"
}
```

**Usage:**
```kotlin
val baseUrl = Config.BASE_URL
```

### Option 5: Network Module (Retrofit/OkHttp)

**Location:** `app/src/main/java/com/yourpackage/network/ApiClient.kt` or similar

```kotlin
// ApiClient.kt
object ApiClient {
    // Change this for production:
    private const val BASE_URL = "https://cardbey-core.onrender.com"
    
    // Or use BuildConfig:
    // private const val BASE_URL = BuildConfig.BASE_URL
    
    val retrofit: Retrofit = Retrofit.Builder()
        .baseUrl(BASE_URL)
        .client(okHttpClient)
        .build()
}
```

## Recommended Approach for Your APK

**Use BuildConfig (Option 1)** - This allows different URLs for debug/release builds:

1. **Open** `app/build.gradle` (or `build.gradle.kts`)
2. **Find** the `android` block with `buildTypes`
3. **Add** `buildConfigField` for `BASE_URL`:

```gradle
android {
    buildFeatures {
        buildConfig = true  // Enable BuildConfig generation
    }
    
    buildTypes {
        debug {
            buildConfigField "String", "BASE_URL", '"http://192.168.1.7:3001"'
        }
        release {
            buildConfigField "String", "BASE_URL", '"https://cardbey-core.onrender.com"'
        }
    }
}
```

4. **In your network code**, use:

```kotlin
import com.yourpackage.BuildConfig

val apiService = Retrofit.Builder()
    .baseUrl(BuildConfig.BASE_URL)
    .build()
    .create(ApiService::class.java)
```

## Quick Steps to Update APK

1. **Locate** your Android project folder (separate from `cardbey-core`)
2. **Open** `app/build.gradle` or `app/build.gradle.kts`
3. **Search** for existing base URL references:
   - Search for: `"http://"`, `"https://"`, `BASE_URL`, `baseUrl`, `API_BASE`
4. **Update** the URL to: `https://cardbey-core.onrender.com`
5. **Rebuild** the APK:
   ```bash
   ./gradlew clean build
   ```
6. **Install** on your TV/device

## Common File Locations to Check

Search for these in your Android project:

```
app/
├── build.gradle                    ← Check here first
├── build.gradle.kts               ← Or here (Kotlin DSL)
├── src/
│   ├── main/
│   │   ├── res/
│   │   │   └── values/
│   │   │       ├── strings.xml    ← May have base URL
│   │   │       └── config.xml     ← May have config
│   │   └── java/.../
│   │       ├── config/
│   │       │   └── Config.kt      ← May have constants
│   │       └── network/
│   │           └── ApiClient.kt   ← Network setup
```

## Testing After Update

1. **Build** the APK with new base URL
2. **Install** on your TV/device
3. **Test** pairing:
   - APK should connect to: `https://cardbey-core.onrender.com`
   - Check pairing flow works
   - Verify playlist fetch works
   - Test video/image playback

## If You Can't Find It

If you can't locate the base URL configuration:

1. **Search** your entire Android project for:
   ```bash
   # In your Android project root
   grep -r "localhost:3001" .
   grep -r "192.168" .
   grep -r "BASE_URL" .
   grep -r "baseUrl" .
   ```

2. **Check** your network/API service files:
   - Look for `Retrofit.Builder()` or `OkHttpClient`
   - Look for `baseUrl()` calls
   - Check for hardcoded URLs in API interface files

3. **Common patterns:**
   - `http://localhost:3001`
   - `http://192.168.x.x:3001`
   - `https://api.cardbey.com` (if you had a previous backend)

## Need Help?

If you can't find the base URL configuration, share:
1. Your Android project structure
2. Your `app/build.gradle` file
3. Your network/API service files

And I'll help you locate it!

