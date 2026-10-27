// Exercise real native binaries after an npm install without lifecycle scripts.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const require = createRequire(resolve(process.cwd(), 'package.json'));
const esbuild = require('esbuild');
const swc = require('@swc/core');
const sharp = require('sharp');
if (!esbuild.transformSync('const amount: number = 1', {loader: 'ts'}).code.includes('amount')) {
  throw new Error('Offline esbuild binary failed.');
}
if (!swc.transformSync('const amount = 1').code.includes('amount')) {
  throw new Error('Offline SWC binary failed.');
}
const png = await sharp({create: {width: 1, height: 1, channels: 3, background: '#000000'}}).png().toBuffer();
if (png.length < 8 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
  throw new Error('Offline native image processing failed.');
}
console.log('OFFLINE NATIVE BINARIES PASS: esbuild, SWC and a Sharp PNG conversion.');
