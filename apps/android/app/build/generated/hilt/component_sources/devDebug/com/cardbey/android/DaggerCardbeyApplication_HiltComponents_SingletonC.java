package com.cardbey.android;

import android.app.Activity;
import android.app.Service;
import android.view.View;
import androidx.fragment.app.Fragment;
import androidx.lifecycle.SavedStateHandle;
import androidx.lifecycle.ViewModel;
import com.cardbey.android.core.auth.AuthRepository;
import com.cardbey.android.core.auth.storage.InMemoryTokenStore;
import com.cardbey.android.core.auth.storage.SecureTokenStorage;
import com.cardbey.android.core.network.api.CardbeyApi;
import com.cardbey.android.core.network.config.NetworkEnvironment;
import com.cardbey.android.core.network.connectivity.AndroidConnectivityMonitor;
import com.cardbey.android.core.network.connectivity.ConnectivityMonitor;
import com.cardbey.android.core.network.di.NetworkModule_ProvideCardbeyApiFactory;
import com.cardbey.android.core.network.di.NetworkModule_ProvideConnectivityMonitorFactory;
import com.cardbey.android.core.network.di.NetworkModule_ProvideJsonFactory;
import com.cardbey.android.core.network.di.NetworkModule_ProvideOkHttpClientFactory;
import com.cardbey.android.core.network.di.NetworkModule_ProvideRetrofitFactory;
import com.cardbey.android.core.network.interceptor.AuthInterceptor;
import com.cardbey.android.core.network.interceptor.UnauthorizedInterceptor;
import com.cardbey.android.core.network.repository.HealthRepository;
import com.cardbey.android.di.AppModule_ProvideNetworkEnvironmentFactory;
import com.cardbey.android.ui.screens.account.AccountViewModel;
import com.cardbey.android.ui.screens.account.AccountViewModel_HiltModules;
import com.cardbey.android.ui.screens.developer.DeveloperViewModel;
import com.cardbey.android.ui.screens.developer.DeveloperViewModel_HiltModules;
import com.cardbey.android.ui.screens.signin.SignInViewModel;
import com.cardbey.android.ui.screens.signin.SignInViewModel_HiltModules;
import com.cardbey.android.ui.shell.AppShellViewModel;
import com.cardbey.android.ui.shell.AppShellViewModel_HiltModules;
import dagger.hilt.android.ActivityRetainedLifecycle;
import dagger.hilt.android.ViewModelLifecycle;
import dagger.hilt.android.internal.builders.ActivityComponentBuilder;
import dagger.hilt.android.internal.builders.ActivityRetainedComponentBuilder;
import dagger.hilt.android.internal.builders.FragmentComponentBuilder;
import dagger.hilt.android.internal.builders.ServiceComponentBuilder;
import dagger.hilt.android.internal.builders.ViewComponentBuilder;
import dagger.hilt.android.internal.builders.ViewModelComponentBuilder;
import dagger.hilt.android.internal.builders.ViewWithFragmentComponentBuilder;
import dagger.hilt.android.internal.lifecycle.DefaultViewModelFactories;
import dagger.hilt.android.internal.lifecycle.DefaultViewModelFactories_InternalFactoryFactory_Factory;
import dagger.hilt.android.internal.managers.ActivityRetainedComponentManager_LifecycleModule_ProvideActivityRetainedLifecycleFactory;
import dagger.hilt.android.internal.managers.SavedStateHandleHolder;
import dagger.hilt.android.internal.modules.ApplicationContextModule;
import dagger.hilt.android.internal.modules.ApplicationContextModule_ProvideContextFactory;
import dagger.internal.DaggerGenerated;
import dagger.internal.DoubleCheck;
import dagger.internal.IdentifierNameString;
import dagger.internal.KeepFieldType;
import dagger.internal.LazyClassKeyMap;
import dagger.internal.MapBuilder;
import dagger.internal.Preconditions;
import dagger.internal.Provider;
import java.util.Collections;
import java.util.Map;
import java.util.Set;
import javax.annotation.processing.Generated;
import kotlinx.serialization.json.Json;
import okhttp3.OkHttpClient;
import retrofit2.Retrofit;

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
public final class DaggerCardbeyApplication_HiltComponents_SingletonC {
  private DaggerCardbeyApplication_HiltComponents_SingletonC() {
  }

