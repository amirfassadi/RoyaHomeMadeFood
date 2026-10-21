#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077
export PATH=/opt/roya/tools/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
unset DATABASE_URL DIRECT_URL NEXTAUTH_SECRET ROYA_BACKEND_URL SITES_STATIC_PREVIEW
[ "$(id -un)" = amir ] && [ "$(id -u)" -ne 0 ] || { echo 'Run as amir, without sudo before bash.'; exit 1; }
payload_root="$(cd -- "$(dirname -- "$0")" && pwd -P)"
mkdir -p "$HOME/roya-setup"
exec 9>"$HOME/roya-setup/deploy.lock"
flock -n 9 || { echo 'STOP: another Roya deployment is running.'; exit 1; }
sudo -v
expected=b59e016234310422096ee167c37a12d8aa1aa746
[ "$(sudo -n cat /opt/roya/preview-current/.roya-release)" = "$expected" ] || { echo 'STOP: preview release differs; no running files changed.'; exit 1; }
sudo -n systemctl is-active --quiet roya-preview.service
candidate="$(mktemp -d "$HOME/roya-setup/rates-source.XXXXXX")"
python3 - "$payload_root" "$candidate" <<'PY_SOURCE'
from pathlib import Path,PurePosixPath
import hashlib,json,shutil,sys
root,destination=map(Path,sys.argv[1:])
m=json.loads((root/'manifest.json').read_text())
def matches(folder):
    if folder.is_symlink() or not folder.is_dir():return False
    for name,digest in m['base_files'].items():
        if name=='next-env.d.ts':continue # Next rewrites this generated declaration during build.
        p=folder/name
        if p.is_symlink() or not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=digest:return False
    return True
sources=sorted((Path.home()/'roya-setup').glob('rates-source.*'))
source=next((p for p in sources if matches(p)),None)
if source is None:raise SystemExit('STOP: verified unified source not found; running preview unchanged.')
for name,digest in m['target_files'].items():
    path=PurePosixPath(name)
    if path.is_absolute() or '..' in path.parts:raise SystemExit('STOP: unsafe source path.')
    p=root/'overlay'/name if name in m['overlay_files'] else source/name
    if p.is_symlink() or not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=digest:
        raise SystemExit('STOP: candidate source mismatch: '+name)
    target=destination/name;target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(p,target);target.chmod(0o600)
(destination/'.roya-unified.json').write_text(json.dumps(m,sort_keys=True))
print('Verified FX update source prepared; running preview unchanged.')
PY_SOURCE
cd "$candidate"
npm ci --include=dev --no-audit --no-fund
env -u DATABASE_URL -u DIRECT_URL -u NEXTAUTH_SECRET -u ROYA_BACKEND_URL -u SITES_STATIC_PREVIEW \
  NEXT_TELEMETRY_DISABLED=1 ROYA_DEPLOYMENT_ROLE=standalone ROYA_DEMO_CATALOG=1 \
  ROYA_INDEXABLE=0 ROYA_LIVE_PAYMENTS=0 ROYA_ACCEPT_ORDERS=0 ROYA_SEND_SMS=0 \
  NEXTAUTH_URL=http://localhost:3311 NEXT_PUBLIC_SITE_URL=http://localhost:3311 \
  NODE_OPTIONS=--max-old-space-size=1536 npm run build:app
