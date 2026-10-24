import {spawnSync} from 'node:child_process';
const result = spawnSync('npm', ['run', 'build:app'], {
  stdio: 'inherit', env: {...process.env, SITES_STATIC_PREVIEW: '1',ROYA_PRIVATE_DB_CATALOG:'0'},
});
if(result.status!==0)process.exit(result.status??1);
const finalize=spawnSync(process.execPath,['scripts/finalize-static-preview.mjs'],{stdio:'inherit',env:{...process.env,SITES_STATIC_PREVIEW:'1',ROYA_PRIVATE_DB_CATALOG:'0'}});
process.exit(finalize.status??1);
