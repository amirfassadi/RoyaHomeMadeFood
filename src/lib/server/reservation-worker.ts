import 'server-only';
import {expireDueReservations} from './reservations';
const state=globalThis as typeof globalThis&{royaReservationTimer?:ReturnType<typeof setInterval>};
export function startReservationWorker(){
 if(state.royaReservationTimer)return;
 let running=false;
 const tick=async()=>{if(running)return;running=true;try{await expireDueReservations();}catch{console.error('Reservation expiry failed; retrying on the next maintenance tick.');}finally{running=false;}};
 state.royaReservationTimer=setInterval(()=>{void tick();},60000);
 state.royaReservationTimer.unref();
 void tick();
}
