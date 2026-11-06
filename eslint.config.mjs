import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
export default defineConfig([...nextVitals, ...nextTs, {files:['src/**/*.{ts,tsx}'],rules:{'no-restricted-imports':['error',{patterns:['**/auth/authorize','**/auth/principal','**/auth/project-order']}]}}, globalIgnores(['.next/**','.open-next/**','.wrangler/**','artifacts/**','next-env.d.ts'])]);