  public static Builder builder() {
    return new Builder();
  }

  public static final class Builder {
    private ApplicationContextModule applicationContextModule;

    private Builder() {
    }

    public Builder applicationContextModule(ApplicationContextModule applicationContextModule) {
      this.applicationContextModule = Preconditions.checkNotNull(applicationContextModule);
      return this;
    }

    public CardbeyApplication_HiltComponents.SingletonC build() {
      Preconditions.checkBuilderRequirement(applicationContextModule, ApplicationContextModule.class);
      return new SingletonCImpl(applicationContextModule);
    }
  }

  private static final class ActivityRetainedCBuilder implements CardbeyApplication_HiltComponents.ActivityRetainedC.Builder {
    private final SingletonCImpl singletonCImpl;

    private SavedStateHandleHolder savedStateHandleHolder;

    private ActivityRetainedCBuilder(SingletonCImpl singletonCImpl) {
      this.singletonCImpl = singletonCImpl;
    }

    @Override
    public ActivityRetainedCBuilder savedStateHandleHolder(
        SavedStateHandleHolder savedStateHandleHolder) {
      this.savedStateHandleHolder = Preconditions.checkNotNull(savedStateHandleHolder);
      return this;
    }

    @Override
    public CardbeyApplication_HiltComponents.ActivityRetainedC build() {
      Preconditions.checkBuilderRequirement(savedStateHandleHolder, SavedStateHandleHolder.class);
      return new ActivityRetainedCImpl(singletonCImpl, savedStateHandleHolder);
    }
  }

  private static final class ActivityCBuilder implements CardbeyApplication_HiltComponents.ActivityC.Builder {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private Activity activity;

    private ActivityCBuilder(SingletonCImpl singletonCImpl,
        ActivityRetainedCImpl activityRetainedCImpl) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
    }

    @Override
    public ActivityCBuilder activity(Activity activity) {
      this.activity = Preconditions.checkNotNull(activity);
      return this;
    }

