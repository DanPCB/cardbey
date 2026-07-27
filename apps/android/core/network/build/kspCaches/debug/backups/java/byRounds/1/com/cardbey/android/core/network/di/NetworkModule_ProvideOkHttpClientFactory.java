package com.cardbey.android.core.network.di;

import com.cardbey.android.core.network.config.NetworkEnvironment;
import com.cardbey.android.core.network.interceptor.AuthInterceptor;
import com.cardbey.android.core.network.interceptor.UnauthorizedInterceptor;
import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.Preconditions;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import javax.annotation.processing.Generated;
import javax.inject.Provider;
import okhttp3.OkHttpClient;

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
public final class NetworkModule_ProvideOkHttpClientFactory implements Factory<OkHttpClient> {
  private final Provider<NetworkEnvironment> environmentProvider;

  private final Provider<AuthInterceptor> authInterceptorProvider;

  private final Provider<UnauthorizedInterceptor> unauthorizedInterceptorProvider;

  public NetworkModule_ProvideOkHttpClientFactory(Provider<NetworkEnvironment> environmentProvider,
      Provider<AuthInterceptor> authInterceptorProvider,
      Provider<UnauthorizedInterceptor> unauthorizedInterceptorProvider) {
    this.environmentProvider = environmentProvider;
    this.authInterceptorProvider = authInterceptorProvider;
    this.unauthorizedInterceptorProvider = unauthorizedInterceptorProvider;
  }

  @Override
  public OkHttpClient get() {
    return provideOkHttpClient(environmentProvider.get(), authInterceptorProvider.get(), unauthorizedInterceptorProvider.get());
  }

  public static NetworkModule_ProvideOkHttpClientFactory create(
      Provider<NetworkEnvironment> environmentProvider,
      Provider<AuthInterceptor> authInterceptorProvider,
      Provider<UnauthorizedInterceptor> unauthorizedInterceptorProvider) {
    return new NetworkModule_ProvideOkHttpClientFactory(environmentProvider, authInterceptorProvider, unauthorizedInterceptorProvider);
  }

  public static OkHttpClient provideOkHttpClient(NetworkEnvironment environment,
      AuthInterceptor authInterceptor, UnauthorizedInterceptor unauthorizedInterceptor) {
    return Preconditions.checkNotNullFromProvides(NetworkModule.INSTANCE.provideOkHttpClient(environment, authInterceptor, unauthorizedInterceptor));
  }
}
