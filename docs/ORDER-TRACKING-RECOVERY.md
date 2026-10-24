# Order tracking without a tracking code

Status: requested by Amir on 24 October 2026. The browser-local interactive demonstration is implemented in source; VPS installation is pending. Real SMS recovery and server authorization remain unimplemented. The current VPS runtime is `321f8929648c9fcf2bdcfda3e270352b0b9d2174`; this source does not change SMS configuration.

## Interactive demonstration

The demo tracking page retains code/mobile lookup and adds «کد پیگیری را ندارم» / “I do not have my tracking code”. It explicitly displays a browser-generated test code instead of sending SMS. Correct entry reveals up to 20 newest matching DEMO orders from this browser, including guest orders. There is no server request, login, user creation, consent change or mutation of stored orders.

For UX testing only: the in-memory code lasts five minutes, has five attempts and a 60-second resend cooldown; the simulated viewing grant lasts ten minutes. Resending, editing the mobile, leaving the mode or reloading removes the previous access. The demonstration checks wrong/expired/reused codes and mobile isolation, but client state is not an authorization boundary. Neither the code nor its state is accepted by a live endpoint. Real server authorization and delivery below are still required before launch.

## Customer flow

Keep code + order-mobile tracking. Add a second choice, “I do not have my tracking code” / «کد پیگیری را ندارم». The customer enters the mobile recorded on the order, receives a one-time SMS code, verifies it and sees a bounded list of that mobile's orders. Selecting an order opens its status, payment status, totals, delivery and history. Guest orders must be included; registration, a name and marketing consent are not prerequisites.

Verification proves control of the order mobile, not the identity of a payer using another number. Use the existing supported mobile normalization. International-number support is not implied by this requirement.

## Authorization boundary

The existing `customer-otp` provider is an account-login flow: it may create a CUSTOMER user and its account order list covers orders linked to that user. It cannot serve as a drop-in implementation for guest-order recovery.

Use a purpose-specific tracking challenge and a short-lived, mobile-scoped recovery session. A tracking code must not redeem an account-login challenge, and an account-login code must not redeem a tracking challenge. Verification must not create a user, modify marketing preference, sign in to an existing account or grant an administrator session, even when that mobile also belongs to an administrator. Every order lookup must constrain the verified mobile on the server; a submitted order ID or mobile alone is not authorization.

Before verification, reveal neither whether orders exist nor any order, name or address. Return generic request/verification outcomes. After verification, allowlist only the tracking fields needed by the customer, paginate the list and omit addresses, internal notes, admin identifiers and payment credentials. Recovery reads must not create/reconcile a payment or initiate a provider transaction.

## Delivery and abuse controls

Reuse the established server-side OTP primitives where suitable, retaining independent tracking purpose and scope: cryptographically generated codes, keyed verifiers bound to challenge/mobile/purpose, expiry, single-use atomic redemption, failed-attempt limits, resend cooldown and mobile/IP/global limits. No code, verifier, provider credential or recovery token in logs or URLs. Use secure HttpOnly cookies, same-origin checks and no-store responses. A resend must invalidate the previous challenge; provider failure must not produce a usable challenge or a fake success. Expiry/sign-out must remove recovery access.

Real SMS remains disabled until the provider/template/secrets and explicit send approval are ready. The interactive demo visibly says that no SMS is sent, accesses only browser-local DEMO orders and has no live-order endpoint. The present demo and live-effect flags remain unchanged.

## Acceptance checks (pending)

- Existing code/mobile tracking continues to work in Persian and English, on desktop and mobile.
- Missing tracking code is optional in the SMS path; normalized order-mobile input works.
- Correct SMS verification lists guest and signed-in orders for exactly that mobile, with a bounded/paginated empty state.
- Before verification, unrelated mobile/order IDs, expired/incorrect/reused codes and cross-purpose codes reveal no orders; concurrent redemption succeeds at most once.
- Rate limits, cooldown/resend, delivery failure and expired recovery sessions are tested without real provider calls.
- The tracking session cannot access customer account changes, administrator APIs or another mobile's orders, including when the mobile belongs to an administrator.
- Recovery causes no user creation, marketing subscription, order mutation, payment action or SMS in preview/CI.
- Real-provider delivery is a separate approved test, with an agreed SMS budget; it is not covered by a browser-local demonstration.

## Evidence already available

Amir's 24 October screenshot of `/fa/tracking/` shows existing code/mobile DEMO lookup working for `DEMO-F47FE8F47ED8`: simulated successful domestic card payment, 2,325,000 Toman, delivery 4 Aban 1405 at 14–18 and order history. It does not demonstrate SMS recovery or administrator order display. No screenshot is stored in this repository.

