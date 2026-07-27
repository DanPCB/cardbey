package com.cardbey.android.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "mission_cache")
data class MissionCacheEntity(
    @PrimaryKey val missionId: String,
    val status: String,
    val runtimeState: String?,
    val title: String?,
    val lastEventSeq: Long,
    val updatedAt: Long,
)
