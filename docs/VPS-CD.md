# Roya VPS deployment

This deployment targets the existing Debian VPS, Nginx routes and PostgreSQL service:

- `royahealthyfood.ir` and `www.royahealthyfood.ir` route to `roya-preview` on loopback port 3311.
- The existing API hostname routes to `roya-store` on loopback port 3310.
- Both services run the same **server** artifact with their existing separate environment files.
- Existing Node 24 at `/opt/roya/tools/node/bin/node` is retained.
- Database credentials and third-party credentials stay in `/etc/roya`. They are not copied to GitHub.

## What changes

The quality job builds the server with `npm run build:app` and separately builds the static Sites preview. `npm run build` currently builds the static preview, so it must not supply a VPS server artifact.

Deployment runs only after quality passes, only for pushes to main, and only when repository variable `ROYA_DEPLOY_ENABLED` is `true`. Pull requests cannot deploy. Deployment runs are serialized. Indexing remains disabled until the business owner finishes acceptance checks.

GitHub builds on Linux x64 and sends an archive through SSH with a verified host key. Each archive contains a standalone runtime and temporary migration tooling. The latter includes the dependency tree, making the first version of this pipeline relatively large to transfer; it is deleted on the VPS on success or failure. It is never retained in each runtime release. No build runs on the VPS.

The deployment helper checks free space (4 GiB minimum), validates each environment, applies Prisma migrations and idempotent seed, switches both symlinks, installs consistent systemd units, restarts both services and checks local database health endpoints. Failed application health checks restore previous symlinks and service definitions. **Database migrations are not reversed by application rollback.** Changes must use migrations compatible with the previous application. Once sales start, take and verify database backups before deployments that change the schema.

The active release plus two successful predecessors are retained in `/opt/roya/deployments`. Temporary work is removed by an exit trap. An abrupt power loss or SIGKILL can leave temporary work, which must be inspected before deletion. The free-space check prevents deployment into a nearly full disk; it is not a background disk alert.

## One-time installation

1. Keep the old application running. Do not remove `/opt/roya/tools` or `/etc/roya`.
2. Copy the reviewed `deploy/install-vps.sh` and `deploy/deploy-vps.sh` together into a small folder on the VPS. Do not recreate a full checkout with node_modules there.
3. Run `bash -n install-vps.sh` and `bash -n deploy-vps.sh`, then `sudo bash install-vps.sh` from that folder. Installer archives existing settings privately in `/var/backups/roya-config`, creates a dedicated deployment account and installs the deployment helper. It does not restart services, change Nginx or reset the database.
4. Create a dedicated SSH key pair on your own computer. Add only its public key to `/home/roya-deploy/.ssh/authorized_keys`, prefixed with `restrict `. Set owner to `roya-deploy:roya-deploy`, directory mode 700 and file mode 600. The deployment account has permission to invoke only the deployment helper through sudo. This helper still permits deploying application code with access to Roya's application credentials; protect main and the SSH key accordingly.
5. Check `sshd` configuration permits public-key login for `roya-deploy`; an existing `AllowUsers` restriction may need a scoped addition. Do not alter other users' access.
6. Verify server SSH host-key fingerprints through your existing trusted connection. Build a known_hosts entry for `[87.107.54.244]:22022` from that verified public key. Do not disable host-key checking. A scan alone does not authenticate the host.
7. In repository Settings > Secrets and variables > Actions, add the following.

| Type | Name | Value |
| --- | --- | --- |
| Variable | VPS_HOST | 87.107.54.244 |
| Variable | VPS_PORT | 22022 (confirm this is your SSH port) |
| Secret | VPS_SSH_KEY | Dedicated deployment private key, pasted directly in GitHub, never in chat |
| Secret | VPS_KNOWN_HOSTS | Verified known_hosts entry for the address and port |
| Variable | ROYA_DEPLOY_ENABLED | Leave unset or false until installation and credentials are ready |

8. Ensure both backend.env and preview.env pass the app's preflight requirements: valid PostgreSQL URLs, matching HTTPS NEXTAUTH_URL / NEXT_PUBLIC_SITE_URL for each role, a strong NEXTAUTH_SECRET, real Cloudinary settings, demo/static flags disabled, and explicit sandbox/indexing settings. Never paste these files in chat.
9. Merge the reviewed workflow and scripts. Set `ROYA_DEPLOY_ENABLED=true` only when ready. Push a new commit to main to deploy. Existing runs are not retroactively enabled. A deployed SHA cannot be deployed again into the same directory; use a new commit to retry a successful deployment.

## Acceptance and final removal of the old installation

After the first successful deployment, verify Actions logs, `systemctl is-active roya-store roya-preview`, both local health endpoints, the public HTTPS storefront, login, assets, products and API hostname. A local health response alone does not validate the complete purchase or payment flow. Keep existing Nginx authentication/access restrictions during this step.

Confirm both current links resolve under `/opt/roya/deployments/<commit>`. Only then remove the old `/opt/roya/releases` and `/opt/roya/preview-releases` directories after checking no service, process or mount still references them. Old configuration archives are small but contain credentials and should remain root-only with a bounded retention policy. Nginx routing, TLS certificates, unrelated databases and `/opt/roya/tools` must remain intact.

The user has authorized discarding the existing `roya_store` data. **This installer deliberately does not drop any database automatically.** If a database reset is required, stop only Roya's services, verify `roya_store` is the exact target, recreate it with the existing correct owner, and run deployment migrations and seed. Never drop `smartcore_identity_private`, the PostgreSQL cluster, or other projects' data.

For the final installation, bootstrap the administrator interactively using `scripts/create-admin.ts` with the migration toolkit in a controlled session. No default administrator password is created. The temporary toolkit is removed after automated deployment; retain it only for that session and delete it afterwards. External Cloudinary media is not deleted by resetting the database.

## Validation limits

Shell syntax must pass locally and in CI. The server build, database integration tests and deploy job must pass on GitHub before activation. SSH authentication, existing server environment compatibility, actual service restart/rollback and public-site acceptance require validation on the VPS. Do not treat the presence of these files as a completed installation.
