#!/usr/bin/python3
from pathlib import Path
import sqlite3, subprocess
index=Path('/srv/photo/state/index.sqlite')
if index.exists():
    with sqlite3.connect('file:'+str(index)+'?mode=ro',uri=True) as db:
        columns=[r[1] for r in db.execute('PRAGMA table_info(sources)')]
        where=' WHERE protocol IS NULL' if 'protocol' in columns else ''
        for source,share,backup in db.execute('SELECT id,share,backup FROM sources'+where):
            subprocess.run(['sudo','-n','/usr/local/sbin/photo-mount',source,share,'rw' if backup else 'ro'],timeout=30,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
subprocess.run(['sudo','-n','/usr/local/sbin/photo-nas'],input=b'{"action":"restore"}',timeout=600,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