stage="$candidate/.roya-rates-stage"
mkdir "$stage"
cp -a .next/standalone/. "$stage/"
cp -a public "$stage/public"
mkdir -p "$stage/.next"
cp -a .next/static "$stage/.next/static"
cp .roya-unified.json "$stage/.roya-unified.json"
release_id="$(python3 -c 'import json;print(json.load(open(".roya-unified.json"))["release_id"])')"
sudo -v
sudo bash -s -- "$stage" "$release_id" "$expected" <<'ROOT'
set -euo pipefail
set +x
umask 077
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
stage=$1; release_id=$2; expected=$3
[[ "$release_id" =~ ^[a-f0-9]{40}$ ]] || exit 1
link=/opt/roya/preview-current
unit=/etc/systemd/system/roya-preview.service
env_file=/etc/roya/preview.env
release="/opt/roya/preview-releases/$release_id"
[ -L "$link" ] && [ "$(cat "$link/.roya-release")" = "$expected" ]
[ "$(head -n 1 "$unit")" = '# Managed Roya private unified preview' ]
[ ! -e "$release" ] && [ ! -L "$release" ] || { echo 'STOP: target release already exists.'; exit 1; }
[ ! -e /etc/systemd/system/roya-preview.service.d ] || { echo 'STOP: unexpected service overrides.'; exit 1; }
systemctl is-active --quiet roya-store.service
systemctl is-active --quiet roya-preview.service
old_target="$(readlink -f "$link")"
[ "$old_target" = "/opt/roya/preview-releases/$expected" ]
old_backend="$(readlink -f /opt/roya/current)"
unchanged="$(sha256sum /etc/roya/database.env /etc/roya/backend.env /etc/systemd/system/roya-store.service /etc/nginx/conf.d/roya-api.conf)"
python3 <<'PY_ENV'
from pathlib import Path
p=Path('/etc/roya/preview.env');v={}
for line in p.read_text().splitlines():
    if '=' in line and not line.startswith('#'):
        k,value=line.split('=',1);v[k]=value
expected={'HOSTNAME':'127.0.0.1','PORT':'3311','ROYA_DEPLOYMENT_ROLE':'standalone','ROYA_DEMO_CATALOG':'1',
 'ROYA_LIVE_PAYMENTS':'0','ROYA_ACCEPT_ORDERS':'0','ROYA_SEND_SMS':'0','ROYA_INDEXABLE':'0',
 'ROYA_INTERNATIONAL_ENABLED':'0','CUSTOMER_ACCOUNTS_ENABLED':'0','ROYA_TRUST_GEO_HEADER':'0',
 'NEXTAUTH_URL':'http://localhost:3311','NEXT_PUBLIC_SITE_URL':'http://localhost:3311',
 'ROYA_PREVIEW_RELEASE':'b59e016234310422096ee167c37a12d8aa1aa746'}
if any(v.get(k)!=value for k,value in expected.items()):raise SystemExit('STOP: private preview settings differ.')
if not v.get('NEXTAUTH_SECRET'):raise SystemExit('STOP: administrator secret missing.')
PY_ENV
backup="$(mktemp -d /etc/roya/preview-rollback.XXXXXX)"
cp -a "$unit" "$backup/service"
cp -a "$env_file" "$backup/environment"
printf '%s\n' "$old_target" > "$backup/target"
printf '%s\n' "$release" > "$backup/candidate"
install -d -m 755 "$release"
cp -a "$stage/." "$release/"
printf '%s\n' "$release_id" > "$release/.roya-release"
chown -R root:root "$release"
chmod -R go+rX "$release"
install -d -m 750 -o roya-store -g roya-store "$release/.next/cache"
chown -R roya-store:roya-store "$release/.next/cache"
cat > "$backup/restore.sh" <<'RESTORE'
#!/usr/bin/env bash
set -euo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
[ "$(id -u)" = 0 ]
root="$(cd -- "$(dirname -- "$0")" && pwd -P)"
python3 - "$root" <<'PY_RESTORE'
from pathlib import Path
import os,shutil,sys,uuid
root=Path(sys.argv[1]);link=Path('/opt/roya/preview-current')
old=(root/'target').read_text().strip()
if not old.startswith('/opt/roya/preview-releases/') or not Path(old,'server.js').is_file():raise SystemExit('STOP: invalid rollback target.')
if not link.is_symlink() or str(link.resolve()) not in [old,(root/'candidate').read_text().strip()]:raise SystemExit('STOP: another deployment changed the preview; automatic rollback refused.')
shutil.copy2(root/'service','/etc/systemd/system/roya-preview.service')
shutil.copy2(root/'environment','/etc/roya/preview.env')
temp=link.with_name('.preview-rollback-'+uuid.uuid4().hex)
temp.symlink_to(old);os.replace(temp,link)
PY_RESTORE
systemctl daemon-reload
systemctl restart roya-preview.service
echo 'Previous private preview restored.'
RESTORE
chmod 700 "$backup/restore.sh"
changed=0
rollback(){
  result=$?
  if [ "$result" -ne 0 ] && [ "$changed" = 1 ]; then
    echo 'Update check failed; restoring the previous private preview.'
    bash "$backup/restore.sh" || echo "Rollback needs attention: sudo bash $backup/restore.sh"
  fi
  exit "$result"
}
trap rollback EXIT
changed=1
python3 - "$release" "$release_id" "$old_target" <<'PY_SWITCH'
from pathlib import Path
import os,sys,uuid
release,release_id,old=sys.argv[1:]
unit=Path('/etc/systemd/system/roya-preview.service')
text=unit.read_text();needle='ReadWritePaths='+old+'/.next\n'
if text.count(needle)!=1:raise SystemExit('STOP: unexpected service cache path.')
unit.write_text(text.replace(needle,'ReadWritePaths='+release+'/.next\n'));unit.chmod(0o644)
p=Path('/etc/roya/preview.env');lines=p.read_text().splitlines()
lines=[('ROYA_PREVIEW_RELEASE='+release_id) if x.startswith('ROYA_PREVIEW_RELEASE=') else x for x in lines]
p.write_text('\n'.join(lines)+'\n');p.chmod(0o600)
link=Path('/opt/roya/preview-current');temp=link.with_name('.preview-update-'+uuid.uuid4().hex)
temp.symlink_to(release);os.replace(temp,link)
PY_SWITCH
systemctl daemon-reload
systemctl restart roya-preview.service
ready=0
for attempt in $(seq 1 20); do
  status="$(curl --noproxy '*' --silent --max-time 2 --output /dev/null --write-out '%{http_code}' http://127.0.0.1:3311/api/health/ || true)"
  if [ "$status" = 200 ]; then ready=1;break;fi
  sleep 1
