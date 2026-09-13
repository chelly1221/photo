#!/usr/bin/python3
"""Root-owned NAS broker. JSON on stdin; no shell, credentials in argv, or secret output."""
import base64, concurrent.futures, configparser, hashlib, http.client, ipaddress
import json, os, pwd, re, shutil, socket, ssl, subprocess, sys, tempfile, time, uuid
from pathlib import Path

ROOT = Path('/etc/photo/connections')
MOUNTS = Path('/mnt/photo')
RECORDS = Path('/etc/photo/mounts')
NETWORKS = [ipaddress.ip_network(n) for n in ('10.0.0.0/8','172.16.0.0/12','192.168.0.0/16','100.64.0.0/10')]

class NasError(Exception): pass

def host(value):
    try: address=ipaddress.IPv4Address(value)
    except Exception: raise NasError('NAS IPv4 주소를 확인해 주세요.')
    if not any(address in network for network in NETWORKS): raise NasError('사설 네트워크 또는 Tailscale NAS 주소만 연결할 수 있어요.')
    return str(address)

def identifier(value):
    if not isinstance(value,str) or not re.fullmatch(r'[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}',value): raise NasError('연결 정보를 확인해 주세요.')
    return value

def relative(value):
    if not isinstance(value,str) or len(value)>1500 or value.startswith('/') or any(c in value for c in '\\\0\r\n') or any(p in ('.','..') for p in value.split('/')): raise NasError('폴더 경로를 확인해 주세요.')
    return value.rstrip('/')

def run(args, *, data=None, timeout=25):
    result=subprocess.run(args,input=data,capture_output=True,timeout=timeout,check=False)
    if result.returncode: raise NasError('계정 또는 폴더 접근 권한을 확인해 주세요. NAS 연결이 끊겼다면 다시 시도해 주세요.')
    if len(result.stdout)>4*1024*1024: raise NasError('이 폴더의 항목이 너무 많아요. NAS에서 폴더를 나누어 주세요.')
    return result.stdout

