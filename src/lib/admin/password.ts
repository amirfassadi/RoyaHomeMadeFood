import {randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
const parameters={N:32768,r:8,p:1,maxmem:64*1024*1024};
function derive(password:string,salt:Buffer){return new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,parameters,(e,key)=>e?reject(e):resolve(key)));}
export async function hashPassword(password:string){
 if(password.length<12 || password.length>128)throw new RangeError('Password must contain 12–128 characters');
 const salt=randomBytes(16),key=await derive(password,salt);
 return `scrypt$32768$8$1$${salt.toString('hex')}$${key.toString('hex')}`;
}
export async function verifyPassword(password:string,encoded:string|null){
 const match=encoded?.match(/^scrypt\$32768\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/);
 // Same expensive operation for nonexistent accounts; no quick account enumeration.
 const salt=match?Buffer.from(match[1],'hex'):Buffer.alloc(16),expected=match?Buffer.from(match[2],'hex'):Buffer.alloc(64);
 const actual=await derive(password,salt);return !!match && timingSafeEqual(actual,expected);
}
