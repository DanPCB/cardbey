package com.cardbey.android.ui.screens.developer

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.cardbey.android.BuildConfig
import com.cardbey.android.core.auth.AuthRepository
import com.cardbey.android.core.model.error.CardbeyException
import com.cardbey.android.core.network.connectivity.ConnectivityMonitor
import com.cardbey.android.core.network.repository.HealthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class DeveloperUiState(
    val environment: String = BuildConfig.FLAVOR,
    val apiBaseUrl: String = BuildConfig.API_BASE_URL,
    val webBaseUrl: String = BuildConfig.WEB_BASE_URL,
    val appVersion: String = "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})",
    val isAuthenticated: Boolean = false,
    val userLabel: String = "—",
    val isOnline: Boolean = true,
    val lastPingResult: String = "—",
    val lastError: String? = null,
    val isPinging: Boolean = false,
)

@HiltViewModel
class DeveloperViewModel @Inject constructor(
    authRepository: AuthRepository,
    connectivityMonitor: ConnectivityMonitor,
    private val healthRepository: HealthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DeveloperUiState())
    val uiState: StateFlow<DeveloperUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            combine(authRepository.session, connectivityMonitor.isOnline) { session, online ->
                _uiState.value to Pair(session, online)
            }.collect { (current, pair) ->
                val (session, online) = pair
                _uiState.value = current.copy(
                    isAuthenticated = session.isAuthenticated,
                    userLabel = session.displayName ?: session.email ?: session.userId ?: "—",
                    isOnline = online,
                )
            }
        }
    }

    fun pingApi() {
        viewModelScope.launch {
            _uiState.update { it.copy(isPinging = true, lastError = null) }
            healthRepository.ping()
                .onSuccess { response ->
                    _uiState.update {
                        it.copy(
                            isPinging = false,
                            lastPingResult = "ok=${response.ok}, status=${response.status}",
                        )
                    }
                }
                .onFailure { error ->
                    val message = (error as? CardbeyException)?.error?.message ?: error.message
                    _uiState.update {
                        it.copy(isPinging = false, lastError = message, lastPingResult = "failed")
                    }
                }
        }
    }
}
