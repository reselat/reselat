import type { NextConfig } from 'next';
const config: NextConfig = {
 serverExternalPackages:['@electric-sql/pglite'],
 output: process.env.DEPLOYMENT_TARGET==='self-hosted'?'standalone':undefined,
 async redirects(){return [{source:'/demo/finance',destination:'/workspace/payments',permanent:false},{source:'/demo/:path*',destination:'/workspace/:path*',permanent:false}];},
 poweredByHeader: false, agentRules: false, devIndicators: false,
 outputFileTracingIncludes: {
  '/*': ['./assets/certificates/supabase-prod-ca-2021.crt'],
  '/api/*': ['./skills/trade/**/SKILL.md','./assets/fonts/NotoSansSC-Regular.otf','./node_modules/pdfkit/js/standard-fonts/**/*.cjs'],
 },
};
export default config;
