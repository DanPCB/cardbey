package com.cardbey.android.core.network.interceptor;

import com.cardbey.android.core.network.auth.SessionInvalidator;
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
public final class UnauthorizedInterceptor_Factory implements Factory<UnauthorizedInterceptor> {
  private final Provider<SessionInvalidator> sessionInvalidatorProvider;

  public UnauthorizedInterceptor_Factory(Provider<SessionInvalidator> sessionInvalidatorProvider) {
    this.sessionInvalidatorProvider = sessionInvalidatorProvider;
  }

  @Override
  public UnauthorizedInterceptor get() {
    return newInstance(sessionInvalidatorProvider.get());
  }

  public static UnauthorizedInterceptor_Factory create(
      Provider<SessionInvalidator> sessionInvalidatorProvider) {
    return new UnauthorizedInterceptor_Factory(sessionInvalidatorProvider);
  }

  public static UnauthorizedInterceptor newInstance(SessionInvalidator sessionInvalidator) {
    return new UnauthorizedInterceptor(sessionInvalidator);
  }
}
