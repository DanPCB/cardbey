package com.cardbey.android.core.auth.storage

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.authDataStore: DataStore<Preferences> by preferencesDataStore(name = "cardbey_auth")

@Singleton
class SecureTokenStorage @Inject constructor(
    @ApplicationContext private val context: Context,
) : TokenStorage {

    private val tokenKey = stringPreferencesKey("access_token")

    // Encrypted backup for migration — primary store is DataStore with app-private storage
    private val encryptedPrefs by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "cardbey_secure_tokens",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    override suspend fun getToken(): String? {
        val fromStore = context.authDataStore.data.map { it[tokenKey] }.first()
        if (!fromStore.isNullOrBlank()) return fromStore
        return encryptedPrefs.getString("access_token", null)
    }

    override suspend fun saveToken(token: String) {
        context.authDataStore.edit { it[tokenKey] = token }
        encryptedPrefs.edit().putString("access_token", token).apply()
    }

    override suspend fun clearToken() {
        context.authDataStore.edit { it.remove(tokenKey) }
        encryptedPrefs.edit().remove("access_token").apply()
    }
}
