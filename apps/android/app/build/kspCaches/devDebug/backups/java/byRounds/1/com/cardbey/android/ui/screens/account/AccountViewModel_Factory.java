package com.cardbey.android.ui.screens.account;

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
public final class AccountViewModel_Factory implements Factory<AccountViewModel> {
  private final Provider<AuthRepository> authRepositoryProvider;

  public AccountViewModel_Factory(Provider<AuthRepository> authRepositoryProvider) {
    this.authRepositoryProvider = authRepositoryProvider;
  }

  @Override
  public AccountViewModel get() {
    return newInstance(authRepositoryProvider.get());
  }

  public static AccountViewModel_Factory create(Provider<AuthRepository> authRepositoryProvider) {
    return new AccountViewModel_Factory(authRepositoryProvider);
  }

  public static AccountViewModel newInstance(AuthRepository authRepository) {
    return new AccountViewModel(authRepository);
  }
}
