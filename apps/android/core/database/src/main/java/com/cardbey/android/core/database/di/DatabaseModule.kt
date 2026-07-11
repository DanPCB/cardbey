package com.cardbey.android.core.database.di

import android.content.Context
import androidx.room.Room
import com.cardbey.android.core.database.CardbeyDatabase
import com.cardbey.android.core.database.dao.MissionCacheDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): CardbeyDatabase =
        Room.databaseBuilder(context, CardbeyDatabase::class.java, "cardbey.db")
            .fallbackToDestructiveMigration()
            .build()

    @Provides
    fun provideMissionCacheDao(db: CardbeyDatabase): MissionCacheDao = db.missionCacheDao()
}
