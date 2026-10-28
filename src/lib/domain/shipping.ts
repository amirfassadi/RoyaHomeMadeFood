import {checkedMoney} from './checkout';
export function shippingTotal(baseToman:number,markupPercent:number){
 checkedMoney(baseToman);
 const basisPoints=Math.round(markupPercent*100);
 if(!Number.isFinite(markupPercent)||markupPercent<0||markupPercent>100||Math.abs(markupPercent*100-basisPoints)>1e-7)throw new RangeError('Invalid markup');
 const markupToman=Number((BigInt(baseToman)*BigInt(basisPoints)+9999n)/10000n);
 return {courierFeeToman:baseToman,shippingMarkupToman:markupToman,shippingMarkupPercent:markupPercent,deliveryFeeToman:checkedMoney(baseToman+markupToman)};
}
