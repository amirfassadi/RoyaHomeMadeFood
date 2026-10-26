# Offline build package

`fast-uri-3.1.9.tgz` contains the exact bytes identified by the existing
package-lock.json SHA-512 integrity, not a modified or substituted dependency.
The archive includes fast-uri's BSD-3-Clause LICENSE. The pinned digest is checked
before seeding npm's cache and npm independently checks lock integrity on install.

The other two absent entries reported by the VPS inventory, @emnapi/runtime and
@img/sharp-wasm32, belong to optional WASM fallback trees. No lock entries are
removed or changed. The offline regression deliberately omits those cache files
and verifies the actual native Linux x64 Sharp build, not just package metadata.

The existing Prisma engine is reused only after its SHA-256 matches the prepared
candidate's verified bytes. It is copied into the new candidate; the shared cache
is retained. No Prisma engine or application secret is distributed here.
