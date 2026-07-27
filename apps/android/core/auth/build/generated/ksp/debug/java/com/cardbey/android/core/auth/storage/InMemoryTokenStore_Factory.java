package com.cardbey.android.core.auth.storage;

import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
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
public final class InMemoryTokenStore_Factory implements Factory<InMemoryTokenStore> {
  @Override
  public InMemoryTokenStore get() {
    return newInstance();
  }

  public static InMemoryTokenStore_Factory create() {
    return InstanceHolder.INSTANCE;
  }

  public static InMemoryTokenStore newInstance() {
    return new InMemoryTokenStore();
  }

  private static final class InstanceHolder {
    private static final InMemoryTokenStore_Factory INSTANCE = new InMemoryTokenStore_Factory();
  }
}
