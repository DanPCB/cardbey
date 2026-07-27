package com.cardbey.android.core.model.health

import kotlinx.serialization.Serializable

@Serializable
data class PingResponse(
    val ok: Boolean = false,
    val status: String? = null,
)

@Serializable
data class HealthResponse(
    val ok: Boolean = false,
    val status: String? = null,
    val env: String? = null,
    val version: String? = null,
)
