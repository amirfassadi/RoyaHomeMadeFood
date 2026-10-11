import 'dotenv/config';
import {deploymentErrors} from '../src/lib/preflight';
const errors=deploymentErrors(process.env);
if(errors.length){for(const error of errors)console.error(error);process.exitCode=1;}
else{console.log('Deployment environment validation passed.');if(!process.env.ZARINPAL_MERCHANT_ID)console.log('Online payment unavailable: merchant ID missing. Cash on delivery remains available.');}
