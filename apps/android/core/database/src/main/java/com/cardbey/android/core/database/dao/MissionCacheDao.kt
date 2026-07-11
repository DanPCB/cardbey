package com.cardbey.android.core.database.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.cardbey.android.core.database.entity.MissionCacheEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface MissionCacheDao {
    @Query("SELECT * FROM mission_cache ORDER BY updatedAt DESC LIMIT :limit")
    fun observeRecent(limit: Int = 20): Flow<List<MissionCacheEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: MissionCacheEntity)

    @Query("DELETE FROM mission_cache WHERE missionId = :missionId")
    suspend fun delete(missionId: String)
}
