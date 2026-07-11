package com.cardbey.android.core.navigation

object CardbeyRoutes {
    const val EXPLORE = "explore"
    const val SEARCH = "search"
    const val SIGN_IN = "sign_in"
    const val PERFORMER = "performer"
    const val ACTIVITY = "activity"
    const val SPACES = "spaces"
    const val ACCOUNT = "account"
    const val DEVELOPER = "developer"
    const val STORE = "store/{slug}"

    fun store(slug: String) = "store/$slug"
}

enum class TopLevelDestination(val route: String, val label: String) {
    Explore(CardbeyRoutes.EXPLORE, "Explore"),
    Performer(CardbeyRoutes.PERFORMER, "Performer"),
    Activity(CardbeyRoutes.ACTIVITY, "Activity"),
    Spaces(CardbeyRoutes.SPACES, "Spaces"),
    Account(CardbeyRoutes.ACCOUNT, "Account"),
}

val SignedOutDestinations = listOf(
    TopLevelDestination.Explore,
)

val SignedInDestinations = TopLevelDestination.entries
