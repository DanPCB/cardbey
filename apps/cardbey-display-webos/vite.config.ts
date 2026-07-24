import { defineConfig, loadEnv, type Plugin } from 'vite';

const BUILD_ID = new Date().toISOString().replace(/[:.]/g, '-');

/**
 * webOS packaged apps load from a local app filesystem origin.
 * type="module" scripts often fail there (CORS / opaque origin), while
 * classic scripts succeed. Rewrite the production entry accordingly.
 *
 * Compatibility notes for this TV (Chrome/68.0.3440.106):
 * - Syntax target: chrome68 (esbuild)
 * - Forced classic (non-module) entry script for packaged file origin
 * - Polyfill banner: globalThis only (missing until Chrome 71)
 * - Not using @vitejs/plugin-legacy: Chrome 68 supports modules, so it would
 *   prefer modern chunks and skip nomodule fallbacks.
 */
function cardbeyClassicEntryPlugin(): Plugin {
  return {
    name: 'cardbey-classic-entry',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const withoutPreload = html.replace(
          /<link[^>]+rel=["']modulepreload["'][^>]*>\s*/gi,
          '',
        );

        const rewritten = withoutPreload.replace(
          /<script\b([^>]*?)\bsrc=(["'])([^"']+)\2([^>]*)>\s*<\/script>/gi,
          (full, pre, quote, src, post) => {
            const attrs = String(pre) + String(post);
            const isModule = /\btype\s*=\s*["']module["']/i.test(attrs);
            const isAssetJs = /assets\/.+\.js(\?|$)/i.test(src) || /\.js(\?|$)/i.test(src);
            if (!isModule && !/\bcrossorigin\b/i.test(attrs)) {
              return full;
            }
            if (!isAssetJs) return full;

            console.log('[cardbey-classic-entry] classic script:', src);
            return (
              '<script>\n' +
              "if (window.__cardbeyBootStage) {\n" +
              "  window.__cardbeyBootStage('ENTRY_SCRIPT_REQUESTED', " +
              JSON.stringify(src) +
              ');\n' +
              '}\n' +
              '</script>\n' +
              '<script src=' +
              quote +
              src +
              quote +
              '\n' +
              "  onload=\"window.__cardbeyBootStage && window.__cardbeyBootStage('ENTRY_SCRIPT_LOADED', this.src)\"\n" +
              "  onerror=\"window.__cardbeyBootStage && window.__cardbeyBootStage('ENTRY_SCRIPT_ERROR', this.src || 'unknown')\">\n" +
              '</script>'
            );
          },
        );

        return rewritten.replace('<!--CARDBEY_ENTRY_SCRIPT-->', '');
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiBaseUrl = (env.VITE_API_BASE_URL || '').trim();
  const dashboardBaseUrl = (env.VITE_DASHBOARD_BASE_URL || '').trim();
  const isProd = mode === 'production';
  const minimalBoot = env.VITE_MINIMAL_BOOT === 'true';

  if (isProd && !apiBaseUrl) {
    throw new Error(
      '[cardbey-display-webos] Production build requires VITE_API_BASE_URL (set in .env.production.local).',
    );
  }
  if (isProd && /localhost|127\.0\.0\.1/i.test(apiBaseUrl)) {
    throw new Error(
      '[cardbey-display-webos] Production build must not use localhost API URL.',
    );
  }

  const injectedConfig = {
    apiBaseUrl: apiBaseUrl || 'https://cardbey-core-staging.onrender.com',
    dashboardBaseUrl:
      dashboardBaseUrl || 'https://cardbey-dashboard-staging.onrender.com',
    allowInsecureLocalHttp: env.VITE_ALLOW_INSECURE_LOCAL_HTTP === 'true',
    appVersion: '0.1.0',
    buildId: BUILD_ID,
    featureFlags: {
      enablePairing: env.VITE_ENABLE_PAIRING === 'true',
      enablePlayback: env.VITE_ENABLE_PLAYBACK === 'true',
      enableOfflineCache: false,
      enableTelemetryUpload: false,
      enableDiagnosticsOverlay: true,
      useFixtureTransport: false,
    },
  };

  return {
    base: './',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      target: 'chrome68',
      sourcemap: true,
      assetsInlineLimit: 0,
      cssTarget: 'chrome68',
      modulePreload: false,
      cssCodeSplit: false,
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
          banner:
            ';(function(){if(typeof globalThis==="undefined"){window.globalThis=window;}})();',
        },
      },
    },
    define: {
      __CARDBEY_BUILD_ID__: JSON.stringify(BUILD_ID),
      __CARDBEY_APP_VERSION__: JSON.stringify('0.1.0'),
    },
    plugins: [
      {
        name: 'cardbey-minimal-entry-swap',
        transformIndexHtml(html) {
          if (!minimalBoot) return html;
          return html.replace(
            /src=["']\/src\/main\.ts["']/,
            'src="/src/minimalBoot.ts"',
          );
        },
      },
      {
        name: 'cardbey-inject-boot-config',
        transformIndexHtml(html) {
          const configScript =
            '<script>\n' +
            'window.__CARDBEY_DISPLAY_CONFIG__ = ' +
            JSON.stringify(injectedConfig) +
            ';\n' +
            'window.__CARDBEY_BUILD_ID__ = ' +
            JSON.stringify(BUILD_ID) +
            ';\n' +
            '</script>';
          return html.replace('<!--CARDBEY_INJECT_CONFIG-->', configScript);
        },
      },
      cardbeyClassicEntryPlugin(),
      {
        name: 'cardbey-reject-localhost-bundle',
        generateBundle(_options, bundle) {
          if (!isProd) return;
          Object.keys(bundle).forEach((fileName) => {
            if (/\.map$/i.test(fileName)) return;
            const chunk = bundle[fileName];
            let source = '';
            if (chunk.type === 'chunk') {
              source = chunk.code || '';
            } else if (chunk.type === 'asset' && typeof chunk.source === 'string') {
              source = chunk.source;
            }
            if (/https?:\/\/(localhost|127\.0\.0\.1)/i.test(source)) {
              const match = source.match(/https?:\/\/(localhost|127\.0\.0\.1)[^\s"'`]*/i);
              throw new Error(
                '[cardbey-display-webos] Production bundle contains localhost URL in ' +
                  fileName +
                  ': ' +
                  (match ? match[0] : '(unknown)'),
              );
            }
            if (/@vite\/client|vite\/dist\/client/i.test(source)) {
              throw new Error(
                '[cardbey-display-webos] Dev client leaked into production bundle: ' +
                  fileName,
              );
            }
          });
        },
      },
    ],
    server: {
      host: true,
      port: 5174,
    },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
      environmentMatchGlobs: [
        ['tests/shellPairing.test.ts', 'happy-dom'],
        ['tests/playbackBasics.test.ts', 'happy-dom'],
      ],
    },
  };
});
