# Guest verification and reservation deadlines

Guest checkout requires a verified Iranian recipient mobile, independent of membership and marketing consent. A signed-in active customer's verified matching mobile is accepted on the server; guest UI offers separate SMS verification and never creates an account. Both domestic and international order creation enforce this before stock writes. Quotes remain available without SMS.

OTP expires after five minutes, with at most five guesses. Verification produces a random 256-bit proof, stored only as SHA-256, bound to the mobile and valid for one order for 30 minutes. Proof consumption and stock reservation share one transaction. Price/stock failure rolls back proof use. An identical idempotent retry still returns the original order after proof consumption; another order key cannot reuse it. A changed phone requires new verification.

## Kavenegar test setup

Create and obtain approval for a verification template (example name `royaotp`) using `%token` for the six-digit code. The official provider example uses `receptor`, `token`, `template` and `type=sms`: https://github.com/kavenegar/kavenegar-examples-python/blob/master/verify_lookup.py . Use an OTP-only message; no marketing text or consent is added.

After deploying this version, run `sudo python3 configure-kavenegar-test.py` from this repository's deploy directory on the VPS, then restart roya-store and roya-preview to load the environment. The helper prompts privately for API key, exact approved template and 1-5 allowed test mobile numbers. It backs up both files with private permissions, preserves/generates the OTP secret, configures test mode, and sends nothing. Never paste the API key, OTP secret or environment contents in chat or Actions logs.

Default/test mode permits only the configured `ROYA_SMS_TEST_MOBILES`. Both account and checkout OTP use one persistent `SmsTestBudget` row, `initial-five`; an atomic SQL claim permits at most FIVE attempted provider sends TOTAL. Concurrent workers cannot exceed it. Provider errors and uncertain timeouts consume a slot, with no automatic retry or refund of the slot. Deployment and configuration reruns never reset the row. Unit/integration tests mock the provider and consume no real SMS. Production mode requires a separate explicit operator decision (`ROYA_SMS_MODE=production`); do not set it during this five-attempt test.

## Reservation policy

Every new order reserves stock, the original Tehran-day capacity and discount usage for ONE HOUR. The receipt and tracking show the deadline. For bank transfers this is the deadline for STORE CONFIRMATION, not merely sending money. Customers are warned that late transfers do not restart fulfilment; contact the store for reconciliation/refund. Legacy pending unpaid orders receive a one-hour grace period from migration time.

A production Node startup hook starts a once-per-minute maintenance loop and also checks immediately. Two app instances coordinate using PostgreSQL row locks with SKIP LOCKED. Each tick handles at most 50 due orders; downtime/backlogs can delay cancellation, but payment-confirmation paths enforce the deadline under the order lock independently. Tracking and checkout retry also attempt expiry. This is intended for the long-running VPS processes, not ephemeral serverless runtimes. No public maintenance endpoint or cron secret is introduced.

Expiry only affects due PENDING, unpaid, inventory-reserved orders without courier dispatch. It cancels the order and atomically releases stock, original-day capacity and discount usage once. PAID/PREPARING/SHIPPED/DELIVERED orders are not expired. Gateway attempts are retained, including uncertain requests; they are never fabricated as failed. A later authoritative Zarinpal/BTCPay success marks PAID plus refundRequired without reopening the order or allocating released stock. An admin can record a matched late bank transfer on an auto-expired order for refund review. The app does not automatically refund money.

Watch service logs for `Reservation expiry failed` and investigate immediately. Existing service restart-on-failure handles process exits; there is no guarantee of maintenance while both services are stopped. CI verifies the exact standalone server automatically expires a pre-existing fixture and releases stock, alongside concurrency and payment tests.

## Temporary SMS pause

The owner requested a temporary pause after the first successful live OTP test. The sms-policy Setting is migrated to enabled=false exactly once. With this explicit pause, guest checkout does not require OTP, and account/checkout SMS requests are rejected before provider or budget access. Existing verified sessions remain valid. Inventory expiry and payment checks are unaffected. Missing policy defaults to requiring verification; malformed policy fails closed.

Admin Settings now includes an authenticated, origin-checked and audited SMS switch with optimistic concurrency. Resuming requires configured Kavenegar credentials; the five-attempt counter remains unchanged. Do not enable production SMS mode or reset the counter without explicit owner authorization.

The read-only public health workflow checks six public routes daily at 04:30 UTC (08:00 Tehran); GitHub schedules may be delayed. A weekly npm vulnerability audit runs Mondays. Neither job sends SMS, creates orders, receives deployment secrets or changes production. Results appear in GitHub Actions; notification delivery depends on GitHub account settings.
