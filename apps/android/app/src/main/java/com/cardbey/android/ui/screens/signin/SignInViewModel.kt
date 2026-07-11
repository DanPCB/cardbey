package com.cardbey.android.ui.screens.signin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.cardbey.android.core.auth.AuthRepository
import com.cardbey.android.core.model.error.CardbeyException
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SignInUiState(
    val email: String = "",
    val password: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val signedIn: Boolean = false,
)

@HiltViewModel
class SignInViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SignInUiState())
    val uiState: StateFlow<SignInUiState> = _uiState.asStateFlow()

    fun onEmailChange(value: String) {
        _uiState.update { it.copy(email = value, errorMessage = null) }
    }

    fun onPasswordChange(value: String) {
        _uiState.update { it.copy(password = value, errorMessage = null) }
    }

    fun signIn() {
        val email = _uiState.value.email.trim()
        val password = _uiState.value.password
        if (email.isBlank() || password.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Email and password are required") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            authRepository.login(email, password)
                .onSuccess {
                    _uiState.update { it.copy(isLoading = false, signedIn = true) }
                }
                .onFailure { error ->
                    val message = (error as? CardbeyException)?.error?.message ?: error.message
                    _uiState.update {
                        it.copy(isLoading = false, errorMessage = message ?: "Sign in failed")
                    }
                }
        }
    }
}
