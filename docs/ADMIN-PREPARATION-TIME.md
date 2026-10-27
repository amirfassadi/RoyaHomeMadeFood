# Product preparation time

The product editor accepts days, hours or minutes and displays the equivalent
minute value before saving. Existing whole-day/hour values open in that unit;
other values remain in minutes. For example, 240 minutes displays as 4 hours,
while choosing days and entering 2 sends `preparationMinutes: 2880`.

Changing the display unit alone preserves the existing duration. The database
and API continue to use integer minutes, from zero through 525600. Blank,
negative, excessive and fractional-minute values cannot be saved. Values such
as 1.5 hours are valid because they represent an exact integer number of minutes.
Existing product durations are not automatically changed.

The isolated browser regression renders the actual ProductEditor, captures its
POST to a local fixture API and verifies the product ID, edit version and minute
payload. It also checks legacy/zero values, unit switching, invalid input and a
375-pixel mobile viewport. It does not authenticate or write to the VPS catalog.
CI installs its pinned browser tooling outside application dependencies.

```bash
npm ci --no-audit --no-fund
npm run build:app
# When Playwright is installed in the test environment:
node scripts/test-admin-duration.mjs
```

Optional `ROYA_TEST_BROWSER_MODULE` and `ROYA_TEST_BROWSER_EXECUTABLE` select a
test browser installation. All fixture traffic remains on a temporary loopback
HTTP server, and the server/browser are closed after the test.

Actual VPS evidence showed the chicken/mushroom product at 240 minutes. The
operator must explicitly edit it to two days and save; a UI deployment is not
evidence that the business product was updated. A fresh simulated checkout is
needed afterwards to verify its delivery choices. Existing invoices keep their
original snapshot.
