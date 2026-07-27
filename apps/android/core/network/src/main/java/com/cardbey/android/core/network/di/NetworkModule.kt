package com.cardbey.android.core.network.di

import com.cardbey.android.core.network.api.CardbeyApi
import com.cardbey.android.core.network.auth.SessionInvalidator
import com.cardbey.android.core.network.auth.TokenProvider
import com.cardbey.android.core.network.config.NetworkEnvironment
import com.cardbey.android.core.network.connectivity.AndroidConnectivityMonitor
import com.cardbey.android.core.network.connectivity.ConnectivityMonitor
import com.cardbey.android.core.network.interceptor.AuthInterceptor
import com.cardbey.android.core.network.interceptor.UnauthorizedInterceptor
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideJson(): Json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
    }

    @Provides
    @Singleton
    fun provideOkHttpClient(
        environment: NetworkEnvironment,
        authInterceptor: AuthInterceptor,
        unauthorizedInterceptor: UnauthorizedInterceptor,
    ): OkHttpClient {
        val builder = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .addInterceptor(authInterceptor)
            .addInterceptor(unauthorizedInterceptor)

        if (environment.isDebug) {
            val logging = HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.HEADERS
                redactHeader("Authorization")
            }
            builder.addInterceptor(logging)
        }
        return builder.build()
    }

    @Provides
    @Singleton
    fun provideRetrofit(
        environment: NetworkEnvironment,
        okHttpClient: OkHttpClient,
        json: Json,
    ): Retrofit {
        val baseUrl = environment.apiBaseUrl.trimEnd('/') + "/api/"
        val contentType = "application/json".toMediaType()
        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(okHttpClient)
            .addConverterFactory(json.asConverterFactory(contentType))
            .build()
    }

    @Provides
    @Singleton
    fun provideCardbeyApi(retrofit: Retrofit): CardbeyApi =
        retrofit.create(CardbeyApi::class.java)

    @Provides
    @Singleton
    fun provideConnectivityMonitor(monitor: AndroidConnectivityMonitor): ConnectivityMonitor = monitor
}
