export class CheckoutRequestError extends Error {
 constructor(code:string,public readonly checkoutNotStarted=false){super(code);}
}
export function canEditAfterCheckoutFailure(error:unknown){
 return error instanceof CheckoutRequestError&&error.checkoutNotStarted;
}
