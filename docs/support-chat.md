# Account support chat

Customers open `/fa/support/` or `/en/support/` using the floating support link or the link in their account. Existing customer authentication with verified mobile is required; email verification follows the current storefront policy and is not separately required by chat; sign-in and registration return to the conversation. Messages are plain text, up to 2,000 characters. They remain in PostgreSQL and new messages refresh every six seconds while the page is visible. Earlier messages can be paged backwards.

Administrators use `/admin/support/`. The owner automatically has access; other administrators need the new **چت پشتیبانی و سوابق مشتری** (`support`) permission, granted in the existing staff management page. This permission explicitly includes customer name, mobile, email, account status, the latest 20 orders, payment status and payment references. Order detail links additionally respect the existing order/customer/payment permissions. Support staff do not gain permission to confirm or change payments.

Deploy using the existing application deployment process, including `npm run db:deploy` before serving the new code. Migration `20261030120000_support_chat` creates the two support tables; no new secrets or external service is needed. The static demo explains that chat requires the live application and does not store pretend conversations.

Security and consistency:

- Customer ownership always comes from the authenticated account, never a submitted user ID, thread ID, mobile or recipient address. Order context uses `Order.userId`.
- Every read and write authenticates the caller; writes recheck current session version, active status, role and support permission inside the transaction.
- Message writes use the existing same-origin JSON/body-size protection and shared rate limiter, plus a per-sender limit of 20 messages per minute.
- User and conversation row locks serialize message sequences. A unique client UUID makes retries of the same message idempotent. Reusing the UUID for different text is rejected.
- Read receipts are monotonic and only acknowledge a sequence the client displayed. Reads do not reorder the inbox; admin replies are audited.
- APIs return `Cache-Control: no-store`. Message bodies are rendered as text, never HTML. Password hashes, registration codes and gateway credentials are never sent to the support UI.

Checks: `npm run typecheck`, `npm test`, `npm run build:app`. PostgreSQL concurrency tests are part of `npm run test:integration` and require the isolated test database described in the repository deployment docs. A live end-to-end check should cover customer sign-in → send → admin unread inbox → reply → customer reads the response, plus a second customer and a staff member without support permission.
