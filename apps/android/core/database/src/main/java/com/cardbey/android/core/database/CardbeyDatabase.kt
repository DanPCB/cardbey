package com.cardbey.android.core.database

import androidx.room.Database
import androidx.room.RoomDatabase
import com.cardbey.android.core.database.dao.MissionCacheDao
import com.cardbey.android.core.database.entity.MissionCacheEntity

@Database(
    entities = [MissionCacheEntity::class],
    version = 1,
    exportSchema = false,
)
abstract class CardbeyDatabase : RoomDatabase() {
    abstract fun missionCacheDao(): MissionCacheDao
}
