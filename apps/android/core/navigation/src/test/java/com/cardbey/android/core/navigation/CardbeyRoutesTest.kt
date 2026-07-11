package com.cardbey.android.core.navigation

import org.junit.Assert.assertEquals
import org.junit.Test

class CardbeyRoutesTest {
    @Test
    fun storeRouteIncludesSlug() {
        assertEquals("store/my-cafe", CardbeyRoutes.store("my-cafe"))
    }
}
