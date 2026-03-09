const eslint = require('@eslint/js');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');
const importPlugin = require('eslint-plugin-import');
const globals = require('globals');

module.exports = [
    {
        ignores: ['node_modules/**', 'dist/**', 'coverage/**'],
    },
    eslint.configs.recommended,
    eslintPluginPrettierRecommended,
    {
        plugins: {
            import: importPlugin,
        },
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                ...globals.jest,
            },
        },
        rules: {
            'import/no-cycle': 'error',
            'import/no-self-import': 'error',
            'import/no-useless-path-segments': 'warn',
            'no-console': ['warn', { allow: ['log', 'warn', 'error'] }],
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'prettier/prettier': ['error', { endOfLine: 'auto' }],
        },
    },
];
