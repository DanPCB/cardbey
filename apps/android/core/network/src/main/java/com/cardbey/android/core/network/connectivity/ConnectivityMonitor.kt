package com.cardbey.android.core.network.connectivity

import kotlinx.coroutines.flow.StateFlow

interface ConnectivityMonitor {
    val isOnline: StateFlow<Boolean>
}
