import { defineConfig } from '@playwright/test';
const database=process.env.TEST_DATABASE_URL;
if(!database)throw new Error('TEST_DATABASE_URL es obligatoria: prepara y migra una base exclusiva para E2E');
export default defineConfig({
  testDir:'./tests/e2e',timeout:45_000,workers:1,fullyParallel:false,
  use:{baseURL:'http://127.0.0.1:5173',trace:'retain-on-failure',viewport:{width:1440,height:1000}},
  webServer:[
    {command:'pnpm --filter @simbo/api start',url:'http://127.0.0.1:3001/api/health',reuseExistingServer:false,timeout:60_000,env:{DATABASE_URL:database,PORT:'3001',CORS_ORIGIN:'http://127.0.0.1:5173'}},
    {command:'pnpm --filter @simbo/web dev --host 127.0.0.1',url:'http://127.0.0.1:5173',reuseExistingServer:false,timeout:60_000,env:{VITE_API_URL:'http://127.0.0.1:3001/api',VITE_DEMO_FOCUSED_UI:'false'}}
  ]
});
