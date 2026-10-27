import {toLatinDigits} from './format';
import {mobileSchema} from './validation/checkout';
import type {DemoOrder} from './prototype';

// UI simulation only. This state is never sent to a server or used to authorize
// real orders, customer accounts or administrator access.
export const DEMO_CODE_TTL_MS = 5 * 60_000;
export const DEMO_RESEND_MS = 60_000;
export const DEMO_RECOVERY_TTL_MS = 10 * 60_000;
export const DEMO_CODE_ATTEMPTS = 5;
export type DemoRecovery = {
  mobile: string;
  code: string | null;
  expiresAt: number;
  resendAt: number;
  attempts: number;
  verifiedUntil: number | null;
};

export function beginDemoRecovery(rawMobile: string, code: string, now: number, previous: DemoRecovery | null = null): DemoRecovery {
  const mobile = mobileSchema.parse(rawMobile);
  if (!/^[0-9]{6}$/.test(code) || !Number.isFinite(now)) throw new Error('INVALID');
  if (previous && now < previous.resendAt) throw new Error('COOLDOWN');
  return {mobile, code, expiresAt: now + DEMO_CODE_TTL_MS, resendAt: now + DEMO_RESEND_MS, attempts: 0, verifiedUntil: null};
}

export function verifyDemoRecovery(state: DemoRecovery, rawMobile: string, rawCode: string, now: number): {state: DemoRecovery; result: 'verified' | 'invalid' | 'expired' | 'locked' | 'used'} {
  if (state.attempts >= DEMO_CODE_ATTEMPTS) return {state, result: 'locked'};
  if (!state.code) return {state, result: 'used'};
  if (!Number.isFinite(now) || now >= state.expiresAt) return {state: {...state, code: null}, result: 'expired'};
  const mobile = mobileSchema.safeParse(rawMobile), code = toLatinDigits(rawCode).trim();
  const attempts = state.attempts + 1;
  if (!mobile.success || mobile.data !== state.mobile || code !== state.code) {
    return {state: {...state, attempts, code: attempts >= DEMO_CODE_ATTEMPTS ? null : state.code}, result: attempts >= DEMO_CODE_ATTEMPTS ? 'locked' : 'invalid'};
  }
  return {state: {...state, attempts, code: null, verifiedUntil: now + DEMO_RECOVERY_TTL_MS}, result: 'verified'};
}

export function recoveredDemoOrders(state: DemoRecovery | null, rawMobile: string, orders: DemoOrder[], now: number): DemoOrder[] | null {
  const mobile = mobileSchema.safeParse(rawMobile);
  if (!state || !mobile.success || mobile.data !== state.mobile || state.verifiedUntil === null || !Number.isFinite(now) || now >= state.verifiedUntil) return null;
  return orders.filter(o => /^DEMO-[A-F0-9]{12}$/.test(o.trackingCode) && o.details.mobile === state.mobile)
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 20);
}
