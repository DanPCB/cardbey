pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "cardbey-android"

include(":app")
include(":core:designsystem")
include(":core:model")
include(":core:network")
include(":core:database")
include(":core:auth")
include(":core:navigation")
