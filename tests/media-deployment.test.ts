import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deploymentErrors} from '../src/lib/preflight';

const base={DATABASE_URL:'postgresql://user:pass@host/db',DIRECT_URL:'postgresql://user:pass@host/db',NEXT_PUBLIC_SITE_URL:'https://example.com',NEXTAUTH_URL:'https://example.com',NEXTAUTH_SECRET:'x'.repeat(32),ROYA_INDEXABLE:'0',ZARINPAL_SANDBOX:'true'};
test('deployment without a media provider requires explicit upload disablement',()=>{
 assert.equal(deploymentErrors(base).filter(error=>error.startsWith('CLOUDINARY_')).length,3);
 assert.deepEqual(deploymentErrors({...base,ROYA_MEDIA_UPLOADS_ENABLED:'0'}),[]);
 assert.equal(deploymentErrors({...base,ROYA_MEDIA_UPLOADS_ENABLED:'1',CLOUDINARY_CLOUD_NAME:'cloud'}).filter(error=>error.startsWith('CLOUDINARY_')).length,2);
 assert(deploymentErrors({...base,ROYA_MEDIA_UPLOADS_ENABLED:'false'}).some(error=>error.startsWith('ROYA_MEDIA_UPLOADS_ENABLED')));
 assert(deploymentErrors({...base,ROYA_MEDIA_UPLOADS_ENABLED:'0',NEXTAUTH_SECRET:''}).some(error=>error.startsWith('NEXTAUTH_SECRET')));
});
