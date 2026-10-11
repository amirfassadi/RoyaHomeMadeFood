import {test} from 'node:test';
import assert from 'node:assert/strict';
import {changeAdminPassword} from '../../src/lib/server/admin-security';
import {hashPassword,verifyPassword} from '../../src/lib/admin/password';
test('changing an admin password verifies old password, preserves role and revokes sessions',async()=>{
 const user={id:'admin',role:'ADMIN',active:true,sessionVersion:3,passwordHash:await hashPassword('Initial test password 123')};let audits=0;
 const tx={$queryRaw:async()=>[],user:{findUnique:async()=>({...user}),update:async({data}:any)=>{user.passwordHash=data.passwordHash;user.sessionVersion+=data.sessionVersion.increment;}},adminAudit:{create:async()=>{audits++;}}};
 Object.assign(globalThis,{royaDb:{$queryRaw:async()=>[{count:1}],user:{findUnique:async()=>({...user})},$transaction:async(fn:any)=>fn(tx)}});
 await assert.rejects(()=>changeAdminPassword(user.id,'Wrong','New test password 456',3),/CURRENT_PASSWORD/);assert.equal(user.sessionVersion,3);
 await changeAdminPassword(user.id,'Initial test password 123','New test password 456',3);assert.equal(user.sessionVersion,4);assert.equal(user.role,'ADMIN');assert.equal(audits,1);assert(await verifyPassword('New test password 456',user.passwordHash));
 await assert.rejects(()=>changeAdminPassword(user.id,'New test password 456','Another password 789',3),/CURRENT_PASSWORD/);
});
