# Roya private storefront prototype

This owner-private Sites build preserves the Next.js storefront, Persian RTL / Vazirmatn, English routes, catalog, weighted quantities, guest cart, production checkout adapters and admin screens.

## What can be tested

- Add products at their minimum quantity, change quantities, remove items and keep the cart across Persian/English routes.
- Open “Country & test tools” above the header. Iran uses Toman and domestic payment simulations. Türkiye, UAE, Germany, UK, US, Canada and Other expose international checkout and its banner. `?country=IR` and `?country=TR` initialize the scenario. This static prototype does **not** detect IP country; real geolocation remains in the production server's trusted-proxy availability endpoint. Never use this selector as payment authorization.
- Buyer abroad / recipient in sample Tehran delivery zones. No cross-border food shipping. Fill sample details, choose day/window, optionally use ROYA10, review a 10-minute quote, and create a test invoice.
- USDC on BSC, BTC Lightning and PayPal offer success, failure and expiry simulations. Failed invoices can be retried with a fresh quote. Successful simulations clear the cart. Cash creates a sample order with cash due.
- Track orders with their DEMO code and Iranian recipient mobile, or select a recent local test order.
- Demo admin → Orders displays test orders from the same browser and lets eligible orders progress through preparing, shipped and delivered. No real fulfilment occurs. Test history is separate from seeded admin sample orders.
- Local test orders can be cleared from demo admin. Up to 50 are retained. Use synthetic details only; no email or SMS is sent. Browser storage can be cleared by the browser and is not server persistence or multi-user administration.

## Payment boundaries

No live payment API, wallet connection, fund transfer, payable QR, wallet address, BOLT11 invoice or card-entry form is created by the prototype. All numbers are examples; 100,000 Toman/USD is an arbitrary fixture, not a current FX rate. No zero-fee claim is made. The historical 100,000 Toman/USD fixture remains only for legacy sample orders and domain fixtures; the current overseas UI requires a fresh sourced pricing snapshot.

- **USDC/BSC:** BNB Smart Chain / BEP-20 / chain ID 56 is the requested network. Confirm the precise token representation, contract, decimals, custody and settlement before enabling real acceptance. Do not assume native Circle USDC; BSC does not appear in Circle's native contract list checked 2026-10-17. Network gas is in BNB. No token or deposit address is exposed here.
- **BTC Lightning:** a live integration requires a supported invoice backend, inbound liquidity, valid BTC/USD conversion and server-verified invoice settlement/expiry. On-chain Bitcoin is a different payment rail.
- **PayPal:** replaces the earlier card option. A browser-only simulation is selectable for the explicit AE, DE, GB, US and CA test scenarios. Iran uses domestic methods; Türkiye and unspecified Other do not enable PayPal. No SDK, PayPal login, approval URL, order API, capture or transfer is used. This sample allowlist is not merchant eligibility verification. Live acceptance remains disabled pending an eligible business account, supported buyer/seller countries and merchant approval.

Primary reference checks (2026-10-17):

- https://developers.circle.com/stablecoins/usdc-contract-addresses
- https://www.circle.com/blog/bridged-usdc-standard
- https://docs.btcpayserver.org/LightningNetwork/
- https://docs.btcpayserver.org/Invoices/
- https://developer.paypal.com/api/codes/country-region/
- https://www.paypal.com/tr/home

## Validation

Run `npm run typecheck`, `npm test` and `npm run build:sites`. Prototype domain coverage includes country/payment boundaries, validated quantities, discount limits, integer currency conversion, stale/tampered/expired quotes, invoice outcomes, bounded storage and permitted fulfilment transitions. Build output must include fa/en catalog/product/cart/checkout/international/tracking routes plus admin and local assets. The private Sites deployment and owner-only access are checked through native deployment results and access metadata. Browser QA requires the supported control-browser capability; report it as unverified if unavailable.

## Country pricing and exchange rates

Public read-only Nobitex USDT/RLS and Coinbase USD cross rates are requested with credentials omitted. RLS is divided by 10 to produce Toman. USD/Toman is derived as USDT/Toman multiplied by USDT per USD; this is explicitly labelled as a derived rate, not a cash USD quote. An optional administrator-set USD/Toman rate is labelled manual. No Google/XE page is scraped; comparison links are supplied.

IR uses Toman; TR/AE/DE/GB/US/CA use TRY/AED/EUR/GBP/USD/CAD. Other uses USD. Product base prices and cart lines convert without altering quantities. A global fee and optional country overrides apply after discount, excluding delivery, with separate invoice rows. All currency amounts use integer minor units and BigInt half-up conversion.

Settings and cached rates are local to the prototype browser, not a server-wide authorization or pricing policy. The administrator can edit them in Settings. Cached market rates expire after 15 minutes; failed refreshes retain the original timestamp and stale foreign checkout is blocked. A quote lasts at most 10 minutes and never outlives its rate. Rate/policy changes invalidate a reviewed quote, while saved invoices retain their original currency, fee, rate source and totals. Live checkout remains disabled; trusted production pricing and multi-user settings persistence require the future backend deployment.

When live providers cannot be reached, an explicit “Use sample rates for testing” action enables fictional FX fixtures. It never activates automatically. The page and saved invoice label the sample source; normal rate expiry, recalculation and simulated-payment rules still apply.
