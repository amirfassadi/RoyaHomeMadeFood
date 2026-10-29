# Roya search readiness

Public indexing is controlled in Admin → Settings → SEO. The `seo` setting is stored in PostgreSQL; the public-SEO migration enables the real storefront without changing an existing setting. Static preview and demo mode always remain noindex. The old ROYA_INDEXABLE environment flag is only a fallback when the database setting does not exist.

Metadata, robots.txt, sitemap.xml and product structured data use the same runtime policy. Changing the admin setting invalidates the shared SEO cache. Page metadata reads request-scoped settings rather than persisting the CI build's noindex state. Public pages have self-referencing canonicals and Persian, English and x-default alternates. Private checkout, cart, account, tracking, payment-result, rates and design-system pages remain noindex; admin and API access still require their own authorization.

The sitemap contains only public pages and active catalog products. Product schema uses actual catalog prices in IRR (Toman × 10), stock availability, quantity basis and product images. Breadcrumb schema mirrors the visible product navigation. Organization and WebSite schema do not invent reviews, ratings, addresses, licenses or business hours. A generated branded PNG provides the default social share image.

## Search Console

1. Add https://royahealthyfood.ir/ as a URL-prefix property in Google Search Console, or verify the domain through DNS.
2. For HTML verification, copy only the content token into the admin Google Search Console field and save; then verify ownership in Google.
3. Submit https://royahealthyfood.ir/sitemap.xml.
4. Inspect the Persian homepage, catalog and an actual product URL. Request indexing for priority URLs and monitor coverage and performance.

Enabling indexing does not guarantee immediate indexing or rankings. Search Console ownership requires the owner's Google account or DNS access. Real product descriptions, original product photos and accurate contact details must be maintained by the business owner. Metadata is an initial technical foundation, not a substitute for those pages.

## Existing reverse-proxy blocker

The live Nginx responses were observed to include `X-Robots-Tag: noindex, nofollow` independently of the application metadata. This header overrides the intention to index public pages. It must be removed or scoped to private routes in the relevant Nginx configuration before public indexing can be considered enabled. Do not disable authentication or change unrelated virtual hosts. Validate Nginx configuration before reloading and verify the public response headers afterwards. The GitHub deployment account can invoke the application deployment helper but cannot directly edit Nginx configuration.

`deploy/enable-public-indexing.py` provides a dry-run and a root-only `--apply` mode for the existing `/etc/nginx/conf.d/roya-domain.conf`. It refuses unexpected virtual hosts and inherited/unknown header locations, backs up the configuration, validates Nginx before reload, checks local HTTPS response headers, and restores the old file if validation fails. It does not modify API or unrelated virtual-host files. This script has to be run by the server owner; deploying application code does not execute it automatically.

References: [Google canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), [Google sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [Google noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing), [Next.js metadata](https://nextjs.org/docs/app/getting-started/metadata-and-og-images).
