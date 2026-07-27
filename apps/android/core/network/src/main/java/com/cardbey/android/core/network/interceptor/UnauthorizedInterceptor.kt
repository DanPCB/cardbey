package com.cardbey.android.core.network.interceptor

import com.cardbey.android.core.network.auth.SessionInvalidator
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject

class UnauthorizedInterceptor @Inject constructor(
    private val sessionInvalidator: SessionInvalidator,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val response = chain.proceed(chain.request())
        if (response.code == 401) {
            sessionInvalidator.onUnauthorized()
        }
        return response
    }
}
