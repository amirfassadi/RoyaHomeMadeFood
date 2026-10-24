# Zod dependency update — 2026-10-24

The application lock previously resolved Zod 4.6.5. The final audit in Actions
40021478268 reported GHSA-mrhx-c7xc-m3w5; all earlier application, browser,
PostgreSQL and deployment checks in that run passed. This update pins Zod
4.6.6 in package.json and the lockfile. No other resolved dependency changes.

References:

- https://github.com/advisories/GHSA-mrhx-c7xc-m3w5
- https://github.com/colinhacks/zod/commit/a0ebf970f2d752e5f58527cd2942ff48be4f46bd

Regression checks exercise the actual quote and administrator product-edit
schemas. Valid maximum-sized collections remain accepted; oversized invalid
item/media arrays are rejected with a bounded collection error, including
arrays of null entries. Application schemas and business rules are unchanged.

## Pinned deployment

| Identity | Value |
| --- | --- |
| Required installed runtime | 8f272a29a383ccc64b88964eea7e7dde0bd9db39 |
| New sourceRelease | e500aeab698926995bbbb853e02851ecb694cc11 |
| New runtime | 321f8929648c9fcf2bdcfda3e270352b0b9d2174 |

The selected 239-file application manifest differs from the installed content
release only in package.json, package-lock.json and tests/validation.test.ts.
The existing verified upgrade wrapper now targets this exact transition.
Run `bash deploy/upgrade-private-domain.sh` from the checked GitHub source as
amir in the VPS SSH terminal. An unknown installed release or modified source
is refused. A running application is not changed until the new standalone
candidate builds and passes the existing guarded activation checks.

The installer retains the actual private/public-preview access mode, noindex,
administrator authentication and disabled live-effect flags. It does not run
migrations, seeds, payments, orders or SMS, and it does not change business
product data, shared fees or CMS content. Candidate build compaction stays
within that new candidate under /home/amir/roya-setup. Installed releases and
backups remain available.

The new rollback printed by the installer restores the content runtime 8f272a2
and its captured access mode. Historical rollback scripts retain their own
release/configuration guards and must not be assumed to apply to a later
deployment. Access and administrator diagnostics recognize the new exact
runtime as well as their existing supported releases.

This document describes the prepared source transition. It is not evidence
that the update has been installed on the user's VPS; use the actual installer
result and final .roya-release read for that confirmation.
