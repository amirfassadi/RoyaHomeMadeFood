import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getCloudinary,mediaUploadsEnabled} from '../../src/lib/server/cloudinary';

test('disabled media operations reject before calling the provider even with credentials present',()=>{
 const keys=['ROYA_MEDIA_UPLOADS_ENABLED','CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET'] as const;
 const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 try{
  Object.assign(process.env,{ROYA_MEDIA_UPLOADS_ENABLED:'0',CLOUDINARY_CLOUD_NAME:'example',CLOUDINARY_API_KEY:'example',CLOUDINARY_API_SECRET:'example'});
  assert.equal(mediaUploadsEnabled(),false);
  assert.throws(()=>getCloudinary(),{code:'MEDIA_UPLOADS_DISABLED',status:503});
  process.env.ROYA_MEDIA_UPLOADS_ENABLED='1';
  delete process.env.CLOUDINARY_API_SECRET;
  assert.equal(mediaUploadsEnabled(),false);
  assert.throws(()=>getCloudinary(),{code:'MEDIA_UPLOADS_DISABLED',status:503});
  process.env.CLOUDINARY_API_SECRET='example';
  assert.equal(mediaUploadsEnabled(),true);
 }finally{
  for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
 }
});
