package com.cardbey.android.ui.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import com.cardbey.android.core.navigation.CardbeyRoutes
import com.cardbey.android.ui.screens.account.AccountScreen
import com.cardbey.android.ui.screens.activity.ActivityScreen
import com.cardbey.android.ui.screens.developer.DeveloperScreen
import com.cardbey.android.ui.screens.explore.ExploreScreen
import com.cardbey.android.ui.screens.performer.PerformerScreen
import com.cardbey.android.ui.screens.signin.SignInScreen
import com.cardbey.android.ui.screens.spaces.SpacesScreen

@Composable
fun CardbeyNavHost(
    navController: NavHostController,
    isAuthenticated: Boolean,
    onRouteChanged: (String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val backStackEntry = navController.currentBackStackEntryAsState()
    LaunchedEffect(backStackEntry.value) {
        onRouteChanged(backStackEntry.value?.destination?.route)
    }

    NavHost(
        navController = navController,
        startDestination = CardbeyRoutes.EXPLORE,
        modifier = modifier,
    ) {
        composable(CardbeyRoutes.EXPLORE) {
            ExploreScreen(
                onSignIn = { navController.navigate(CardbeyRoutes.SIGN_IN) },
                isAuthenticated = isAuthenticated,
            )
        }
        composable(CardbeyRoutes.SIGN_IN) {
            SignInScreen(
                onSignedIn = {
                    navController.popBackStack()
                    navController.navigate(CardbeyRoutes.PERFORMER)
                },
            )
        }
        composable(CardbeyRoutes.PERFORMER) {
            PerformerScreen()
        }
        composable(CardbeyRoutes.ACTIVITY) {
            ActivityScreen()
        }
        composable(CardbeyRoutes.SPACES) {
            SpacesScreen()
        }
        composable(CardbeyRoutes.ACCOUNT) {
            AccountScreen(
                onDeveloper = { navController.navigate(CardbeyRoutes.DEVELOPER) },
            )
        }
        composable(CardbeyRoutes.DEVELOPER) {
            DeveloperScreen(onBack = { navController.popBackStack() })
        }
    }
}
