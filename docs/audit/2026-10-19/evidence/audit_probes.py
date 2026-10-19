import uuid
import pyotp
from httpx import AsyncClient, ASGITransport
from tests.conftest import create_user_and_token
from backend.main import app
from backend.database import AsyncSessionLocal
from backend.models.domain_01 import User
from backend.models.domain_03 import ExamSession
from backend.models.domain_04 import IncidentCard

async def test_totp_without_password_is_accepted():
    user, _, _ = await create_user_and_token('TEACHER')
    secret = pyotp.random_base32()
    async with AsyncSessionLocal() as db:
        row = await db.get(User, user.user_id)
        row.totp_secret, row.is_2fa_enabled = secret, True
        await db.commit()
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as c:
        r = await c.post('/api/auth/login/2fa', json={'user_id':user.user_id,'code':pyotp.TOTP(secret).now()})
    assert r.status_code == 200 and r.json()['access_token']

async def test_ldap_role_and_local_shared_password(monkeypatch):
    import backend.api.router_auth as auth
    monkeypatch.setenv('LDAP_ENABLED','true')
    monkeypatch.setattr(auth, 'authenticate_ldap', lambda *args: True)
    name = 'audit_ldap_' + uuid.uuid4().hex
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as c:
        r = await c.post('/api/auth/login',json={'username':name,'password':'directory-secret','role':'admin'})
        assert r.status_code == 200 and r.json()['role'] == 'ADMIN'
        monkeypatch.setattr(auth, 'authenticate_ldap', lambda *args: False)
        r = await c.post('/api/auth/login',json={'username':name,'password':'ldap_provisioned_no_password'})
        assert r.status_code == 200

async def test_foreign_student_password_reset():
    _, _, headers = await create_user_and_token('TEACHER')
    foreign, _, _ = await create_user_and_token('CADET')
    async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test',headers=headers) as c:
        r = await c.post(f'/api/users/{foreign.user_id}/reset-password')
    assert r.status_code == 200 and r.json()['new_password']

async def test_foreign_session_can_be_submitted():
    attacker, _, headers = await create_user_and_token('CADET')
    victim, _, _ = await create_user_and_token('CADET')
    async with AsyncSessionLocal() as db:
        s = ExamSession(cadet_id=victim.user_id,session_type='CALL_SIMULATION',status='ACTIVE')
        db.add(s); await db.commit(); sid=s.session_id
    async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test',headers=headers) as c:
        r = await c.post(f'/api/v2/sessions/{sid}/submit_card',json={'operator_id':attacker.user_id,'filled_data':{},'assigned_services':[]})
    assert r.status_code == 200

async def test_anonymous_status_and_fake_results():
    async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as c:
        assert (await c.get('/api/admin/system_stats')).status_code == 200
        assert (await c.get('/api/v2/asr/status')).status_code == 200
        assert (await c.get('/api/v2/telephony/status/unknown')).status_code == 200
        assert (await c.get('/api/teacher/analytics')).json()['total_evaluations'] == 142
    _, _, headers = await create_user_and_token('TEACHER')
    async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test',headers=headers) as c:
        assert len((await c.get('/api/v1/analytics/sessions/does-not-exist')).json()['cadets'][0]['records']) == 2

async def test_cadet_can_download_teacher_answers():
    from backend.models.domain_02 import GeneratedTicket
    _, _, headers=await create_user_and_token('CADET')
    async with AsyncSessionLocal() as db:
        t=GeneratedTicket(category='audit',subcategory='audit',complexity=1,plot='audit',ground_truth={'secret_answer':'teacher-only'},etalon_services=['04 Газ'])
        db.add(t);await db.commit(); tid=t.id
    async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test',headers=headers) as c:
        r=await c.get(f'/api/v1/tickets/{tid}')
        assert r.status_code == 200 and r.json()['ground_truth']['secret_answer']=='teacher-only'

async def test_teacher_can_reset_admin_via_group():
    from backend.models.domain_01 import StudentGroup
    teacher, _, headers = await create_user_and_token('TEACHER')
    admin, _, _ = await create_user_and_token('ADMIN')
    async with AsyncSessionLocal() as db:
        g=StudentGroup(group_name='audit-group',teacher_id=teacher.user_id)
        db.add(g); await db.commit();gid=g.group_id
    async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test',headers=headers) as c:
        linked=await c.post(f'/api/groups/{gid}/students/single',json={'user_id':admin.user_id})
        assert linked.status_code==200
        reset=await c.post(f'/api/groups/{gid}/reset-passwords')
        assert reset.status_code==200
        assert any(row['user_id']==admin.user_id and row['new_password'] for row in reset.json())

def test_excel_export_treats_name_as_formula():
    from backend.core.reports_engine import generate_excel_from_data
    from openpyxl import load_workbook
    from io import BytesIO
    data=generate_excel_from_data([{'cadet_name':'=1+1','ticket_id':'audit','final_score':50}])
    wb=load_workbook(BytesIO(data))
    assert any(c.data_type=='f' and c.value=='=1+1' for row in wb.active for c in row)
