#!/usr/bin/python3
from pathlib import Path
import sqlite3, subprocess
index=Path('/srv/photo/state/index.sqlite')
if index.exists():
    with sqlite3.connect('file:'+str(index)+'?mode=ro',uri=True) as db:
        for source,share,backup in db.execute('SELECT id,share,backup FROM sources'):
            subprocess.run(['sudo','-n','/usr/local/sbin/photo-mount',source,share,'rw' if backup else 'ro'],timeout=30,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
