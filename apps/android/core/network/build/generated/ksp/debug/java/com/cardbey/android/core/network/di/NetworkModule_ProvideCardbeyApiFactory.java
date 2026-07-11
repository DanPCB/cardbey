package com.cardbey.android.core.network.di;

import com.cardbey.android.core.network.api.CardbeyApi;
import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.Preconditions;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import javax.annotation.processing.Generated;
import javax.inject.Provider;
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
public final class NetworkModule_ProvideCardbeyApiFactory implements Factory<CardbeyApi> {
  private final Provider<Retrofit> retrofitProvider;

  public NetworkModule_ProvideCardbeyApiFactory(Provider<Retrofit> retrofitProvider) {
    this.retrofitProvider = retrofitProvider;
  }

  @Override
  public CardbeyApi get() {
    return provideCardbeyApi(retrofitProvider.get());
  }

  public static NetworkModule_ProvideCardbeyApiFactory create(Provider<Retrofit> retrofitProvider) {
    return new NetworkModule_ProvideCardbeyApiFactory(retrofitProvider);
  }

  public static CardbeyApi provideCardbeyApi(Retrofit retrofit) {
    return Preconditions.checkNotNullFromProvides(NetworkModule.INSTANCE.provideCardbeyApi(retrofit));
  }
}
