package com.cardbey.android.core.network.auth

interface TokenProvider {
    fun getAccessToken(): String?
}

interface SessionInvalidator {
    fun onUnauthorized()
}