done
[ "$ready" = 1 ] || { echo 'STOP: preview database health check failed.'; exit 1; }
python3 <<'PY_CHECK'
import json,subprocess,urllib.request,urllib.error
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,request,fp,code,msg,headers,newurl):return None
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
def check(path,expected,method='GET'):
    try:r=opener.open(urllib.request.Request('http://127.0.0.1:3311'+path,method=method),timeout=12)
    except urllib.error.HTTPError as e:r=e
    body=r.read()
    if r.status not in expected:raise SystemExit(f'STOP: {path}: HTTP {r.status}')
    print(f'{path}: HTTP {r.status}')
    return json.loads(body) if path.startswith('/api/') else None
check('/fa/rates/',[200]);check('/en/rates/',[200]);check('/api/admin/data/?section=settings',[401])
policy=check('/api/shop/pricing/',[200])
if policy.get('scope')!='store':raise SystemExit('STOP: pricing scope mismatch.')
feed=check('/api/shop/rates/',[200,503])
if feed.get('schemaVersion')!=2 or set(feed.get('sources',{}))!={'nobitex','fx'}:raise SystemExit('STOP: invalid FX response.')
for name,state in feed['sources'].items():print('FX source:',name,state['state'])
if feed.get('fx'):
    meta=feed['fx'].get('fxMeta',{})
    print('FX provider:',meta.get('provider'),'data date:',meta.get('date','retrieval time only'))
if not feed.get('rates'):print('Live FX incomplete on this VPS; check source status in the rates page. Explicit sample mode remains available.')
for path in ['/api/shop/checkout/','/api/international/checkout/','/api/payment/crypto/webhook/','/api/customer/code/']:
    if check(path,[503],'POST').get('error')!='STAGING_ONLY':raise SystemExit('STOP: live-effect guard failed.')
listeners=subprocess.check_output(['ss','-lntH','( sport = :3311 )'],text=True).splitlines()
if not listeners or any(line.split()[3]!='127.0.0.1:3311' for line in listeners):raise SystemExit('STOP: preview listener must be loopback-only.')
PY_CHECK
printf '%s\n' "$unchanged" | sha256sum --check --status
[ "$(readlink -f /opt/roya/current)" = "$old_backend" ]
systemctl is-active --quiet roya-store.service
systemctl is-active --quiet roya-preview.service
trap - EXIT
echo 'PRIVATE LIVE RATES FIX READY: http://localhost:3311/fa/rates/'
echo 'No database migration, real order, payment, SMS or public listener.'
printf 'Rollback: sudo bash %s/restore.sh\n' "$backup"
ROOT
printf 'Candidate source: %s\n' "$candidate"
