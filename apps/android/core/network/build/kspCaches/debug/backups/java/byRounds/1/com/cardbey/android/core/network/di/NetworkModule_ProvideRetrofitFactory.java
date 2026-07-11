package com.cardbey.android.core.network.di;

import com.cardbey.android.core.network.config.NetworkEnvironment;
import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.Preconditions;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import javax.annotation.processing.Generated;
import javax.inject.Provider;
import kotlinx.serialization.json.Json;
import okhttp3.OkHttpClient;
import retrofit2.Retrofit;

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
public final class NetworkModule_ProvideRetrofitFactory implements Factory<Retrofit> {
  private final Provider<NetworkEnvironment> environmentProvider;

  private final Provider<OkHttpClient> okHttpClientProvider;

  private final Provider<Json> jsonProvider;

  public NetworkModule_ProvideRetrofitFactory(Provider<NetworkEnvironment> environmentProvider,
      Provider<OkHttpClient> okHttpClientProvider, Provider<Json> jsonProvider) {
    this.environmentProvider = environmentProvider;
    this.okHttpClientProvider = okHttpClientProvider;
    this.jsonProvider = jsonProvider;
  }

  @Override
  public Retrofit get() {
    return provideRetrofit(environmentProvider.get(), okHttpClientProvider.get(), jsonProvider.get());
  }

  public static NetworkModule_ProvideRetrofitFactory create(
      Provider<NetworkEnvironment> environmentProvider, Provider<OkHttpClient> okHttpClientProvider,
      Provider<Json> jsonProvider) {
    return new NetworkModule_ProvideRetrofitFactory(environmentProvider, okHttpClientProvider, jsonProvider);
  }

  public static Retrofit provideRetrofit(NetworkEnvironment environment, OkHttpClient okHttpClient,
      Json json) {
    return Preconditions.checkNotNullFromProvides(NetworkModule.INSTANCE.provideRetrofit(environment, okHttpClient, json));
  }
}
