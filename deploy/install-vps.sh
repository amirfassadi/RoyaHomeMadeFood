#!/usr/bin/env bash
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'Run with sudo bash.'; exit 1; }
source_dir=$(cd -- "$(dirname -- "$0")" && pwd)
node=/opt/roya/tools/node/bin/node
[[ -x "$node" ]] || { echo 'Existing Roya Node installation not found.'; exit 1; }
for tool in runuser systemd-run curl flock tar ssh-keygen; do
  command -v "$tool" >/dev/null
done
id roya-store >/dev/null
for file in database backend preview; do
  [[ -f "/etc/roya/$file.env" ]] || { echo "Missing $file.env"; exit 1; }
done

# Small, private configuration archive; no application builds or database dumps.
install -d -m 700 /var/backups/roya-config
backup="/var/backups/roya-config/$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
umask 077
tar -czf "$backup" -C / etc/roya etc/nginx \
  etc/systemd/system/roya-store.service etc/systemd/system/roya-preview.service
chmod 600 "$backup"

if ! id roya-deploy >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash roya-deploy
fi
install -d -m 700 -o roya-deploy -g roya-deploy /home/roya-deploy/.ssh
install -d -m 755 /opt/roya/deployments
install -d -m 700 /opt/roya/deploy-work
install -o root -g root -m 755 "$source_dir/deploy-vps.sh" /usr/local/sbin/roya-deploy
printf '%s\n' 'roya-deploy ALL=(root) NOPASSWD: /usr/local/sbin/roya-deploy *' \
  > /etc/sudoers.d/roya-deploy
chmod 440 /etc/sudoers.d/roya-deploy
visudo -cf /etc/sudoers.d/roya-deploy
printf 'Configuration archive: %s\n' "$backup"
echo 'Installed deployment tools. Existing services and database were not changed.'
echo 'Add a dedicated deployment PUBLIC key to /home/roya-deploy/.ssh/authorized_keys.'
echo 'Recommended key options: restrict ssh-ed25519 ...'
echo 'Then chown roya-deploy:roya-deploy that file and chmod 600 it.'
echo 'SSH host public key fingerprints:'
for key in /etc/ssh/ssh_host_*_key.pub; do ssh-keygen -lf "$key"; done
