// One ESLint configuration for every workspace.
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/coverage/**',
    '**/.expo/**',
    'apps/*/android/**',
    'apps/*/ios/**',
    '.factory/**',
  ]),
  expoConfig,
  {
    settings: {
      'import/resolver': {
        typescript: {
          project: ['apps/*/tsconfig.json', 'packages/*/tsconfig.json', 'factory/tsconfig.json'],
        },
      },
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'tooling/**/*.mjs'],
    languageOptions: {
      globals: { test: 'readonly', expect: 'readonly', describe: 'readonly', jest: 'readonly' },
    },
  },
]);
