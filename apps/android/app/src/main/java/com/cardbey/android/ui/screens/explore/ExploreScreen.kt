package com.cardbey.android.ui.screens.explore

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExploreScreen(
    isAuthenticated: Boolean,
    onSignIn: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(title = { Text("Explore") })
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = "Cardbey marketplace",
                style = MaterialTheme.typography.headlineMedium,
            )
            Text(
                text = "Public store feed connects in Phase 3 via GET /api/public/stores/feed.",
                style = MaterialTheme.typography.bodyMedium,
            )
            if (!isAuthenticated) {
                Button(onClick = onSignIn) {
                    Text("Sign in")
                }
            }
        }
    }
}
