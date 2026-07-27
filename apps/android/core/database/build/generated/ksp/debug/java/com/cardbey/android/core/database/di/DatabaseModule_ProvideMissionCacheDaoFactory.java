package com.cardbey.android.core.database.di;

import com.cardbey.android.core.database.CardbeyDatabase;
import com.cardbey.android.core.database.dao.MissionCacheDao;
import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.Preconditions;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import javax.annotation.processing.Generated;
import javax.inject.Provider;

@ScopeMetadata
@QualifierMetadata
@DaggerGenerated
@Generated(
    value = "dagger.internal.codegen.ComponentProcessor",
    comments = "https://dagger.dev"
)
@SuppressWarnings({
    "unchecked",
    "rawtypes",
    "KotlinInternal",
    "KotlinInternalInJava",
    "cast",
    "deprecation"
})
public final class DatabaseModule_ProvideMissionCacheDaoFactory implements Factory<MissionCacheDao> {
  private final Provider<CardbeyDatabase> dbProvider;

  public DatabaseModule_ProvideMissionCacheDaoFactory(Provider<CardbeyDatabase> dbProvider) {
    this.dbProvider = dbProvider;
  }

  @Override
  public MissionCacheDao get() {
    return provideMissionCacheDao(dbProvider.get());
  }

  public static DatabaseModule_ProvideMissionCacheDaoFactory create(
      Provider<CardbeyDatabase> dbProvider) {
    return new DatabaseModule_ProvideMissionCacheDaoFactory(dbProvider);
  }

  public static MissionCacheDao provideMissionCacheDao(CardbeyDatabase db) {
    return Preconditions.checkNotNullFromProvides(DatabaseModule.INSTANCE.provideMissionCacheDao(db));
  }
}
