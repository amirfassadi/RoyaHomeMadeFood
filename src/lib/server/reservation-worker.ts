import 'server-only';
import {expireDueReservations} from './reservations';
import {dispatchPendingNotices} from './notice-delivery';
const state=globalThis as typeof globalThis&{royaReservationTimer?:ReturnType<typeof setInterval>};
export function startReservationWorker(){
 if(state.royaReservationTimer)return;
 let expiring=false,delivering=false;
 const expire=async()=>{if(expiring)return;expiring=true;try{await expireDueReservations();}catch{console.error('Reservation expiry failed; retrying on the next maintenance tick.');}finally{expiring=false;}};
 const deliver=async()=>{if(delivering)return;delivering=true;try{await dispatchPendingNotices();}catch{console.error('Customer notice maintenance failed; checking on the next maintenance tick.');}finally{delivering=false;}};
 state.royaReservationTimer=setInterval(()=>{void expire();void deliver();},60000);
 state.royaReservationTimer.unref();void expire();void deliver();
}
