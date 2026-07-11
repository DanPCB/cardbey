package com.cardbey.android.core.auth.di

import com.cardbey.android.core.auth.storage.InMemoryTokenStore
import com.cardbey.android.core.auth.storage.SecureTokenStorage
import com.cardbey.android.core.auth.storage.TokenStorage
import com.cardbey.android.core.network.auth.SessionInvalidator
import com.cardbey.android.core.network.auth.TokenProvider
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class AuthModule {

    @Binds
    @Singleton
    abstract fun bindTokenStorage(impl: SecureTokenStorage): TokenStorage

    @Binds
    @Singleton
    abstract fun bindTokenProvider(impl: InMemoryTokenStore): TokenProvider

    @Binds
    @Singleton
    abstract fun bindSessionInvalidator(impl: InMemoryTokenStore): SessionInvalidator
}
