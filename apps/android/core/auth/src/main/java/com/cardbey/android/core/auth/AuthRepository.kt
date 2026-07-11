package com.cardbey.android.core.auth

import com.cardbey.android.core.auth.storage.InMemoryTokenStore
import com.cardbey.android.core.auth.storage.TokenStorage
import com.cardbey.android.core.model.auth.LoginRequest
import com.cardbey.android.core.model.auth.UserDto
import com.cardbey.android.core.model.error.CardbeyError
import com.cardbey.android.core.model.error.CardbeyException
import com.cardbey.android.core.model.session.SessionState
import com.cardbey.android.core.network.api.CardbeyApi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val api: CardbeyApi,
    private val tokenStorage: TokenStorage,
    private val inMemoryTokenStore: InMemoryTokenStore,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _session = MutableStateFlow(SessionState())
    val session: StateFlow<SessionState> = _session.asStateFlow()

    init {
        scope.launch {
            inMemoryTokenStore.unauthorizedEvents.collect {
                clearSessionLocalOnly()
            }
        }
    }

    suspend fun restoreSession() {
        val token = tokenStorage.getToken()
        inMemoryTokenStore.setAccessToken(token)
        if (token.isNullOrBlank()) {
            _session.value = SessionState()
            return
        }
        try {
            val response = api.me()
            val user = response.user
            if (response.ok && user != null) {
                _session.value = user.toSessionState()
            } else {
                clearSession()
            }
        } catch (_: Exception) {
            // Keep token; network may be offline — session restored optimistically
            _session.value = _session.value.copy(isAuthenticated = true)
        }
    }

    suspend fun login(email: String, password: String): Result<UserDto> {
        return try {
            val response = api.login(LoginRequest(email = email.trim(), password = password))
            val token = response.token ?: response.accessToken
            val user = response.user
            if (!response.ok || token.isNullOrBlank() || user == null) {
                Result.failure(
                    CardbeyException(
                        CardbeyError.Authentication(response.message ?: response.error ?: "Login failed"),
                    ),
                )
            } else {
                persistToken(token)
                _session.value = user.toSessionState()
                Result.success(user)
            }
        } catch (e: IOException) {
            Result.failure(CardbeyException(CardbeyError.Connectivity(e.message ?: "Network error")))
        } catch (e: Exception) {
            Result.failure(CardbeyException(CardbeyError.Server(e.message ?: "Login failed")))
        }
    }

    suspend fun signOut() {
        try {
            api.logout()
        } catch (_: Exception) {
            // Best effort
        }
        clearSession()
    }

    private suspend fun persistToken(token: String) {
        inMemoryTokenStore.setAccessToken(token)
        tokenStorage.saveToken(token)
    }

    private suspend fun clearSession() {
        inMemoryTokenStore.setAccessToken(null)
        tokenStorage.clearToken()
        _session.value = SessionState()
    }

    private fun clearSessionLocalOnly() {
        _session.value = SessionState()
        scope.launch { tokenStorage.clearToken() }
    }

    private fun UserDto.toSessionState() = SessionState(
        isAuthenticated = true,
        userId = id,
        displayName = displayName,
        email = email,
    )
}
