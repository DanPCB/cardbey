package com.cardbey.android.core.model.auth

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class LoginRequest(
    val email: String,
    val password: String,
)

@Serializable
data class LoginResponse(
    val ok: Boolean = false,
    val token: String? = null,
    @SerialName("accessToken") val accessToken: String? = null,
    val user: UserDto? = null,
    val error: String? = null,
    val message: String? = null,
)

@Serializable
data class MeResponse(
    val ok: Boolean = false,
    val user: UserDto? = null,
    val error: String? = null,
)

@Serializable
data class UserDto(
    val id: String,
    val email: String? = null,
    val displayName: String? = null,
    val handle: String? = null,
    val roles: List<String> = emptyList(),
    val role: String? = null,
    val avatarUrl: String? = null,
    val stores: List<StoreSummaryDto> = emptyList(),
    @SerialName("hasStore") val hasStore: Boolean = false,
    @SerialName("emailVerified") val emailVerified: Boolean = false,
)

@Serializable
data class StoreSummaryDto(
    val id: String,
    val name: String,
    val slug: String? = null,
)

@Serializable
data class ApiErrorBody(
    val ok: Boolean = false,
    val error: String? = null,
    val message: String? = null,
)
