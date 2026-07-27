package com.cardbey.android.ui.shell

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.cardbey.android.core.auth.AuthRepository
import com.cardbey.android.core.navigation.SignedInDestinations
import com.cardbey.android.core.navigation.SignedOutDestinations
import com.cardbey.android.core.navigation.TopLevelDestination
import com.cardbey.android.core.network.connectivity.ConnectivityMonitor
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AppShellUiState(
    val isAuthenticated: Boolean = false,
    val isOnline: Boolean = true,
    val currentRoute: String = TopLevelDestination.Explore.route,
    val bottomDestinations: List<TopLevelDestination> = SignedOutDestinations,
    val displayName: String? = null,
)

@HiltViewModel
class AppShellViewModel @Inject constructor(
    authRepository: AuthRepository,
    connectivityMonitor: ConnectivityMonitor,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AppShellUiState())
    val uiState: StateFlow<AppShellUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            authRepository.restoreSession()
        }
        viewModelScope.launch {
            combine(
                authRepository.session,
                connectivityMonitor.isOnline,
            ) { session, online ->
                AppShellUiState(
                    isAuthenticated = session.isAuthenticated,
                    isOnline = online,
                    currentRoute = _uiState.value.currentRoute,
                    bottomDestinations = if (session.isAuthenticated) {
                        SignedInDestinations
                    } else {
                        SignedOutDestinations
                    },
                    displayName = session.displayName,
                )
            }.collect { state ->
                _uiState.value = state.copy(currentRoute = _uiState.value.currentRoute)
            }
        }
    }

    fun onRouteChanged(route: String?) {
        val normalized = route?.substringBefore("?") ?: return
        _uiState.update { it.copy(currentRoute = normalized) }
    }
}
