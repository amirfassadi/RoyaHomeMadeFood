# Domain test access

The operator can open the Roya test storefront without the separate HTTP Basic
password. This is anonymous access to a test site: anyone with its address can
visit. `noindex` and robots rules request that search engines omit it; they are
not access control or a promise that a URL cannot appear in search.

From a verified, pinned GitHub source download, run as `amir`:

```sh
sudo python3 deploy/domain-preview-access.py --open
```

This accepts the exact installed duration build `3f6a74c...` and content build
`8f272a2...`. It changes only the recognized Roya domain Nginx configuration,
tests syntax, reloads Nginx and verifies anonymous HTTPS. It does not rebuild or
restart the app, issue a certificate, change DNS, migrate/seed the database or
change administrator credentials. Another deployment or an unknown configuration
causes it to stop before making the access change.

The administrator's existing NextAuth login, secure cookies, Origin guards and
rate limits stay active. Real orders, payments, payment callbacks, SMS, customer
accounts and contact submissions stay disabled. The application keeps its
loopback-only listener; guests reach it through HTTPS. Existing products, shared
pricing and browser-local simulated orders are unchanged.

The public profile retains the fixed HTTPS host, strips untrusted forwarded,
geo and Authorization headers, applies `X-Robots-Tag: noindex, nofollow` and
`Cache-Control: no-store`, and redirects `www` to the apex. HTTP remains closed
apart from the existing ACME challenge path.

The command prints a configuration backup and guarded rollback command. A
failed syntax/reload/surface check automatically restores the prior profile;
rollback refuses a later deployment, unrelated protected change, altered backup
or conflicting Nginx edit. The saved password file is retained, so the original
password can be used if the operator closes the preview again:

```sh
sudo python3 deploy/domain-preview-access.py --close
sudo python3 deploy/domain-preview-access.py --check
```

`--check` verifies the current mode without changing configuration. Repeating
`--open` or `--close` is idempotent. The normal upgrade script from this source
recognizes either exact profile, preserves that mode through upgrade/rollback
and does not request a Basic password in public-preview mode. Older pinned
installers require the old private gate; use the new source for later upgrades.

The separate historical Sites preview and Vercel deployment settings are not
changed by this operation. Opening access on the VPS requires the operator to
execute the command there; GitHub CI or preparing a source package is not proof
that access has changed on the actual VPS.
