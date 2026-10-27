import {test} from 'node:test';
import assert from 'node:assert/strict';
import {beginDemoRecovery,verifyDemoRecovery,recoveredDemoOrders,DEMO_CODE_TTL_MS,DEMO_RESEND_MS,DEMO_RECOVERY_TTL_MS} from '../src/lib/prototype-recovery';
import type {DemoOrder} from '../src/lib/prototype';

const now = Date.parse('2026-10-24T06:00:00Z'), mobile = '09123456789';
const start = () => beginDemoRecovery(mobile, '012345', now);
const order = (n: number, phone = mobile): DemoOrder => ({id: String(n), trackingCode: 'DEMO-' + n.toString(16).toUpperCase().padStart(12, '0'), createdAt: new Date(now + n).toISOString(), details: {mobile: phone}} as DemoOrder);

test('mobile recovery reveals no browser orders until explicit demo-code verification', () => {
  const state = start(), orders = [order(1), order(2, '09121111111')];
  assert.equal(recoveredDemoOrders(null, mobile, orders, now), null);
  assert.equal(recoveredDemoOrders(state, mobile, orders, now), null);
  const verified = verifyDemoRecovery(state, '۰۹۱۲ ۳۴۵۶۷۸۹', '۰۱۲۳۴۵', now + 1);
  assert.equal(verified.result, 'verified');
  assert.equal(verified.state.code, null);
  assert.deepEqual(recoveredDemoOrders(verified.state, mobile, orders, now + 2)?.map(o => o.id), ['1']);
  assert.equal(recoveredDemoOrders(verified.state, '09121111111', orders, now + 2), null);
});

test('five wrong attempts exhaust the demo challenge without granting recovery access', () => {
  let state = start();
  for (let i = 0; i < 5; i++) {
    const next = verifyDemoRecovery(state, mobile, '999999', now + i);
    assert.equal(next.result, i === 4 ? 'locked' : 'invalid'); state = next.state;
    assert.equal(recoveredDemoOrders(state, mobile, [order(1)], now + i), null);
  }
  assert.equal(verifyDemoRecovery(state, mobile, '012345', now + 10).result, 'locked');
});

test('expired and already-used demo codes cannot establish or extend recovery', () => {
  assert.equal(verifyDemoRecovery(start(), mobile, '012345', now + DEMO_CODE_TTL_MS).result, 'expired');
  const state = verifyDemoRecovery(start(), mobile, '012345', now + 1).state;
  const replay = verifyDemoRecovery(state, mobile, '012345', now + 200);
  assert.equal(replay.result, 'used'); assert.equal(replay.state.verifiedUntil, state.verifiedUntil);
  assert.equal(recoveredDemoOrders(state, mobile, [order(1)], now + 1 + DEMO_RECOVERY_TTL_MS), null);
});

test('resend cooldown is enforced and a replacement challenge invalidates the old code/access', () => {
  const state = verifyDemoRecovery(start(), mobile, '012345', now + 1).state;
  assert.throws(() => beginDemoRecovery(mobile, '654321', now + DEMO_RESEND_MS - 1, state), /COOLDOWN/);
  const replacement = beginDemoRecovery(mobile, '654321', now + DEMO_RESEND_MS, state);
  assert.equal(recoveredDemoOrders(replacement, mobile, [order(1)], now + DEMO_RESEND_MS), null);
  assert.equal(verifyDemoRecovery(replacement, mobile, '012345', now + DEMO_RESEND_MS).result, 'invalid');
  assert.equal(verifyDemoRecovery(replacement, mobile, '654321', now + DEMO_RESEND_MS).result, 'verified');
});

test('a challenge is tied to the entered order mobile and cannot recover live tracking codes', () => {
  assert.equal(verifyDemoRecovery(start(), '09121111111', '012345', now).result, 'invalid');
  const state = verifyDemoRecovery(start(), mobile, '012345', now).state;
  assert.deepEqual(recoveredDemoOrders(state, mobile, [{...order(1), trackingCode: 'ROYA-' + 'A'.repeat(24)}], now), []);
  assert.deepEqual(recoveredDemoOrders(state, mobile, [], now), []);
  assert.throws(() => beginDemoRecovery('+49123456789', '012345', now));
});

test('the verified demo list is bounded, newest-first and leaves stored invoices unchanged', () => {
  const orders = Array.from({length: 50}, (_, n) => order(n)), before = JSON.stringify(orders);
  const state = verifyDemoRecovery(start(), mobile, '012345', now).state;
  const found = recoveredDemoOrders(state, mobile, orders, now)!;
  assert.equal(found.length, 20); assert.equal(found[0].id, '49'); assert.equal(found.at(-1)?.id, '30');
  assert.equal(JSON.stringify(orders), before);
});
