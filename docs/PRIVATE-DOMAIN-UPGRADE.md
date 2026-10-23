# Private administrator preparation-time upgrade

`deploy/upgrade-private-domain.sh` upgrades the existing private HTTPS storefront
from `26b04f0f882a811604b720aa069660e7c58201ed` to
`3f6a74cef79ac602d6b9f34f57eca7ed0989a54d`. It uses the explicit `--upgrade`
profile of the existing guarded domain transaction; the original domain
connection entrypoint and its historical source manifest remain available.

The source manifest verifies all 228 selected application files. Its source
release is `2ce213315171f1bba64211e27a8b46797d71bf96`. Only the product editor, shared field sizing, duration input and their browser
fixture/test/documentation differ from the previous HTTPS application source.
The previous upgrade manifest is retained as private-domain-upgrade-base-manifest.json;
older pinned archives and rollback backups retain their matching operator code. Next.js remains pinned to 16.4.2.

Run the supplied pinned GitHub download in the VPS SSH terminal as `amir`.
The entrypoint checks the current release/link, exact existing private proxy,
canonical HTTPS origin, disabled live-effect flags, local Roya database target,
free memory/disk, services and loopback listeners. A mismatch stops the operation.
Builds receive no database or session secrets. There is no schema migration,
seed, administrator reset, product write, live order, payment or SMS operation.

The new standalone build is tested on loopback port 3312 before switching the
existing app on 3311. Enter the **existing private-preview password**, separate
from the administrator password, only at the hidden terminal prompt. The
private username stays `roya-preview`. The upgrade verifies protected apex/www,
FA/EN storefront routes, shared catalog/pricing, secure CSRF cookies, Origin
guards and disabled live effects. The existing DNS, certificate and other sites
are preserved; no certificate request or renewal is initiated.

The configuration backup printed during activation contains the previous
environment, systemd unit, proxy and the rollback code/manifest. The old release
is retained. Failures after switching attempt a guarded return to the previous
HTTPS application behind its password gate. Manual rollback uses the exact
`sudo bash .../restore.sh` path printed by that run. Rollback refuses a later
operator edit, changed deployment, corrupt backup or modified candidate before
restoring application files. If rollback cannot finish, the tool prints its
review path; keep that report for investigation.

Successful activation ends with `PRIVATE CHECKOUT UPGRADE READY` and a rollback
path. Until that output is received from the VPS, this upgrade is **prepared,
not installed**. Afterwards refresh the browser and test the product editor by selecting days, entering 2 and saving.
The UI update does not change the existing product's 240-minute setting automatically.
Then create a fresh test checkout and verify both Tehran delivery windows. Existing browser invoices retain
their original snapshot and are not rewritten.

Validation includes source reconstruction/tamper rejection, unknown release and
proxy rejection, candidate failure, failed restart, failed final verification,
wrong password, successful upgrade and rollback, corrupt backup, and concurrent
operator/candidate edits. CI also runs the actual upgrade HTTPS verifier through
isolated Nginx/Next.js/PostgreSQL. These are not evidence of a VPS installation.
