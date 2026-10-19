import json, os, secrets, ssl, subprocess, time, urllib.request, urllib.error, uuid
from pathlib import Path
root=Path('/home/orborus/Desktop/hakaton/112-simulator-core')
certs=Path('/tmp/112-audit-20261019/smoke-certs');certs.mkdir(exist_ok=True)
subprocess.run(['bash',str(root/'scripts/generate_certs.sh')],env={**os.environ,'CERT_DIR':str(certs)},check=True,capture_output=True)
tag=uuid.uuid4().hex[:12];network='audit_http_'+tag;back='audit_backend_'+tag;front='audit_frontend_'+tag
created=[]
def docker(*args):return subprocess.check_output(['docker',*args],text=True,stderr=subprocess.STDOUT).strip()
def request(port,path,body=None,token=None,https=False):
    headers={'Content-Type':'application/json'}
    if token:headers['Authorization']='Bearer '+token
    req=urllib.request.Request(f'{"https" if https else "http"}://127.0.0.1:{port}'+path,data=json.dumps(body).encode() if body is not None else None,headers=headers)
    try:
        with urllib.request.urlopen(req,timeout=10,context=ssl._create_unverified_context() if https else None) as response:return response.status,response.read(),response.headers
    except urllib.error.HTTPError as exc:return exc.code,exc.read(),exc.headers
try:
    docker('network','create',network)
    password=secrets.token_urlsafe(24)
    docker('run','-d','--name',back,'--network',network,'--network-alias','backend','-p','127.0.0.1::8000','-e','SECRET_KEY='+secrets.token_hex(32),'-e','INITIAL_ADMIN_PASSWORD='+password,'-e','INITIAL_ADMIN_USERNAME=admin','-e','TESTING=false','simulator_backend:audit-20261019');created.append(back)
    backport=docker('port',back,'8000/tcp').split(':')[-1]
    for attempt in range(60):
        try:
            if request(backport,'/health')[0]==200:break
        except (OSError,urllib.error.URLError):pass
        time.sleep(1)
    else:raise RuntimeError('Backend did not become healthy')
    assert request(backport,'/api/admin/system_stats')[0]==401
    status,data,_=request(backport,'/api/auth/login',{'username':'admin','password':password})
    assert status==200,(status,data)
    token=json.loads(data)['access_token']
    assert request(backport,'/api/admin/healthcheck',token=token)[0]==200
    print('PASS backend non-root startup, fresh SQLite migration, initial ADMIN, login, protected stats')
    docker('run','-d','--name',front,'--network',network,'-p','127.0.0.1::3000','-p','127.0.0.1::443','-v',str(certs)+':/etc/nginx/ssl:ro,z','simulator_frontend:audit-20261019');created.append(front)
    httpport=docker('port',front,'3000/tcp').split(':')[-1];httpsport=docker('port',front,'443/tcp').split(':')[-1]
    for attempt in range(30):
        try:
            if request(httpport,'/login')[0]==200:break
        except (OSError,urllib.error.URLError):pass
        time.sleep(1)
    else:raise RuntimeError('Frontend did not become healthy')
    print(docker('exec',front,'nginx','-t'))
    for path in ('/login','/teacher/analytics','/dds?demo=true','/student/profile'):
        status,body,headers=request(httpport,path)
        assert status==200 and b'<html' in body
        assert headers.get('X-Content-Type-Options')=='nosniff'
    assert request(httpsport,'/login',https=True)[0]==200
    assert request(httpport,'/api/users/me')[0]==401
    assert request(httpport,'/api/users/me',token=token)[0]==200
    print('PASS Nginx HTTP/TLS, four static routes, security header, authenticated API proxy')
    print('Local self-signed certificate checked with explicit test-only trust bypass; public trust not tested.')
except Exception:
    for name in created:
        try:print(docker('logs','--tail','15',name))
        except Exception:pass
    raise
finally:
    for name in reversed(created):
        subprocess.run(['docker','rm','-fv',name],capture_output=True)
    subprocess.run(['docker','network','rm',network],capture_output=True)
