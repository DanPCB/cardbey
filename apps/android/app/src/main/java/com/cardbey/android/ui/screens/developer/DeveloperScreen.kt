package com.cardbey.android.ui.screens.developer

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeveloperScreen(
    onBack: () -> Unit,
    viewModel: DeveloperViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Developer") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            DiagnosticRow("Environment", uiState.environment)
            DiagnosticRow("API base", uiState.apiBaseUrl)
            DiagnosticRow("Web base", uiState.webBaseUrl)
            DiagnosticRow("App version", uiState.appVersion)
            DiagnosticRow("Auth", if (uiState.isAuthenticated) "Signed in" else "Signed out")
            DiagnosticRow("User", uiState.userLabel)
            DiagnosticRow("Online", uiState.isOnline.toString())
            DiagnosticRow("Last ping", uiState.lastPingResult)
            DiagnosticRow("Last error", uiState.lastError ?: "—")
            Button(
                onClick = viewModel::pingApi,
                enabled = !uiState.isPinging,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (uiState.isPinging) "Pinging…" else "Ping API")
            }
        }
    }
}

@Composable
private fun DiagnosticRow(label: String, value: String) {
    Text(text = label, style = MaterialTheme.typography.labelLarge)
    Text(text = value, style = MaterialTheme.typography.bodyMedium)
}
