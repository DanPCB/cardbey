package com.cardbey.android.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.rememberNavController
import com.cardbey.android.ui.components.CardbeyBottomBar
import com.cardbey.android.ui.components.OfflineBanner
import com.cardbey.android.ui.navigation.CardbeyNavHost
import com.cardbey.android.ui.shell.AppShellViewModel

@Composable
fun CardbeyApp(
    viewModel: AppShellViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val navController = rememberNavController()

    Scaffold(
        bottomBar = {
            CardbeyBottomBar(
                destinations = uiState.bottomDestinations,
                currentRoute = uiState.currentRoute,
                onNavigate = { route ->
                    navController.navigate(route) {
                        popUpTo(navController.graph.startDestinationId) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                },
            )
        },
    ) { innerPadding ->
        OfflineBanner(
            isOnline = uiState.isOnline,
            modifier = Modifier.padding(innerPadding),
        ) {
            CardbeyNavHost(
                navController = navController,
                isAuthenticated = uiState.isAuthenticated,
                onRouteChanged = viewModel::onRouteChanged,
                modifier = Modifier.padding(innerPadding),
            )
        }
    }
}
