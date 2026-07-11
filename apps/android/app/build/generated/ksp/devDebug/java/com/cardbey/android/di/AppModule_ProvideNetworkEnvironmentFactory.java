package com.cardbey.android.di;

import com.cardbey.android.core.network.config.NetworkEnvironment;
import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.Preconditions;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import javax.annotation.processing.Generated;

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
public final class AppModule_ProvideNetworkEnvironmentFactory implements Factory<NetworkEnvironment> {
  @Override
  public NetworkEnvironment get() {
    return provideNetworkEnvironment();
  }

  public static AppModule_ProvideNetworkEnvironmentFactory create() {
    return InstanceHolder.INSTANCE;
  }

  public static NetworkEnvironment provideNetworkEnvironment() {
    return Preconditions.checkNotNullFromProvides(AppModule.INSTANCE.provideNetworkEnvironment());
  }

  private static final class InstanceHolder {
    private static final AppModule_ProvideNetworkEnvironmentFactory INSTANCE = new AppModule_ProvideNetworkEnvironmentFactory();
  }
}
