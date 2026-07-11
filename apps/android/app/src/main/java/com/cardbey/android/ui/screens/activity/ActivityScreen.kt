package com.cardbey.android.ui.screens.activity

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.cardbey.android.core.designsystem.component.CardbeyEmptyState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ActivityScreen() {
    Scaffold(
        topBar = { TopAppBar(title = { Text("Activity") }) },
    ) { padding ->
        CardbeyEmptyState(
            title = "No recent missions",
            message = "Mission history loads from GET /api/missions/recent-for-threads in Phase 4.",
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        )
    }
}
