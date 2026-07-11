package com.cardbey.android.core.model.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LoginResponseTest {
    @Test
    fun prefersTokenField() {
        val response = LoginResponse(
            ok = true,
            token = "jwt-token",
            accessToken = "alt",
            user = UserDto(id = "u1", email = "a@b.com"),
        )
        assertEquals("jwt-token", response.token ?: response.accessToken)
        assertTrue(response.ok)
    }
}
