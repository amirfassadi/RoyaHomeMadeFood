# Simulated mobile recovery upgrade

This update adds an optional, explicitly simulated mobile-verification path to the existing DEMO tracking page. It does not implement or enable real SMS, server-side guest recovery, accounts or payments. See [the recovery requirement](ORDER-TRACKING-RECOVERY.md) for the pending production authorization boundary.

## Exact deployment edge

- Required installed runtime: `321f8929648c9fcf2bdcfda3e270352b0b9d2174`.
- New source fingerprint: `db9dd404ceaebf2af49c5d531080248e4a3f2e81`.
- New runtime: `6e5669e0d5add140ff60cd6164f94673143582b1`.
- The 244-file selected application changes six files: the tracking component, the new demo recovery component/helper, its unit tests and two isolated browser fixture files. Package versions, database schema, business data, account/SMS/provider code and payment rules are unchanged.
- The installer preserves the existing anonymous test-preview or private gate profile, administrator protection and all disabled-live-effect flags. It compacts only redundant build files in the new candidate under `/home/amir/roya-setup`.

After the pinned source/archive and CI are verified, run the existing `deploy/upgrade-private-domain.sh` as `amir`. It refuses a different installed base or modified source, builds/tests a separate candidate, creates its configuration backup and prints the exact guarded rollback command. That backup returns to runtime `321f892` and the captured access profile. Do not run a historical rollback against a later deployment.

## Verification scope

`tests/prototype-recovery.test.ts` covers no pre-verification results, normalized mobile/code input, wrong attempts, expiry/single use, cooldown/resend, mobile scoping, rejecting live tracking codes and a bounded immutable order list. These are demo-state tests and do not prove real SMS authorization.

`scripts/test-storefront-browser.mjs` bundles the actual cart, checkout, tracking and local administrator-order components with a controlled catalog and FX/pricing fixtures in an isolated browser. It exercises quantity/stock/removal, required and invalid guest details, discount cap, a country-change review reset, eight country/currency/fee cases, payment selection, 48-hour preparation, local fulfilment and the demo recovery controls in Persian/English and mobile. It rejects external requests and non-GET requests. Its administrator view is an isolated component test; real administrator authentication is covered separately by the existing HTTPS suite.

These controlled fixtures are not VPS market rates, real customer data or source-freshness evidence. VPS installation and manual final-domain testing are recorded separately only after the operator supplies results. Existing browser DEMO invoices and real product preparation remain untouched.

## Operator check after installation

In the same browser that already contains a DEMO invoice, open `/fa/tracking/`, choose «کد پیگیری را ندارم», enter that order's mobile and select «نمایش کد آزمایشی». Enter the displayed code and select an order. The result must preserve the frozen total, payment status, delivery and history. Confirm the no-SMS notice; test a wrong code, another mobile and page reload. Real SMS/provider setup is a separate, approved step.
