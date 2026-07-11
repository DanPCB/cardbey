package com.cardbey.android.core.designsystem.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Calm workspace palette — aligned with Cardbey web HSL primary (~222 47% 11%)
private val Primary = Color(0xFF1A2332)
private val OnPrimary = Color(0xFFF8FAFC)
private val PrimaryContainer = Color(0xFFE8EDF5)
private val OnPrimaryContainer = Color(0xFF0F172A)
private val Secondary = Color(0xFF475569)
private val Tertiary = Color(0xFF0D9488)
private val Error = Color(0xFFB91C1C)
private val Surface = Color(0xFFFAFAFA)
private val SurfaceDark = Color(0xFF0F172A)
private val Background = Color(0xFFFFFFFF)
private val BackgroundDark = Color(0xFF020617)

private val LightColors = lightColorScheme(
    primary = Primary,
    onPrimary = OnPrimary,
    primaryContainer = PrimaryContainer,
    onPrimaryContainer = OnPrimaryContainer,
    secondary = Secondary,
    tertiary = Tertiary,
    error = Error,
    background = Background,
    surface = Surface,
    onBackground = OnPrimaryContainer,
    onSurface = OnPrimaryContainer,
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFCBD5E1),
    onPrimary = Primary,
    primaryContainer = Color(0xFF1E293B),
    onPrimaryContainer = Color(0xFFF1F5F9),
    secondary = Color(0xFF94A3B8),
    tertiary = Color(0xFF2DD4BF),
    error = Color(0xFFF87171),
    background = BackgroundDark,
    surface = SurfaceDark,
    onBackground = Color(0xFFF1F5F9),
    onSurface = Color(0xFFF1F5F9),
)

@Composable
fun CardbeyTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = CardbeyTypography,
        content = content,
    )
}
