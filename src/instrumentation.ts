export async function register(){
 if(process.env.NEXT_RUNTIME==='nodejs'&&process.env.NODE_ENV==='production'&&process.env.NEXT_PHASE!=='phase-production-build'&&process.env.SITES_STATIC_PREVIEW!=='1'&&process.env.ROYA_DEMO_CATALOG!=='1'&&process.env.DATABASE_URL){
  const {startReservationWorker}=await import('./lib/server/reservation-worker');
  startReservationWorker();
 }
}
