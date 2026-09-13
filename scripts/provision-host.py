"""Install Photo without modifying other app routes or NAS data."""
from pathlib import Path
import os, shutil, subprocess, json
from datetime import datetime, timezone
base=Path('/srv/photo')
if os.geteuid()!=0: raise SystemExit('Run as root')
subprocess.run(['install','-d','-m','700','/etc/photo'],check=True)
credential=Path('/etc/photo/nas.credentials')
if not credential.exists():
    shutil.copyfile('/etc/note/nas.credentials',credential);credential.chmod(0o600)
subprocess.run(['install','-m','755',str(base/'scripts/photo-mount.py'),'/usr/local/sbin/photo-mount'],check=True)
sudo=Path('/etc/sudoers.d/photo-mount')
sudo.write_text('3chan ALL=(root) NOPASSWD: /usr/local/sbin/photo-mount\n');sudo.chmod(0o440)
subprocess.run(['visudo','-cf',str(sudo)],check=True)
if not (base/'.env').exists():
    status=json.loads(subprocess.check_output(['tailscale','status','--json']))
    login=status['User'][str(status['Self']['UserID'])]['LoginName']
    (base/'.env').write_text('HOST=127.0.0.1\nPORT=8793\nSTATE_DIR=/srv/photo/state\nMOUNT_ROOT=/mnt/photo\nMOUNT_HELPER=/usr/local/sbin/photo-mount\nTAILSCALE_ALLOWED_LOGINS='+login+'\n')
    (base/'.env').chmod(0o600)
subprocess.run(['chown','3chan:3chan',str(base/'.env')],check=True)
subprocess.run(['install','-m','644',str(base/'scripts/photo.service'),'/etc/systemd/system/photo.service'],check=True)
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','enable','--now','photo.service'],check=True)
subprocess.run(['tailscale','serve','--bg','--https=8446','http://127.0.0.1:8793'],check=True)
config=Path('/srv/proxy/Caddyfile');before=config.read_text()
if 'photo.3chan.kr {' not in before:
    stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    shutil.copy2(config,config.with_name('Caddyfile.bak.'+stamp+'-photo'))
    config.write_text(before+'\n# Photo NAS gallery\nphoto.3chan.kr {\n\tencode zstd gzip\n\treverse_proxy photo-web:8794\n}\n')
    result=subprocess.run(['docker','exec','caddy','caddy','validate','--config','/etc/caddy/Caddyfile'],capture_output=True)
    if result.returncode: config.write_text(before);raise SystemExit('Caddy validation failed; restored previous configuration')
subprocess.run(['docker','exec','caddy','caddy','reload','--config','/etc/caddy/Caddyfile'],check=True)
print('Photo service, private Tailscale API and public web route configured.')
