# Administrator storefront copy

`/admin/content/` edits Persian and English copy for the home page, the main
About page story, the slogan and footer description. Product names and
descriptions stay in Products; contact details and response hours stay in
Settings. FAQ entries, menu labels and transactional wording are outside this
editor's scope.

Contact settings also use the real database in the private database-catalog
preview. The sample-catalog flag no longer hides administrator-saved contact
details and response hours on the Contact page and footer.

Each language keeps its draft while switching tabs. A preview renders plain
text and preserves paragraph breaks; HTML and translation placeholders are
displayed as text. Saving is explicit and saves both languages together.
This is an editor for the existing page layout, not a drag-and-drop page builder.

The existing PostgreSQL `Setting` table stores one `storefront-content` row;
no migration or seed is required. A missing row uses the existing translations.
Administrator reads are uncached. Version-checked writes and their audit are
atomic; stale edits return 409 without overwriting newer copy. Each successful
write invalidates the public content cache. Public marketing copy uses escaped
React text, never HTML or ICU interpolation.

Both API methods require the existing administrator session and backend trust.
Writes reuse the same Origin, input-size, schema and request-rate guards as
other administrator settings. The independent private-preview password gate,
checkout simulation and disabled live effects remain in place.

After a conflict or an unconfirmed save, the draft stays visible and another
save requires explicitly loading the server version. Loading replaces the draft;
copy any text you want to keep first. A successful save is visible to storefront
visitors, so review both languages before saving.

Validation covers schemas and defaults, database persistence and concurrent
writes, real authenticated HTTP/cache invalidation/public rendering, and the
actual form in an isolated browser (language switching, preview, conflicts,
lost responses, required inputs and mobile width). Those checks do not prove
that a new build has been installed or visually tested on the operator's VPS.
