import {createHmac,timingSafeEqual} from 'node:crypto';
export function otpDigest(secret:string,id:string,mobile:string,code:string){return createHmac('sha256',secret).update(JSON.stringify([id,mobile,code])).digest('hex');}
export function otpMatches(actual:string,expected:string){if(!/^[a-f0-9]{64}$/.test(actual)||!/^[a-f0-9]{64}$/.test(expected))return false;return timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(expected,'hex'));}
