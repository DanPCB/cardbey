package com.cardbey.android.ui.screens.signin;

import com.cardbey.android.core.auth.AuthRepository;
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
public final class SignInViewModel_Factory implements Factory<SignInViewModel> {
  private final Provider<AuthRepository> authRepositoryProvider;

  public SignInViewModel_Factory(Provider<AuthRepository> authRepositoryProvider) {
    this.authRepositoryProvider = authRepositoryProvider;
  }

  @Override
  public SignInViewModel get() {
    return newInstance(authRepositoryProvider.get());
  }

  public static SignInViewModel_Factory create(Provider<AuthRepository> authRepositoryProvider) {
    return new SignInViewModel_Factory(authRepositoryProvider);
  }

  public static SignInViewModel newInstance(AuthRepository authRepository) {
    return new SignInViewModel(authRepository);
  }
}
