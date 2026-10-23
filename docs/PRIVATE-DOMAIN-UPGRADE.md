# Private administrator content upgrade

`deploy/upgrade-private-domain.sh` upgrades the existing private HTTPS storefront
from `3f6a74cef79ac602d6b9f34f57eca7ed0989a54d` to
`3f0344fe47989c80bb8ee9da7b2f1f64442c16f6`. It uses the explicit `--upgrade`
profile of the existing guarded domain transaction; the original domain
connection entrypoint and its historical source manifest remain available.

The source manifest verifies all 239 selected application files. Its source
release is `52a02096588486e1a5e0ed9224d82b8d2ab1e9ba`. This adds bilingual marketing
copy management, its public rendering and tests, and fixes contact details in
the private database-catalog preview. See ADMIN-CONTENT.md for the editing scope.
The previous upgrade manifest is retained as private-domain-upgrade-base-manifest.json;
older pinned archives and rollback backups retain their matching operator code. Next.js remains pinned to 16.4.2.

Run the supplied pinned GitHub download in the VPS SSH terminal as `amir`.
The entrypoint checks the current release/link, exact existing private proxy,
canonical HTTPS origin, disabled live-effect flags, local Roya database target,
free memory/disk, services and loopback listeners. A mismatch stops the operation.
Builds receive no database or session secrets. There is no schema migration,
seed, administrator reset, product write, live order, payment or SMS operation.

The shell prints the candidate path before building and the standalone stage
before activation. Once the stage is complete and self-contained,
`compact-domain-build.py` removes only that candidate's redundant `node_modules`
and `.next`, inside `/home/amir/roya-setup`. It verifies paths, matching
descriptors and internal symlinks before removal and retains the standalone
stage, original sources, every installed release and every backup. It runs as
amir under the deployment lock. Nothing elsewhere is selected for disk cleanup.

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

Successful activation ends with `PRIVATE CONTENT UPGRADE READY` and a rollback
path. Until that output is received from the VPS, this upgrade is **prepared,
not installed**. The preceding duration upgrade must finish first; its last
reported resume stopped at the sudo password prompt, which is not installation
proof. Afterwards refresh the browser and open `/admin/content/`; saving text is
a separate explicit administrator action. The installer does not overwrite
existing content or change the product's last observed 240-minute preparation
setting. Existing browser invoices retain their original snapshots.

Validation includes source reconstruction/tamper rejection, unknown release and
proxy rejection, candidate failure, failed restart, failed final verification,
wrong password, successful upgrade and rollback, corrupt backup, and concurrent
operator/candidate edits. CI also runs the actual upgrade HTTPS verifier through
isolated Nginx/Next.js/PostgreSQL. These are not evidence of a VPS installation.
