import 'next-auth';
declare module 'next-auth' {interface Session {adminId?:string;sessionVersion?:number;}}
