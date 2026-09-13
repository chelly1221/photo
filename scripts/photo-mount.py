#!/usr/bin/python3
"""Root-owned, fixed NAS mount helper. The API can choose shares, never hosts/options."""
import os, pwd, re, subprocess, sys
from pathlib import Path

def main():
    if os.geteuid()!=0 or len(sys.argv)!=4: raise SystemExit('Invalid invocation')
    source_id, share, access=sys.argv[1:]
    if not re.fullmatch(r'[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}',source_id): raise SystemExit('Invalid source ID')
    if not share or len(share)>128 or any(c in share for c in '/\\\r\n\0') or share.startswith('-') or access not in ('ro','rw'): raise SystemExit('Invalid share')
    root=Path('/mnt/photo')
    root.mkdir(mode=0o755,exist_ok=True)
    if root.is_symlink() or root.stat().st_uid!=0: raise SystemExit('Invalid mount root')
    target=root/source_id
    target.mkdir(mode=0o755,exist_ok=True)
    if target.is_symlink() or target.resolve()!=target: raise SystemExit('Invalid mount path')
    existing=subprocess.run(['findmnt','-rn','-M',str(target),'-o','SOURCE'],capture_output=True,text=True)
    remote='//100.75.89.101/'+share
    if existing.returncode==0:
        if existing.stdout.strip()!=remote: raise SystemExit('Mount identity mismatch')
        return
    user=pwd.getpwnam('3chan')
    credentials=Path('/etc/photo/nas.credentials')
    if not credentials.exists() or credentials.stat().st_mode & 0o077: raise SystemExit('Private NAS credentials missing')
    options=f'credentials={credentials},vers=3.1.1,seal,{access},uid={user.pw_uid},gid={user.pw_gid},file_mode=0600,dir_mode=0700,nosuid,nodev,noexec,iocharset=utf8'
    subprocess.run(['mount','-t','cifs',remote,str(target),'-o',options],check=True,timeout=25,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

if __name__=='__main__':main()
