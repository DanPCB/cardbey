package com.cardbey.android.ui.screens.spaces

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.cardbey.android.core.designsystem.component.CardbeyEmptyState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SpacesScreen() {
    Scaffold(
        topBar = { TopAppBar(title = { Text("Spaces") }) },
    ) { padding ->
        CardbeyEmptyState(
            title = "Your spaces",
            message = "Personal and business spaces resolve from /api/auth/me and store context APIs.",
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        )
    }
}
