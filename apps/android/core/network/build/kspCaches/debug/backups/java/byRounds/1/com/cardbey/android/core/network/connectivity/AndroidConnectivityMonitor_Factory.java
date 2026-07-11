package com.cardbey.android.core.network.connectivity;

import android.content.Context;
import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import javax.annotation.processing.Generated;
import javax.inject.Provider;

@ScopeMetadata("javax.inject.Singleton")
@QualifierMetadata("dagger.hilt.android.qualifiers.ApplicationContext")
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
public final class AndroidConnectivityMonitor_Factory implements Factory<AndroidConnectivityMonitor> {
  private final Provider<Context> contextProvider;

  public AndroidConnectivityMonitor_Factory(Provider<Context> contextProvider) {
    this.contextProvider = contextProvider;
  }

  @Override
  public AndroidConnectivityMonitor get() {
    return newInstance(contextProvider.get());
  }

  public static AndroidConnectivityMonitor_Factory create(Provider<Context> contextProvider) {
    return new AndroidConnectivityMonitor_Factory(contextProvider);
  }

  public static AndroidConnectivityMonitor newInstance(Context context) {
    return new AndroidConnectivityMonitor(context);
  }
}
