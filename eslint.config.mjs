// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/generated/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Phase-0 constraint: no `any` anywhere. An escape hatch here silently
      // becomes an escape hatch in the permission layer later.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // The seed script's whole job is to print a credentials table.
    files: ['apps/api/prisma/seed.ts'],
    rules: { 'no-console': 'off' },
  },
  prettier,
);
