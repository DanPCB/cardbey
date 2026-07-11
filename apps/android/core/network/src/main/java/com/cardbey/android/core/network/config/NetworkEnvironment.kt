package com.cardbey.android.core.network.config

interface NetworkEnvironment {
    val apiBaseUrl: String
    val webBaseUrl: String
    val appLinkHost: String
    val allowsCleartext: Boolean
    val isDebug: Boolean
}
