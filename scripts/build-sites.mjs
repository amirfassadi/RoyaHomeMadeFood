import {spawnSync} from 'node:child_process';
const result = spawnSync('npm', ['run', 'build'], {
  stdio: 'inherit', env: {...process.env, SITES_STATIC_PREVIEW: '1'},
});
if(result.status!==0)process.exit(result.status??1);
const finalize=spawnSync(process.execPath,['scripts/finalize-static-preview.mjs'],{stdio:'inherit',env:{...process.env,SITES_STATIC_PREVIEW:'1'}});
process.exit(finalize.status??1);
