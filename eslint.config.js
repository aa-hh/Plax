import globals from 'globals';

/**
 * Minimal ESLint gate. The ONE job here is `no-undef`: catch references to
 * variables that don't exist in scope — the exact class of bug that shipped a
 * `ReferenceError: user is not defined` inside a bootstrap promise chain (the
 * bundler happily bundles it; only the live device throws). This is a static
 * guard, not a style pass — stylistic rules stay off so the gate is all signal.
 */
export default [
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        // webOS TV platform globals (provided by the firmware / webOSTV.js).
        webOS: 'readonly',
        webOSSystem: 'readonly',
        PalmServiceBridge: 'readonly',
        // Build/debug hooks injected at build time or by the debug overlay.
        __PLAX_BUILD__: 'readonly',
        __PLAX_DEBUG__: 'readonly',
        __PLAX_LOG_SINK_URL__: 'readonly',
        __XPLAY_DEBUG__: 'readonly',
        __XPLAY_LOG_SINK_URL__: 'readonly',
        __plaxDebug: 'readonly'
      }
    },
    rules: {
      'no-undef': 'error'
    }
  }
];
