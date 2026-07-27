package com.cardbey.android.ui.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.HomeWork
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.vector.ImageVector
import com.cardbey.android.core.navigation.TopLevelDestination

@Composable
fun CardbeyBottomBar(
    destinations: List<TopLevelDestination>,
    currentRoute: String,
    onNavigate: (String) -> Unit,
) {
    if (destinations.isEmpty()) return

    NavigationBar {
        destinations.forEach { destination ->
            val selected = currentRoute == destination.route ||
                currentRoute.startsWith(destination.route)
            NavigationBarItem(
                selected = selected,
                onClick = { onNavigate(destination.route) },
                icon = {
                    Icon(
                        imageVector = destination.icon(),
                        contentDescription = destination.label,
                    )
                },
                label = { Text(destination.label) },
            )
        }
    }
}

private fun TopLevelDestination.icon(): ImageVector = when (this) {
    TopLevelDestination.Explore -> Icons.Default.Explore
    TopLevelDestination.Performer -> Icons.Default.AutoAwesome
    TopLevelDestination.Activity -> Icons.AutoMirrored.Filled.List
    TopLevelDestination.Spaces -> Icons.Default.HomeWork
    TopLevelDestination.Account -> Icons.Default.AccountCircle
}