def write_private(file,value):
    fd=os.open(file,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w',encoding='utf-8') as stream: stream.write(value)

def connection(value, owner):
    directory=ROOT/identifier(value)
    try: metadata=json.loads((directory/'metadata.json').read_text())
    except Exception: raise NasError('NAS 연결이 만료됐어요. 계정으로 다시 연결해 주세요.')
    if metadata['owner']!=owner: raise NasError('이 NAS 연결에 접근할 수 없어요.')
    if not metadata.get('committed') and time.time()-metadata['created']>3600: raise NasError('NAS 연결이 만료됐어요. 계정으로 다시 연결해 주세요.')
    return directory,metadata

def probe(address, protocol, port, scheme=None):
    label={'smb':'SMB','sftp':'SFTP','webdav':'WebDAV'}[protocol]
    item={'id':f'{protocol}-{port}','protocol':protocol,'port':port,'label':label,'available':True,'secure':protocol=='sftp' or scheme=='https','detail':''}
    try:
        with socket.create_connection((address,port),2): pass
    except OSError: return None
    if protocol=='smb':
        item['detail']='공유 폴더 연결 · 로그인 후 접근 권한을 확인해요.'
    elif protocol=='sftp':
        try:
            try:
                scan=subprocess.run(['ssh-keyscan','-T','2','-t','ed25519,ecdsa,rsa','-p',str(port),address],capture_output=True,timeout=8)
                result=scan.stdout.decode()
            except subprocess.TimeoutExpired as timed_out:
                result=(timed_out.stdout or b'').decode()
            keys=[line for line in result.splitlines() if not line.startswith('#') and len(line.split())==3]
            if not keys:return None
            item['keys']='\n'.join(keys)+'\n'
            key=next((k for k in keys if 'ssh-ed25519' in k),keys[0]).split()[2]
            item['fingerprint']='SHA256:'+base64.b64encode(hashlib.sha256(base64.b64decode(key)).digest()).decode().rstrip('=')
            item['detail']='암호화된 파일 연결 · 처음 선택한 서버 키를 기억해요.'
        except Exception:return None
    else:
        item['scheme']=scheme
        conn=None
        try:
            conn=http.client.HTTPSConnection(address,port,timeout=3,context=ssl.create_default_context()) if scheme=='https' else http.client.HTTPConnection(address,port,timeout=3)
            conn.request('OPTIONS','/')
            response=conn.getresponse()
            dav=response.getheader('DAV')
            if not dav and port not in (5005,5006): return None
            if not dav and response.status not in (200,204,401,403,405): return None
            item['detail']='HTTPS로 보호되는 폴더 연결' if scheme=='https' else 'HTTP 연결 · NAS 구간은 HTTPS 암호화를 사용하지 않아요.'
        except ssl.SSLCertVerificationError:
            item.update(available=False,detail='인증서를 확인할 수 없어요. NAS에 신뢰할 수 있는 인증서를 설정해 주세요.')
        except Exception:return None
        finally:
            if conn:conn.close()
    return item

def discover(address):
    address=host(address)
    targets=[('smb',445,None),('sftp',22,None),('webdav',5006,'https'),('webdav',443,'https'),('webdav',5005,'http'),('webdav',80,'http')]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        results=list(pool.map(lambda args:probe(address,*args),targets))
    return {'options':[item for item in results if item]}

def rclone(directory,args):
    return run(['rclone','--config',str(directory/'rclone.conf'),'--contimeout','5s','--timeout','15s','--retries','1','--low-level-retries','1',*args],timeout=30)

def listing(directory, metadata, path, offset=0):
    path=relative(path)
    # rclone SMB root lists shares; SFTP root is the authenticated account's home.
    data=json.loads(rclone(directory,['lsjson','nas:'+path,'--dirs-only','--no-modtime','--no-mimetype']))
    folders=[]
    for item in data:
        name=item.get('Name','')
        if not item.get('IsDir') or not name or '/' in name or '\\' in name or name in ('.','..') or any(c in name for c in '\0\r\n'): continue
        if metadata['protocol']=='smb' and not path and name.endswith('$'):continue
        folders.append({'name':name,'path':(path+'/' if path else '')+name})
    folders.sort(key=lambda d:d['name'].casefold())
    offset=max(0,int(offset));end=offset+200
    return {'path':path,'folders':folders[offset:end],'next':end if end<len(folders) else None}

def connect(input):
    address=host(input['host']);option=input['option'];protocol=option.get('protocol');port=int(option.get('port',0))
    if (protocol,port) not in (('smb',445),('sftp',22),('webdav',443),('webdav',5006),('webdav',80),('webdav',5005)): raise NasError('지원하는 연결 방식을 선택해 주세요.')
    username=input['username'];password=input['password'];owner=input['owner']
    if not isinstance(username,str) or not 1<=len(username)<=256 or any(c in username for c in '\r\n\0') or not isinstance(password,str) or len(password)>1024 or '\0' in password:raise NasError('NAS 계정 정보를 확인해 주세요.')
    connection_id=str(uuid.uuid4());directory=ROOT/connection_id
    directory.mkdir(mode=0o700)
    try:
        obscured=run(['rclone','obscure','-'],data=password.encode()).decode().strip()
        values={'type':protocol,'user':username,'pass':obscured}
        if protocol in ('smb','sftp'):values.update(host=address,port=str(port))
        if protocol=='smb':
            if '\\' in username:values['domain'],values['user']=username.split('\\',1)
            values['hide_special_share']='true'
        if protocol=='sftp':
            keys=option.get('keys','')
            if not keys or len(keys)>16384:raise NasError('SFTP 서버 키를 다시 확인해 주세요.')
            write_private(directory/'known_hosts',keys)
            values.update(known_hosts_file=str(directory/'known_hosts'),disable_hashcheck='true')
        if protocol=='webdav':
            scheme='https' if port in (443,5006) else 'http'
            values.update(url=f'{scheme}://{address}:{port}/',vendor='other')
        parser=configparser.ConfigParser(interpolation=None);parser['nas']=values
        fd=os.open(directory/'rclone.conf',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w',encoding='utf-8') as stream:parser.write(stream)
        metadata={'host':address,'protocol':protocol,'port':port,'owner':owner,'created':time.time(),'committed':False}
        initial=listing(directory,metadata,'')
        write_private(directory/'metadata.json',json.dumps(metadata))
        return {'connectionId':connection_id,'host':address,'protocol':protocol,'listing':initial}
    except Exception:
        shutil.rmtree(directory)
        raise

def mount(input):
    directory,metadata=connection(input['connectionId'],input['owner'])
    selected=relative(input['path']);source_id=identifier(input['sourceId']);backup=input.get('backup') is True
    if metadata['protocol']=='smb' and not selected:raise NasError('연결할 공유 폴더를 선택해 주세요.')
    listing(directory,metadata,selected) # Authenticated directory access, before committing the source.
    MOUNTS.mkdir(mode=0o755,exist_ok=True)
    if MOUNTS.is_symlink() or MOUNTS.stat().st_uid!=0:raise NasError('서버 마운트 경로를 확인해 주세요.')
    target=MOUNTS/source_id;target.mkdir(mode=0o755,exist_ok=True)
    if target.is_symlink() or target.resolve()!=target or target.stat().st_uid!=0:raise NasError('서버 마운트 경로를 확인해 주세요.')
    identity='photo-'+source_id
    existing=subprocess.run(['findmnt','-rn','-M',str(target),'-o','SOURCE'],capture_output=True,text=True)
    if existing.returncode==0:
        if existing.stdout.strip()!=identity:raise NasError('마운트 정보가 일치하지 않아요.')
    else:
        user=pwd.getpwnam('3chan')
        args=['mount','nas:'+selected,str(target),'--allow-other','--uid',str(user.pw_uid),'--gid',str(user.pw_gid),'--file-perms','0600','--dir-perms','0700','--umask','077','--vfs-cache-mode','off','--dir-cache-time','10s','--buffer-size','4M','--vfs-read-chunk-size','4M','--vfs-read-chunk-size-limit','32M','--devname',identity,'--log-level','ERROR']
        if not backup:args+=['--read-only']
        unit='photo-nas-'+source_id
        # Separate service lifetime: an API restart must not kill FUSE mounts.
        run(['systemd-run','--quiet','--collect','--unit='+unit,'--property=Restart=on-failure','--property=RestartSec=5','--property=MemoryMax=256M','--property=CPUQuota=100%','--property=StandardOutput=null','--property=StandardError=null','rclone','--config',str(directory/'rclone.conf'),'--contimeout','5s','--timeout','15s',*args])
        ready=False
        for _ in range(60):
            status=subprocess.run(['findmnt','-rn','-M',str(target),'-o','SOURCE'],capture_output=True,text=True)
            if status.returncode==0 and status.stdout.strip()==identity:ready=True;break
            time.sleep(.2)
        if not ready:
            subprocess.run(['systemctl','stop',unit],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            raise NasError('폴더를 연결하지 못했어요. NAS 연결 상태를 확인한 뒤 다시 시도해 주세요.')
    record=RECORDS/(source_id+'.json')
    if not record.exists():write_private(record,json.dumps({key:input[key] for key in ('owner','connectionId','path','sourceId','backup')}))
    metadata['committed']=True
    (directory/'metadata.json').write_text(json.dumps(metadata))
    return {'host':metadata['host'],'protocol':metadata['protocol'],'path':selected}

def cleanup():
    for directory in ROOT.iterdir():
        if not directory.is_dir() or directory.is_symlink():continue
        try:
            meta=json.loads((directory/'metadata.json').read_text())
            if not meta.get('committed') and time.time()-meta['created']>3600:shutil.rmtree(directory)
        except (OSError,ValueError,KeyError):pass

def main(input):
    action=input.get('action')
    if action=='discover':return discover(input['host'])
    if action=='connect':cleanup();return connect(input)
    if action=='browse':
        directory,meta=connection(input['connectionId'],input['owner'])
        return listing(directory,meta,input.get('path',''),input.get('offset',0))
    if action=='mount':return mount(input)
    if action=='forget':
        directory,meta=connection(input['connectionId'],input['owner'])
        if not meta.get('committed'):shutil.rmtree(directory)
        return {'ok':True}
    if action=='restore':
        restored=0
        for file in RECORDS.glob('*.json'):
            try:mount(json.loads(file.read_text()));restored+=1
            except Exception:pass
        return {'restored':restored}
    raise NasError('지원하지 않는 NAS 작업이에요.')

if __name__=='__main__':
    try:
        if os.geteuid()!=0:raise NasError('서버 NAS 연결 도우미 권한을 확인해 주세요.')
        os.umask(0o077)
        ROOT.mkdir(mode=0o700,parents=True,exist_ok=True);RECORDS.mkdir(mode=0o700,parents=True,exist_ok=True)
        payload=sys.stdin.read(32769)
        if len(payload)>32768:raise NasError('NAS 요청이 너무 커요.')
        print(json.dumps(main(json.loads(payload)),ensure_ascii=False))
    except NasError as error:print(json.dumps({'error':str(error)},ensure_ascii=False))
    except Exception:print(json.dumps({'error':'NAS 연결에 실패했어요. 주소·계정·폴더 권한을 확인해 주세요.'},ensure_ascii=False))
