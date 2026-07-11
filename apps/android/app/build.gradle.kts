plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.hilt)
    alias(libs.plugins.ksp)
    alias(libs.plugins.detekt)
}

android {
    namespace = "com.cardbey.android"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.cardbey.app"
        minSdk = 28
        targetSdk = 35
        versionCode = project.findProperty("CARDNEY_VERSION_CODE")?.toString()?.toInt() ?: 1
        versionName = project.findProperty("CARDNEY_VERSION_NAME")?.toString() ?: "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    flavorDimensions += "environment"
    productFlavors {
        create("dev") {
            dimension = "environment"
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
            buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:3001\"")
            buildConfigField("String", "WEB_BASE_URL", "\"http://10.0.2.2:5174\"")
            buildConfigField("String", "APP_LINK_HOST", "\"dev.cardbey.com\"")
            manifestPlaceholders["usesCleartext"] = "true"
            manifestPlaceholders["appLinkHost"] = "dev.cardbey.com"
        }
        create("staging") {
            dimension = "environment"
            applicationIdSuffix = ".staging"
            versionNameSuffix = "-staging"
            buildConfigField("String", "API_BASE_URL", "\"https://cardbey-core-staging.onrender.com\"")
            buildConfigField("String", "WEB_BASE_URL", "\"https://cardbey-dashboard-staging.onrender.com\"")
            buildConfigField("String", "APP_LINK_HOST", "\"staging.cardbey.com\"")
            manifestPlaceholders["usesCleartext"] = "false"
            manifestPlaceholders["appLinkHost"] = "staging.cardbey.com"
        }
        create("production") {
            dimension = "environment"
            buildConfigField("String", "API_BASE_URL", "\"https://cardbey-core.onrender.com\"")
            buildConfigField("String", "WEB_BASE_URL", "\"https://cardbey.com\"")
            buildConfigField("String", "APP_LINK_HOST", "\"cardbey.com\"")
            manifestPlaceholders["usesCleartext"] = "false"
            manifestPlaceholders["appLinkHost"] = "cardbey.com"
        }
    }

    buildTypes {
        debug {
            isDebuggable = true
        }
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

detekt {
    buildUponDefaultConfig = true
    allRules = false
}

dependencies {
    implementation(project(":core:designsystem"))
    implementation(project(":core:model"))
    implementation(project(":core:network"))
    implementation(project(":core:database"))
    implementation(project(":core:auth"))
    implementation(project(":core:navigation"))

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.hilt.android)
    implementation(libs.hilt.navigation.compose)
    ksp(libs.hilt.compiler)

    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.turbine)

    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
}
