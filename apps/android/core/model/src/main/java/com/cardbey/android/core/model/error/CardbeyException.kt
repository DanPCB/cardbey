package com.cardbey.android.core.model.error

class CardbeyException(val error: CardbeyError) : Exception(error.message)
