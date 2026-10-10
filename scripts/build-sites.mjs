import {spawnSync} from 'node:child_process';
const result = spawnSync('npm', ['run', 'build'], {
  stdio: 'inherit', env: {...process.env, SITES_STATIC_PREVIEW: '1'},
});
process.exit(result.status ?? 1);
