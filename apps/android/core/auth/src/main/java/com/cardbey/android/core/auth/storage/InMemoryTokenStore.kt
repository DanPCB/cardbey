package com.cardbey.android.core.auth.storage

import com.cardbey.android.core.network.auth.SessionInvalidator
import com.cardbey.android.core.network.auth.TokenProvider
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * In-memory bearer token holder used by OkHttp interceptors.
 * Kept separate from [com.cardbey.android.core.auth.AuthRepository] to avoid a Hilt cycle:
 * AuthRepository → CardbeyApi → OkHttp → interceptors → token holder.
 */
@Singleton
class InMemoryTokenStore @Inject constructor() : TokenProvider, SessionInvalidator {

    @Volatile
    private var accessToken: String? = null

    private val _unauthorizedEvents = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val unauthorizedEvents: SharedFlow<Unit> = _unauthorizedEvents.asSharedFlow()

    override fun getAccessToken(): String? = accessToken

    fun setAccessToken(token: String?) {
        accessToken = token
    }

    override fun onUnauthorized() {
        accessToken = null
        _unauthorizedEvents.tryEmit(Unit)
    }
}
