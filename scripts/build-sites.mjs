import {spawnSync} from 'node:child_process';
const env = {...process.env, SITES_STATIC_PREVIEW: '1'};
// Invoke Node entrypoints directly so static releases also build on Windows.
for (const args of [
  ['node_modules/prisma/build/index.js', 'generate'],
  ['node_modules/next/dist/bin/next', 'build', ...(process.platform==='win32'?['--webpack']:[])],
]) {
  const result=spawnSync(process.execPath,args,{stdio:'inherit',env});
  if(result.status!==0)process.exit(result.status??1);
}
const finalize=spawnSync(process.execPath,['scripts/finalize-static-preview.mjs'],{stdio:'inherit',env:{...process.env,SITES_STATIC_PREVIEW:'1'}});
process.exit(finalize.status??1);
