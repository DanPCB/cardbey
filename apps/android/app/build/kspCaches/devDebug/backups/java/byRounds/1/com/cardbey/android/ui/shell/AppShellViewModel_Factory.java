package com.cardbey.android.ui.shell;

import com.cardbey.android.core.auth.AuthRepository;
import com.cardbey.android.core.network.connectivity.ConnectivityMonitor;
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
public final class AppShellViewModel_Factory implements Factory<AppShellViewModel> {
  private final Provider<AuthRepository> authRepositoryProvider;

  private final Provider<ConnectivityMonitor> connectivityMonitorProvider;

  public AppShellViewModel_Factory(Provider<AuthRepository> authRepositoryProvider,
      Provider<ConnectivityMonitor> connectivityMonitorProvider) {
    this.authRepositoryProvider = authRepositoryProvider;
    this.connectivityMonitorProvider = connectivityMonitorProvider;
  }

  @Override
  public AppShellViewModel get() {
    return newInstance(authRepositoryProvider.get(), connectivityMonitorProvider.get());
  }

  public static AppShellViewModel_Factory create(Provider<AuthRepository> authRepositoryProvider,
      Provider<ConnectivityMonitor> connectivityMonitorProvider) {
    return new AppShellViewModel_Factory(authRepositoryProvider, connectivityMonitorProvider);
  }

  public static AppShellViewModel newInstance(AuthRepository authRepository,
      ConnectivityMonitor connectivityMonitor) {
    return new AppShellViewModel(authRepository, connectivityMonitor);
  }
}
