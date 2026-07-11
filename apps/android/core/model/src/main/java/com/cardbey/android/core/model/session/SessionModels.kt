package com.cardbey.android.core.model.session

data class SessionState(
    val isAuthenticated: Boolean = false,
    val userId: String? = null,
    val displayName: String? = null,
    val email: String? = null,
    val activeSpaceId: String? = null,
    val activeStoreId: String? = null,
)

enum class SpaceType {
    PERSONAL,
    BUSINESS,
}

data class ActiveContext(
    val spaceType: SpaceType = SpaceType.PERSONAL,
    val spaceId: String = "personal",
    val storeId: String? = null,
    val storeName: String? = null,
)
