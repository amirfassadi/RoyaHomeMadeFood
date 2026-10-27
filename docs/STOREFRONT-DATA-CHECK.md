# Read-only storefront data check

After saving the business product and content through the administrator UI,
run `node deploy/verify-domain-storefront.mjs` in the VPS SSH session after
`sudo -v`. Use the dedicated Node runtime under `/opt/roya/tools/node/bin`.
No npm install, build, migration or administrator password is needed.

This operator check reuses the current runtime inspection and the trusted local
Nginx HTTPS transport. The hostname/SNI remains `royahealthyfood.ir`; certificate
validation stays enabled. It requires the already-open `public-preview` access
profile, noindex/no-store and an independently protected administrator API.
It never opens access or changes configuration.

The public database catalog must contain exactly one of the two known name
orders for the chicken/mushroom product:

| Field | Expected value |
| --- | --- |
| Unit and price basis | KG / 1 kg |
| Price | 1,500,000 Toman |
| Stock and daily capacity | Both unlimited (`null`) |
| Preparation | 2 days / 2880 minutes |

The script verifies the public Persian and English catalog/product responses,
language/direction, shared pricing read and the application-reported market
source states. It does not print raw HTTP responses, environment values,
cookies, database credentials or administrator data. It does not ask for login.

All requests are allowlisted GETs. Checkout, contact, auth and payment paths
are excluded. Reading the rates endpoint may refresh the application's existing
in-memory market-data cache through its normal public read-only providers; this
is not a database write or financial transaction.

Exit 0 means the product/public-page checks passed and the application reported
both rate sources fresh. Exit 2 means the product checks passed but live rates
were incomplete; it does not silently substitute a sample rate. Exit 1 means a
configuration, response or product mismatch stopped the check. No failure path
automatically fixes data or configuration.

`STOREFRONT DATA PASS` is local HTTPS/API evidence. It does not certify CMS
save/reload, browser cart quantities, eligible delivery-slot choices, country or
payment selection, external connectivity or long-term server stability. Existing
browser-only invoices remain untouched. Those UI checks stay separate.

Run isolated boundary tests with:

```sh
node --test scripts/test-storefront-data-check.mjs
```
