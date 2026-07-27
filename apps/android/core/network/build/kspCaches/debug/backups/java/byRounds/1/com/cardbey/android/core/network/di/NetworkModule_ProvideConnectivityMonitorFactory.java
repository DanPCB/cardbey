package com.cardbey.android.core.network.di;

import com.cardbey.android.core.network.connectivity.AndroidConnectivityMonitor;
import com.cardbey.android.core.network.connectivity.ConnectivityMonitor;
import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.Preconditions;
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
public final class NetworkModule_ProvideConnectivityMonitorFactory implements Factory<ConnectivityMonitor> {
  private final Provider<AndroidConnectivityMonitor> monitorProvider;

  public NetworkModule_ProvideConnectivityMonitorFactory(
      Provider<AndroidConnectivityMonitor> monitorProvider) {
    this.monitorProvider = monitorProvider;
  }

  @Override
  public ConnectivityMonitor get() {
    return provideConnectivityMonitor(monitorProvider.get());
  }

  public static NetworkModule_ProvideConnectivityMonitorFactory create(
      Provider<AndroidConnectivityMonitor> monitorProvider) {
    return new NetworkModule_ProvideConnectivityMonitorFactory(monitorProvider);
  }

  public static ConnectivityMonitor provideConnectivityMonitor(AndroidConnectivityMonitor monitor) {
    return Preconditions.checkNotNullFromProvides(NetworkModule.INSTANCE.provideConnectivityMonitor(monitor));
  }
}
