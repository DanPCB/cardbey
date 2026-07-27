package com.cardbey.android.core.auth;

import com.cardbey.android.core.auth.storage.InMemoryTokenStore;
import com.cardbey.android.core.auth.storage.TokenStorage;
import com.cardbey.android.core.network.api.CardbeyApi;
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
public final class AuthRepository_Factory implements Factory<AuthRepository> {
  private final Provider<CardbeyApi> apiProvider;

  private final Provider<TokenStorage> tokenStorageProvider;

  private final Provider<InMemoryTokenStore> inMemoryTokenStoreProvider;

  public AuthRepository_Factory(Provider<CardbeyApi> apiProvider,
      Provider<TokenStorage> tokenStorageProvider,
      Provider<InMemoryTokenStore> inMemoryTokenStoreProvider) {
    this.apiProvider = apiProvider;
    this.tokenStorageProvider = tokenStorageProvider;
    this.inMemoryTokenStoreProvider = inMemoryTokenStoreProvider;
  }

  @Override
  public AuthRepository get() {
    return newInstance(apiProvider.get(), tokenStorageProvider.get(), inMemoryTokenStoreProvider.get());
  }

  public static AuthRepository_Factory create(Provider<CardbeyApi> apiProvider,
      Provider<TokenStorage> tokenStorageProvider,
      Provider<InMemoryTokenStore> inMemoryTokenStoreProvider) {
    return new AuthRepository_Factory(apiProvider, tokenStorageProvider, inMemoryTokenStoreProvider);
  }

  public static AuthRepository newInstance(CardbeyApi api, TokenStorage tokenStorage,
      InMemoryTokenStore inMemoryTokenStore) {
    return new AuthRepository(api, tokenStorage, inMemoryTokenStore);
  }
}
