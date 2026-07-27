package com.cardbey.android.core.model.error

sealed class CardbeyError(
    open val message: String,
    open val retrySafe: Boolean = false,
    open val savedWork: Boolean = false,
) {
    data class Authentication(override val message: String) : CardbeyError(message)
    data class Permission(override val message: String) : CardbeyError(message)
    data class Validation(override val message: String) : CardbeyError(message)
    data class Connectivity(
        override val message: String = "No network connection",
        override val retrySafe: Boolean = true,
    ) : CardbeyError(message, retrySafe = true)

    data class Timeout(override val message: String, override val retrySafe: Boolean = true) :
        CardbeyError(message, retrySafe = true)

    data class RateLimit(override val message: String) : CardbeyError(message)
    data class Server(override val message: String, override val retrySafe: Boolean = true) :
        CardbeyError(message, retrySafe = true)

    data class Mission(override val message: String, override val savedWork: Boolean = true) :
        CardbeyError(message, savedWork = true)

    data class Upload(override val message: String, override val retrySafe: Boolean = true) :
        CardbeyError(message, retrySafe = true)

    data class Unsupported(override val message: String) : CardbeyError(message)
    data class Conflict(override val message: String) : CardbeyError(message)
    data class StaleState(override val message: String, override val retrySafe: Boolean = true) :
        CardbeyError(message, retrySafe = true)

    data class ApprovalRequired(override val message: String) : CardbeyError(message, savedWork = true)
}
