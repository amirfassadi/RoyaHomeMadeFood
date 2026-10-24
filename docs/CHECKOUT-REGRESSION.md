# Private checkout regression scenario

The kilogram chicken-and-mushroom product scenario is covered in
`tests/storefront-scenario.test.ts` and included automatically in `npm test`.
It uses fixed fixture rates, a 1,500,000 Toman/kg price, unlimited inventory and
capacity, and 2,880 minutes of preparation. No real product, rate source, policy,
order, payment, or message is written by these tests.

Run with the pinned dependencies and generated Prisma client:

```bash
npm ci --no-audit --no-fund
npm run typecheck
npm test
```

The scenario covers one/two kilograms, delivery charged once, country currency
and fee overrides, invalid PayPal country selection, guest payment simulations,
invoice serialization, frozen historical amounts, changed prices/stock/capacity,
stale exchange rates, expired invoices, and two-day preparation boundaries.
The 21.35 AED fixture total consists of 20.26 subtotal + 0.41 fee + 0.68 delivery;
these are deterministic test amounts, not a claim about current market prices.

The preparation regression failed against the previous implementation: an order
requiring 48 hours could accept a delivery only 24 hours away. The prototype now
uses the longest preparation time in the basket (with its existing one-day
minimum), and presents three eligible daily windows. Changing the Tehran window
also changes its timestamp. Order creation rechecks preparation against the
refreshed catalog. Existing saved invoices are not recalculated.

These tests exercise application rules and serialization, not a remote browser,
localStorage events, live rate-provider availability, mobile layout, or actual
production ordering. Those remain separate validation tasks.

## Deployment boundary

This source change is not an installation on the VPS. The existing pinned
domain installer/manifests describe the previous release; do not run that old
installer against this changed checkout source or bypass its hash guards.
A separately verified private upgrade is required before calling the deployed
checkout fixed. Keep the Basic authentication gate and all live-effect blocks.
