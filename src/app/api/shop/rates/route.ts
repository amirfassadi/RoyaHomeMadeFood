import {withBackendTrust} from '@/lib/server/api-guard';
import {getMarketFeed} from '@/lib/server/market-rates';
import {json} from '@/lib/server/shop-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=withBackendTrust(async()=>{
  const feed=await getMarketFeed();
  return json(feed,feed.tether||feed.fx?200:503);
});
