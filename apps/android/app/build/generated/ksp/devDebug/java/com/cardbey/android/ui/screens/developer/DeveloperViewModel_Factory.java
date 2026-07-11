package com.cardbey.android.ui.screens.developer;

import com.cardbey.android.core.auth.AuthRepository;
import com.cardbey.android.core.network.connectivity.ConnectivityMonitor;
import com.cardbey.android.core.network.repository.HealthRepository;
import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
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
public final class DeveloperViewModel_Factory implements Factory<DeveloperViewModel> {
  private final Provider<AuthRepository> authRepositoryProvider;

  private final Provider<ConnectivityMonitor> connectivityMonitorProvider;

  private final Provider<HealthRepository> healthRepositoryProvider;

  public DeveloperViewModel_Factory(Provider<AuthRepository> authRepositoryProvider,
      Provider<ConnectivityMonitor> connectivityMonitorProvider,
      Provider<HealthRepository> healthRepositoryProvider) {
    this.authRepositoryProvider = authRepositoryProvider;
    this.connectivityMonitorProvider = connectivityMonitorProvider;
    this.healthRepositoryProvider = healthRepositoryProvider;
  }

  @Override
  public DeveloperViewModel get() {
    return newInstance(authRepositoryProvider.get(), connectivityMonitorProvider.get(), healthRepositoryProvider.get());
  }

  public static DeveloperViewModel_Factory create(Provider<AuthRepository> authRepositoryProvider,
      Provider<ConnectivityMonitor> connectivityMonitorProvider,
      Provider<HealthRepository> healthRepositoryProvider) {
    return new DeveloperViewModel_Factory(authRepositoryProvider, connectivityMonitorProvider, healthRepositoryProvider);
  }

  public static DeveloperViewModel newInstance(AuthRepository authRepository,
      ConnectivityMonitor connectivityMonitor, HealthRepository healthRepository) {
    return new DeveloperViewModel(authRepository, connectivityMonitor, healthRepository);
  }
}
