package com.cardbey.android.core.network.interceptor;

import com.cardbey.android.core.network.auth.TokenProvider;
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
public final class AuthInterceptor_Factory implements Factory<AuthInterceptor> {
  private final Provider<TokenProvider> tokenProvider;

  public AuthInterceptor_Factory(Provider<TokenProvider> tokenProvider) {
    this.tokenProvider = tokenProvider;
  }

  @Override
  public AuthInterceptor get() {
    return newInstance(tokenProvider.get());
  }

  public static AuthInterceptor_Factory create(Provider<TokenProvider> tokenProvider) {
    return new AuthInterceptor_Factory(tokenProvider);
  }

  public static AuthInterceptor newInstance(TokenProvider tokenProvider) {
    return new AuthInterceptor(tokenProvider);
  }
}