    @Override
    public CardbeyApplication_HiltComponents.ActivityC build() {
      Preconditions.checkBuilderRequirement(activity, Activity.class);
      return new ActivityCImpl(singletonCImpl, activityRetainedCImpl, activity);
    }
  }

  private static final class FragmentCBuilder implements CardbeyApplication_HiltComponents.FragmentC.Builder {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ActivityCImpl activityCImpl;

    private Fragment fragment;

    private FragmentCBuilder(SingletonCImpl singletonCImpl,
        ActivityRetainedCImpl activityRetainedCImpl, ActivityCImpl activityCImpl) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
      this.activityCImpl = activityCImpl;
    }

    @Override
    public FragmentCBuilder fragment(Fragment fragment) {
      this.fragment = Preconditions.checkNotNull(fragment);
      return this;
    }

    @Override
    public CardbeyApplication_HiltComponents.FragmentC build() {
      Preconditions.checkBuilderRequirement(fragment, Fragment.class);
      return new FragmentCImpl(singletonCImpl, activityRetainedCImpl, activityCImpl, fragment);
    }
  }

  private static final class ViewWithFragmentCBuilder implements CardbeyApplication_HiltComponents.ViewWithFragmentC.Builder {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ActivityCImpl activityCImpl;

    private final FragmentCImpl fragmentCImpl;

    private View view;

    private ViewWithFragmentCBuilder(SingletonCImpl singletonCImpl,
        ActivityRetainedCImpl activityRetainedCImpl, ActivityCImpl activityCImpl,
        FragmentCImpl fragmentCImpl) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
      this.activityCImpl = activityCImpl;
      this.fragmentCImpl = fragmentCImpl;
    }

    @Override
    public ViewWithFragmentCBuilder view(View view) {
      this.view = Preconditions.checkNotNull(view);
      return this;
    }

    @Override
    public CardbeyApplication_HiltComponents.ViewWithFragmentC build() {
      Preconditions.checkBuilderRequirement(view, View.class);
      return new ViewWithFragmentCImpl(singletonCImpl, activityRetainedCImpl, activityCImpl, fragmentCImpl, view);
    }
  }

  private static final class ViewCBuilder implements CardbeyApplication_HiltComponents.ViewC.Builder {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ActivityCImpl activityCImpl;

    private View view;

    private ViewCBuilder(SingletonCImpl singletonCImpl, ActivityRetainedCImpl activityRetainedCImpl,
        ActivityCImpl activityCImpl) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
      this.activityCImpl = activityCImpl;
    }

    @Override
    public ViewCBuilder view(View view) {
      this.view = Preconditions.checkNotNull(view);
      return this;
    }

    @Override
    public CardbeyApplication_HiltComponents.ViewC build() {
      Preconditions.checkBuilderRequirement(view, View.class);
      return new ViewCImpl(singletonCImpl, activityRetainedCImpl, activityCImpl, view);
    }
  }

  private static final class ViewModelCBuilder implements CardbeyApplication_HiltComponents.ViewModelC.Builder {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private SavedStateHandle savedStateHandle;

    private ViewModelLifecycle viewModelLifecycle;

    private ViewModelCBuilder(SingletonCImpl singletonCImpl,
        ActivityRetainedCImpl activityRetainedCImpl) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
    }

    @Override
    public ViewModelCBuilder savedStateHandle(SavedStateHandle handle) {
      this.savedStateHandle = Preconditions.checkNotNull(handle);
      return this;
    }

    @Override
    public ViewModelCBuilder viewModelLifecycle(ViewModelLifecycle viewModelLifecycle) {
      this.viewModelLifecycle = Preconditions.checkNotNull(viewModelLifecycle);
      return this;
    }

    @Override
    public CardbeyApplication_HiltComponents.ViewModelC build() {
      Preconditions.checkBuilderRequirement(savedStateHandle, SavedStateHandle.class);
      Preconditions.checkBuilderRequirement(viewModelLifecycle, ViewModelLifecycle.class);
      return new ViewModelCImpl(singletonCImpl, activityRetainedCImpl, savedStateHandle, viewModelLifecycle);
    }
  }

  private static final class ServiceCBuilder implements CardbeyApplication_HiltComponents.ServiceC.Builder {
    private final SingletonCImpl singletonCImpl;

    private Service service;

    private ServiceCBuilder(SingletonCImpl singletonCImpl) {
      this.singletonCImpl = singletonCImpl;
    }

    @Override
    public ServiceCBuilder service(Service service) {
      this.service = Preconditions.checkNotNull(service);
      return this;
    }

    @Override
    public CardbeyApplication_HiltComponents.ServiceC build() {
      Preconditions.checkBuilderRequirement(service, Service.class);
      return new ServiceCImpl(singletonCImpl, service);
    }
  }

  private static final class ViewWithFragmentCImpl extends CardbeyApplication_HiltComponents.ViewWithFragmentC {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ActivityCImpl activityCImpl;

    private final FragmentCImpl fragmentCImpl;

    private final ViewWithFragmentCImpl viewWithFragmentCImpl = this;

    private ViewWithFragmentCImpl(SingletonCImpl singletonCImpl,
        ActivityRetainedCImpl activityRetainedCImpl, ActivityCImpl activityCImpl,
        FragmentCImpl fragmentCImpl, View viewParam) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
      this.activityCImpl = activityCImpl;
      this.fragmentCImpl = fragmentCImpl;


    }
  }

  private static final class FragmentCImpl extends CardbeyApplication_HiltComponents.FragmentC {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ActivityCImpl activityCImpl;

    private final FragmentCImpl fragmentCImpl = this;

    private FragmentCImpl(SingletonCImpl singletonCImpl,
        ActivityRetainedCImpl activityRetainedCImpl, ActivityCImpl activityCImpl,
        Fragment fragmentParam) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
      this.activityCImpl = activityCImpl;


    }

    @Override
    public DefaultViewModelFactories.InternalFactoryFactory getHiltInternalFactoryFactory() {
      return activityCImpl.getHiltInternalFactoryFactory();
    }

    @Override
    public ViewWithFragmentComponentBuilder viewWithFragmentComponentBuilder() {
      return new ViewWithFragmentCBuilder(singletonCImpl, activityRetainedCImpl, activityCImpl, fragmentCImpl);
    }
  }

  private static final class ViewCImpl extends CardbeyApplication_HiltComponents.ViewC {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ActivityCImpl activityCImpl;

    private final ViewCImpl viewCImpl = this;

    private ViewCImpl(SingletonCImpl singletonCImpl, ActivityRetainedCImpl activityRetainedCImpl,
        ActivityCImpl activityCImpl, View viewParam) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
      this.activityCImpl = activityCImpl;


    }
  }

  private static final class ActivityCImpl extends CardbeyApplication_HiltComponents.ActivityC {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ActivityCImpl activityCImpl = this;

    private ActivityCImpl(SingletonCImpl singletonCImpl,
        ActivityRetainedCImpl activityRetainedCImpl, Activity activityParam) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;


    }

    @Override
    public void injectMainActivity(MainActivity arg0) {
    }

    @Override
    public DefaultViewModelFactories.InternalFactoryFactory getHiltInternalFactoryFactory() {
      return DefaultViewModelFactories_InternalFactoryFactory_Factory.newInstance(getViewModelKeys(), new ViewModelCBuilder(singletonCImpl, activityRetainedCImpl));
    }

    @Override
    public Map<Class<?>, Boolean> getViewModelKeys() {
      return LazyClassKeyMap.<Boolean>of(MapBuilder.<String, Boolean>newMapBuilder(4).put(LazyClassKeyProvider.com_cardbey_android_ui_screens_account_AccountViewModel, AccountViewModel_HiltModules.KeyModule.provide()).put(LazyClassKeyProvider.com_cardbey_android_ui_shell_AppShellViewModel, AppShellViewModel_HiltModules.KeyModule.provide()).put(LazyClassKeyProvider.com_cardbey_android_ui_screens_developer_DeveloperViewModel, DeveloperViewModel_HiltModules.KeyModule.provide()).put(LazyClassKeyProvider.com_cardbey_android_ui_screens_signin_SignInViewModel, SignInViewModel_HiltModules.KeyModule.provide()).build());
    }

    @Override
    public ViewModelComponentBuilder getViewModelComponentBuilder() {
      return new ViewModelCBuilder(singletonCImpl, activityRetainedCImpl);
    }

    @Override
    public FragmentComponentBuilder fragmentComponentBuilder() {
      return new FragmentCBuilder(singletonCImpl, activityRetainedCImpl, activityCImpl);
    }

    @Override
    public ViewComponentBuilder viewComponentBuilder() {
      return new ViewCBuilder(singletonCImpl, activityRetainedCImpl, activityCImpl);
    }

    @IdentifierNameString
    private static final class LazyClassKeyProvider {
      static String com_cardbey_android_ui_screens_developer_DeveloperViewModel = "com.cardbey.android.ui.screens.developer.DeveloperViewModel";

      static String com_cardbey_android_ui_screens_signin_SignInViewModel = "com.cardbey.android.ui.screens.signin.SignInViewModel";

      static String com_cardbey_android_ui_shell_AppShellViewModel = "com.cardbey.android.ui.shell.AppShellViewModel";

      static String com_cardbey_android_ui_screens_account_AccountViewModel = "com.cardbey.android.ui.screens.account.AccountViewModel";

      @KeepFieldType
      DeveloperViewModel com_cardbey_android_ui_screens_developer_DeveloperViewModel2;

      @KeepFieldType
      SignInViewModel com_cardbey_android_ui_screens_signin_SignInViewModel2;

      @KeepFieldType
      AppShellViewModel com_cardbey_android_ui_shell_AppShellViewModel2;

      @KeepFieldType
      AccountViewModel com_cardbey_android_ui_screens_account_AccountViewModel2;
    }
  }

  private static final class ViewModelCImpl extends CardbeyApplication_HiltComponents.ViewModelC {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ViewModelCImpl viewModelCImpl = this;

    private Provider<AccountViewModel> accountViewModelProvider;

    private Provider<AppShellViewModel> appShellViewModelProvider;

    private Provider<DeveloperViewModel> developerViewModelProvider;

    private Provider<SignInViewModel> signInViewModelProvider;

    private ViewModelCImpl(SingletonCImpl singletonCImpl,
        ActivityRetainedCImpl activityRetainedCImpl, SavedStateHandle savedStateHandleParam,
        ViewModelLifecycle viewModelLifecycleParam) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;

      initialize(savedStateHandleParam, viewModelLifecycleParam);

    }

    @SuppressWarnings("unchecked")
    private void initialize(final SavedStateHandle savedStateHandleParam,
        final ViewModelLifecycle viewModelLifecycleParam) {
      this.accountViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 0);
      this.appShellViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 1);
      this.developerViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 2);
      this.signInViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 3);
    }

    @Override
    public Map<Class<?>, javax.inject.Provider<ViewModel>> getHiltViewModelMap() {
      return LazyClassKeyMap.<javax.inject.Provider<ViewModel>>of(MapBuilder.<String, javax.inject.Provider<ViewModel>>newMapBuilder(4).put(LazyClassKeyProvider.com_cardbey_android_ui_screens_account_AccountViewModel, ((Provider) accountViewModelProvider)).put(LazyClassKeyProvider.com_cardbey_android_ui_shell_AppShellViewModel, ((Provider) appShellViewModelProvider)).put(LazyClassKeyProvider.com_cardbey_android_ui_screens_developer_DeveloperViewModel, ((Provider) developerViewModelProvider)).put(LazyClassKeyProvider.com_cardbey_android_ui_screens_signin_SignInViewModel, ((Provider) signInViewModelProvider)).build());
    }

    @Override
    public Map<Class<?>, Object> getHiltViewModelAssistedMap() {
      return Collections.<Class<?>, Object>emptyMap();
    }

    @IdentifierNameString
    private static final class LazyClassKeyProvider {
      static String com_cardbey_android_ui_shell_AppShellViewModel = "com.cardbey.android.ui.shell.AppShellViewModel";

      static String com_cardbey_android_ui_screens_developer_DeveloperViewModel = "com.cardbey.android.ui.screens.developer.DeveloperViewModel";

      static String com_cardbey_android_ui_screens_account_AccountViewModel = "com.cardbey.android.ui.screens.account.AccountViewModel";

      static String com_cardbey_android_ui_screens_signin_SignInViewModel = "com.cardbey.android.ui.screens.signin.SignInViewModel";

      @KeepFieldType
      AppShellViewModel com_cardbey_android_ui_shell_AppShellViewModel2;

      @KeepFieldType
      DeveloperViewModel com_cardbey_android_ui_screens_developer_DeveloperViewModel2;

      @KeepFieldType
      AccountViewModel com_cardbey_android_ui_screens_account_AccountViewModel2;

      @KeepFieldType
      SignInViewModel com_cardbey_android_ui_screens_signin_SignInViewModel2;
    }

    private static final class SwitchingProvider<T> implements Provider<T> {
      private final SingletonCImpl singletonCImpl;

      private final ActivityRetainedCImpl activityRetainedCImpl;

      private final ViewModelCImpl viewModelCImpl;

      private final int id;

      SwitchingProvider(SingletonCImpl singletonCImpl, ActivityRetainedCImpl activityRetainedCImpl,
          ViewModelCImpl viewModelCImpl, int id) {
        this.singletonCImpl = singletonCImpl;
        this.activityRetainedCImpl = activityRetainedCImpl;
        this.viewModelCImpl = viewModelCImpl;
        this.id = id;
      }

      @SuppressWarnings("unchecked")
      @Override
      public T get() {
        switch (id) {
          case 0: // com.cardbey.android.ui.screens.account.AccountViewModel 
          return (T) new AccountViewModel(singletonCImpl.authRepositoryProvider.get());

          case 1: // com.cardbey.android.ui.shell.AppShellViewModel 
          return (T) new AppShellViewModel(singletonCImpl.authRepositoryProvider.get(), singletonCImpl.provideConnectivityMonitorProvider.get());

          case 2: // com.cardbey.android.ui.screens.developer.DeveloperViewModel 
          return (T) new DeveloperViewModel(singletonCImpl.authRepositoryProvider.get(), singletonCImpl.provideConnectivityMonitorProvider.get(), singletonCImpl.healthRepositoryProvider.get());

          case 3: // com.cardbey.android.ui.screens.signin.SignInViewModel 
          return (T) new SignInViewModel(singletonCImpl.authRepositoryProvider.get());

          default: throw new AssertionError(id);
        }
      }
    }
  }

  private static final class ActivityRetainedCImpl extends CardbeyApplication_HiltComponents.ActivityRetainedC {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl = this;

    private Provider<ActivityRetainedLifecycle> provideActivityRetainedLifecycleProvider;

    private ActivityRetainedCImpl(SingletonCImpl singletonCImpl,
        SavedStateHandleHolder savedStateHandleHolderParam) {
      this.singletonCImpl = singletonCImpl;

      initialize(savedStateHandleHolderParam);

    }

    @SuppressWarnings("unchecked")
    private void initialize(final SavedStateHandleHolder savedStateHandleHolderParam) {
      this.provideActivityRetainedLifecycleProvider = DoubleCheck.provider(new SwitchingProvider<ActivityRetainedLifecycle>(singletonCImpl, activityRetainedCImpl, 0));
    }

    @Override
    public ActivityComponentBuilder activityComponentBuilder() {
      return new ActivityCBuilder(singletonCImpl, activityRetainedCImpl);
    }

    @Override
    public ActivityRetainedLifecycle getActivityRetainedLifecycle() {
      return provideActivityRetainedLifecycleProvider.get();
    }

    private static final class SwitchingProvider<T> implements Provider<T> {
      private final SingletonCImpl singletonCImpl;

      private final ActivityRetainedCImpl activityRetainedCImpl;

      private final int id;

      SwitchingProvider(SingletonCImpl singletonCImpl, ActivityRetainedCImpl activityRetainedCImpl,
          int id) {
        this.singletonCImpl = singletonCImpl;
        this.activityRetainedCImpl = activityRetainedCImpl;
        this.id = id;
      }

      @SuppressWarnings("unchecked")
      @Override
      public T get() {
        switch (id) {
          case 0: // dagger.hilt.android.ActivityRetainedLifecycle 
          return (T) ActivityRetainedComponentManager_LifecycleModule_ProvideActivityRetainedLifecycleFactory.provideActivityRetainedLifecycle();

          default: throw new AssertionError(id);
        }
      }
    }
  }

  private static final class ServiceCImpl extends CardbeyApplication_HiltComponents.ServiceC {
    private final SingletonCImpl singletonCImpl;

    private final ServiceCImpl serviceCImpl = this;

    private ServiceCImpl(SingletonCImpl singletonCImpl, Service serviceParam) {
      this.singletonCImpl = singletonCImpl;


    }
  }

  private static final class SingletonCImpl extends CardbeyApplication_HiltComponents.SingletonC {
    private final ApplicationContextModule applicationContextModule;

    private final SingletonCImpl singletonCImpl = this;

    private Provider<NetworkEnvironment> provideNetworkEnvironmentProvider;

    private Provider<InMemoryTokenStore> inMemoryTokenStoreProvider;

    private Provider<OkHttpClient> provideOkHttpClientProvider;

    private Provider<Json> provideJsonProvider;

    private Provider<Retrofit> provideRetrofitProvider;

    private Provider<CardbeyApi> provideCardbeyApiProvider;

    private Provider<SecureTokenStorage> secureTokenStorageProvider;

    private Provider<AuthRepository> authRepositoryProvider;

    private Provider<AndroidConnectivityMonitor> androidConnectivityMonitorProvider;

    private Provider<ConnectivityMonitor> provideConnectivityMonitorProvider;

    private Provider<HealthRepository> healthRepositoryProvider;

    private SingletonCImpl(ApplicationContextModule applicationContextModuleParam) {
      this.applicationContextModule = applicationContextModuleParam;
      initialize(applicationContextModuleParam);

    }

    private AuthInterceptor authInterceptor() {
      return new AuthInterceptor(inMemoryTokenStoreProvider.get());
    }

    private UnauthorizedInterceptor unauthorizedInterceptor() {
      return new UnauthorizedInterceptor(inMemoryTokenStoreProvider.get());
    }

    @SuppressWarnings("unchecked")
    private void initialize(final ApplicationContextModule applicationContextModuleParam) {
      this.provideNetworkEnvironmentProvider = DoubleCheck.provider(new SwitchingProvider<NetworkEnvironment>(singletonCImpl, 3));
      this.inMemoryTokenStoreProvider = DoubleCheck.provider(new SwitchingProvider<InMemoryTokenStore>(singletonCImpl, 5));
      this.provideOkHttpClientProvider = DoubleCheck.provider(new SwitchingProvider<OkHttpClient>(singletonCImpl, 4));
      this.provideJsonProvider = DoubleCheck.provider(new SwitchingProvider<Json>(singletonCImpl, 6));
      this.provideRetrofitProvider = DoubleCheck.provider(new SwitchingProvider<Retrofit>(singletonCImpl, 2));
      this.provideCardbeyApiProvider = DoubleCheck.provider(new SwitchingProvider<CardbeyApi>(singletonCImpl, 1));
      this.secureTokenStorageProvider = DoubleCheck.provider(new SwitchingProvider<SecureTokenStorage>(singletonCImpl, 7));
      this.authRepositoryProvider = DoubleCheck.provider(new SwitchingProvider<AuthRepository>(singletonCImpl, 0));
      this.androidConnectivityMonitorProvider = DoubleCheck.provider(new SwitchingProvider<AndroidConnectivityMonitor>(singletonCImpl, 9));
      this.provideConnectivityMonitorProvider = DoubleCheck.provider(new SwitchingProvider<ConnectivityMonitor>(singletonCImpl, 8));
      this.healthRepositoryProvider = DoubleCheck.provider(new SwitchingProvider<HealthRepository>(singletonCImpl, 10));
    }

    @Override
    public void injectCardbeyApplication(CardbeyApplication arg0) {
    }

    @Override
    public Set<Boolean> getDisableFragmentGetContextFix() {
      return Collections.<Boolean>emptySet();
    }

    @Override
    public ActivityRetainedComponentBuilder retainedComponentBuilder() {
      return new ActivityRetainedCBuilder(singletonCImpl);
    }

    @Override
    public ServiceComponentBuilder serviceComponentBuilder() {
      return new ServiceCBuilder(singletonCImpl);
    }

    private static final class SwitchingProvider<T> implements Provider<T> {
      private final SingletonCImpl singletonCImpl;

      private final int id;

      SwitchingProvider(SingletonCImpl singletonCImpl, int id) {
        this.singletonCImpl = singletonCImpl;
        this.id = id;
      }

      @SuppressWarnings("unchecked")
      @Override
      public T get() {
        switch (id) {
          case 0: // com.cardbey.android.core.auth.AuthRepository 
          return (T) new AuthRepository(singletonCImpl.provideCardbeyApiProvider.get(), singletonCImpl.secureTokenStorageProvider.get(), singletonCImpl.inMemoryTokenStoreProvider.get());

          case 1: // com.cardbey.android.core.network.api.CardbeyApi 
          return (T) NetworkModule_ProvideCardbeyApiFactory.provideCardbeyApi(singletonCImpl.provideRetrofitProvider.get());

          case 2: // retrofit2.Retrofit 
          return (T) NetworkModule_ProvideRetrofitFactory.provideRetrofit(singletonCImpl.provideNetworkEnvironmentProvider.get(), singletonCImpl.provideOkHttpClientProvider.get(), singletonCImpl.provideJsonProvider.get());

          case 3: // com.cardbey.android.core.network.config.NetworkEnvironment 
          return (T) AppModule_ProvideNetworkEnvironmentFactory.provideNetworkEnvironment();

          case 4: // okhttp3.OkHttpClient 
          return (T) NetworkModule_ProvideOkHttpClientFactory.provideOkHttpClient(singletonCImpl.provideNetworkEnvironmentProvider.get(), singletonCImpl.authInterceptor(), singletonCImpl.unauthorizedInterceptor());

          case 5: // com.cardbey.android.core.auth.storage.InMemoryTokenStore 
          return (T) new InMemoryTokenStore();

          case 6: // kotlinx.serialization.json.Json 
          return (T) NetworkModule_ProvideJsonFactory.provideJson();

          case 7: // com.cardbey.android.core.auth.storage.SecureTokenStorage 
          return (T) new SecureTokenStorage(ApplicationContextModule_ProvideContextFactory.provideContext(singletonCImpl.applicationContextModule));

          case 8: // com.cardbey.android.core.network.connectivity.ConnectivityMonitor 
          return (T) NetworkModule_ProvideConnectivityMonitorFactory.provideConnectivityMonitor(singletonCImpl.androidConnectivityMonitorProvider.get());

          case 9: // com.cardbey.android.core.network.connectivity.AndroidConnectivityMonitor 
          return (T) new AndroidConnectivityMonitor(ApplicationContextModule_ProvideContextFactory.provideContext(singletonCImpl.applicationContextModule));

          case 10: // com.cardbey.android.core.network.repository.HealthRepository 
          return (T) new HealthRepository(singletonCImpl.provideCardbeyApiProvider.get(), singletonCImpl.provideConnectivityMonitorProvider.get());

          default: throw new AssertionError(id);
        }
      }
    }
  }
}
