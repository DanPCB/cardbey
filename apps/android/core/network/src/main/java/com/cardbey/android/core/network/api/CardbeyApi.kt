package com.cardbey.android.core.network.api

import com.cardbey.android.core.model.auth.LoginRequest
import com.cardbey.android.core.model.auth.LoginResponse
import com.cardbey.android.core.model.auth.MeResponse
import com.cardbey.android.core.model.health.HealthResponse
import com.cardbey.android.core.model.health.PingResponse
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

/**
 * Cardbey Core REST API — paths are relative to base URL ending with `/api/`.
 */
interface CardbeyApi {
    @GET("ping")
    suspend fun ping(): PingResponse

    @GET("health")
    suspend fun health(): HealthResponse

    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): LoginResponse

    @GET("auth/me")
    suspend fun me(): MeResponse

    @POST("auth/logout")
    suspend fun logout()
}
