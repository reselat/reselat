import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({ resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } }, test: { exclude: ['.open-next/**', '.wrangler/**', 'node_modules/**'], environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 30000 } });
