package com.cardbey.android.core.network.repository;

import com.cardbey.android.core.network.api.CardbeyApi;
import com.cardbey.android.core.network.connectivity.ConnectivityMonitor;
import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import javax.annotation.processing.Generated;
import javax.inject.Provider;

@ScopeMetadata("javax.inject.Singleton")
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
public final class HealthRepository_Factory implements Factory<HealthRepository> {
  private final Provider<CardbeyApi> apiProvider;

  private final Provider<ConnectivityMonitor> connectivityMonitorProvider;

  public HealthRepository_Factory(Provider<CardbeyApi> apiProvider,
      Provider<ConnectivityMonitor> connectivityMonitorProvider) {
    this.apiProvider = apiProvider;
    this.connectivityMonitorProvider = connectivityMonitorProvider;
  }

  @Override
  public HealthRepository get() {
    return newInstance(apiProvider.get(), connectivityMonitorProvider.get());
  }

  public static HealthRepository_Factory create(Provider<CardbeyApi> apiProvider,
      Provider<ConnectivityMonitor> connectivityMonitorProvider) {
    return new HealthRepository_Factory(apiProvider, connectivityMonitorProvider);
  }

  public static HealthRepository newInstance(CardbeyApi api,
      ConnectivityMonitor connectivityMonitor) {
    return new HealthRepository(api, connectivityMonitor);
  }
}
