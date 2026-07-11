package com.cardbey.android.di

import com.cardbey.android.BuildConfig
import com.cardbey.android.core.network.config.NetworkEnvironment
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideNetworkEnvironment(): NetworkEnvironment = object : NetworkEnvironment {
        override val apiBaseUrl: String = BuildConfig.API_BASE_URL
        override val webBaseUrl: String = BuildConfig.WEB_BASE_URL
        override val appLinkHost: String = BuildConfig.APP_LINK_HOST
        override val allowsCleartext: Boolean = BuildConfig.DEBUG
        override val isDebug: Boolean = BuildConfig.DEBUG
    }
}
