package com.cardbey.android.ui.screens.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.cardbey.android.BuildConfig

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountScreen(
    onDeveloper: () -> Unit,
    viewModel: AccountViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = { TopAppBar(title = { Text("Account") }) },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (uiState.isAuthenticated) {
                Text(uiState.displayName ?: "Signed in", style = MaterialTheme.typography.titleLarge)
                Text(uiState.email.orEmpty(), style = MaterialTheme.typography.bodyMedium)
                Button(onClick = viewModel::signOut) { Text("Sign out") }
            } else {
                Text("Not signed in", style = MaterialTheme.typography.titleLarge)
            }
            if (BuildConfig.DEBUG) {
                TextButton(onClick = onDeveloper) { Text("Developer") }
            }
        }
    }
}
