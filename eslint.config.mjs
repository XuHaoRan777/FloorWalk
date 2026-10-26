import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/.expo/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/**/*.{ts,tsx,js,cjs}', 'packages/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['apps/**/*.{ts,tsx,js,cjs}', 'packages/**/*.ts'],
    ignores: [
      '**/*.{test,spec}.{ts,tsx,js,cjs}',
      '**/tests/**',
      '**/components/ui/**',
      'packages/shared/src/contract/**',
    ],
    rules: {
      'max-lines': [
        'error',
        { max: 400, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}', 'apps/mobile/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
