/**
 * ESLint Flat Configuration (ESLint v9+)
 * Provides clean rules for Node.js backend files and Browser renderer files.
 */

const js = require('@eslint/js');

module.exports = [
  // Ignore build artifacts, scratch scripts, and dependencies
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'scratch/**',
      'dist-unpack/**',
      'assets/**',
      'mobile/dist/**',
      'mobile/android/**'
    ]
  },

  // Base recommended rules for all JavaScript files
  js.configs.recommended,

  // Global environment and rule configurations
  {
    files: ['src/**/*.js', 'scripts/**/*.js', '*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        // Node.js globals
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        require: 'readonly',
        module: 'writable',
        exports: 'writable',
        Buffer: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',

        // Browser & DOM globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        HTMLElement: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        FileReader: 'readonly',
        Image: 'readonly',
        Set: 'readonly',
        Map: 'readonly',
        URL: 'readonly',
        alert: 'readonly',
        prompt: 'readonly',
        confirm: 'readonly',
        localStorage: 'readonly',
        Option: 'readonly',

        // Desktop App Preload & Library Globals
        electronAPI: 'readonly',
        lucide: 'readonly',
        Chart: 'readonly'
      }
    },
    rules: {
      // Security and correctness rules
      'no-undef': 'error',
      'no-constant-condition': 'warn',
      'no-debugger': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-control-regex': 'off',
      'no-useless-escape': 'warn',
      
      // Keep warnings manageable during transition of legacy monoliths
      'no-unused-vars': [
        'warn',
        {
          vars: 'all',
          args: 'none',
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_'
        }
      ]
    }
  },

  // Dedicated ES Module configuration for frontend UI modules
  {
    files: ['src/ui/**/*.js', 'src/app.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLSelectElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        FileReader: 'readonly',
        Image: 'readonly',
        Set: 'readonly',
        Map: 'readonly',
        URL: 'readonly',
        alert: 'readonly',
        prompt: 'readonly',
        confirm: 'readonly',
        localStorage: 'readonly',
        Option: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        electronAPI: 'readonly',
        icon: 'readonly',
        hydrateIcons: 'readonly',
        getInitials: 'readonly',
        getAvatarColor: 'readonly',
        renderMonogram: 'readonly',
        ICON_SVG_MAP: 'readonly',
        Chart: 'readonly'
      }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': [
        'warn',
        {
          vars: 'all',
          args: 'none',
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_'
        }
      ]
    }
  },

  // Dedicated ES Module configuration for mobile companion
  {
    files: ['mobile/src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        FileReader: 'readonly',
        Image: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        AbortController: 'readonly',
        indexedDB: 'readonly',
        localStorage: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        prompt: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        Set: 'readonly',
        Map: 'readonly'
      }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': [
        'warn',
        {
          vars: 'all',
          args: 'none',
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_'
        }
      ]
    }
  }
];
