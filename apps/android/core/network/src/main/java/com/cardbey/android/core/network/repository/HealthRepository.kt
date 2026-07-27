package com.cardbey.android.core.network.repository

import com.cardbey.android.core.model.error.CardbeyError
import com.cardbey.android.core.model.error.CardbeyException
import com.cardbey.android.core.model.health.PingResponse
import com.cardbey.android.core.network.api.CardbeyApi
import com.cardbey.android.core.network.connectivity.ConnectivityMonitor
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class HealthRepository @Inject constructor(
    private val api: CardbeyApi,
    private val connectivityMonitor: ConnectivityMonitor,
) {
    suspend fun ping(): Result<PingResponse> = execute {
        api.ping()
    }

    private suspend inline fun <T> execute(block: () -> T): Result<T> {
        if (!connectivityMonitor.isOnline.value) {
            return Result.failure(CardbeyException(CardbeyError.Connectivity()))
        }
        return try {
            Result.success(block())
        } catch (e: IOException) {
            Result.failure(CardbeyException(CardbeyError.Connectivity(e.message ?: "Network error")))
        } catch (e: Exception) {
            Result.failure(CardbeyException(CardbeyError.Server(e.message ?: "Request failed")))
        }
    }
}
