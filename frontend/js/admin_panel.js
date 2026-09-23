/**
 * Admin Panel & System Resource Monitor Controller
 * Google System-112 Simulator Administration
 */

const AdminState = {
  activeTab: 'users',
  users: [],
  auditLogs: [],
  filteredLogs: [],
  backups: [],
  statsInterval: null,
  filters: {
    user: 'all',
    action: 'all',
    search: ''
  }
};

document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initTabs();
  loadUsers();
  loadAuditLogs();
  loadBackups();
  loadSystemStats();
  startStatsPolling();
});

function initClock() {
  const clockEl = document.getElementById('admin-clock');
  if (!clockEl) return;
  const update = () => {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('ru-RU') + ' MSK';
  };
  update();
  setInterval(update, 1000);
}

function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      switchTab(target);
    });
  });
}

function switchTab(tabId) {
  AdminState.activeTab = tabId;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `view-${tabId}`);
  });

  if (tabId === 'stats') {
    loadSystemStats();
  } else if (tabId === 'audit') {
    loadAuditLogs();
  } else if (tabId === 'backup') {
    loadBackups();
  }
}

// ==========================================
// 1. RBAC & USER MANAGEMENT
// ==========================================

async function loadUsers() {
  try {
    const res = await fetch('/api/admin/users');
    const data = await res.json();
    AdminState.users = data.users || [];
    renderUsersTable();
    populateAuditUserFilter();
  } catch (err) {
    console.error('Failed to load users:', err);
  }
}

function renderUsersTable() {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;

  tbody.innerHTML = AdminState.users.map(u => `
    <tr>
      <td>
        <div style="font-weight: 700; font-family: monospace; color: var(--accent-blue);">${escapeHtml(u.username)}</div>
      </td>
      <td>
        <strong>${escapeHtml(u.full_name)}</strong>
      </td>
      <td>
        ${getRoleBadge(u.role)}
      </td>
      <td>
        <span style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(u.service || '112')}</span>
      </td>
      <td>
        <span class="status-pill ${u.status === 'active' ? 'status-active' : 'status-inactive'}">
          ${u.status === 'active' ? '● Активен' : '○ Отключен'}
        </span>
      </td>
      <td style="text-align: right;">
        <button class="btn btn-secondary btn-sm" onclick="openEditUserModal('${u.username}')">✏️</button>
        ${u.username !== 'admin' ? `
          <button class="btn-danger-sm" onclick="deleteUser('${u.username}')">🗑️</button>
        ` : ''}
      </td>
    </tr>
  `).join('');
}

function getRoleBadge(role) {
  switch (role) {
    case 'admin':
      return '<span class="role-badge role-admin">🛡️ Администратор</span>';
    case 'instructor':
      return '<span class="role-badge role-instructor">🎓 Преподаватель</span>';
    case 'operator':
      return '<span class="role-badge role-operator">🎧 Курсант 112</span>';
    case 'dds':
      return '<span class="role-badge role-dds">🚒 Диспетчер ДДС</span>';
    default:
      return `<span class="role-badge">${role}</span>`;
  }
}

function openAddUserModal() {
  document.getElementById('modal-user-title').textContent = 'Добавить пользователя (RBAC)';
  document.getElementById('user-form-username').value = '';
  document.getElementById('user-form-username').disabled = false;
  document.getElementById('user-form-fullname').value = '';
  document.getElementById('user-form-role').value = 'operator';
  document.getElementById('user-form-service').value = 'Служба 112 Москвы';
  document.getElementById('user-form-status').value = 'active';

  document.getElementById('user-modal').style.display = 'flex';
}

function openEditUserModal(username) {
  const u = AdminState.users.find(item => item.username === username);
  if (!u) return;

  document.getElementById('modal-user-title').textContent = `Редактирование: ${username}`;
  document.getElementById('user-form-username').value = u.username;
  document.getElementById('user-form-username').disabled = true;
  document.getElementById('user-form-fullname').value = u.full_name;
  document.getElementById('user-form-role').value = u.role;
  document.getElementById('user-form-service').value = u.service;
  document.getElementById('user-form-status').value = u.status;

  document.getElementById('user-modal').style.display = 'flex';
}

function closeUserModal() {
  document.getElementById('user-modal').style.display = 'none';
}

async function saveUserFromModal() {
  const username = document.getElementById('user-form-username').value.trim();
  const fullName = document.getElementById('user-form-fullname').value.trim();
  const role = document.getElementById('user-form-role').value;
  const service = document.getElementById('user-form-service').value.trim();
  const status = document.getElementById('user-form-status').value;

  if (!username || !fullName) {
    alert('Заполните логин и ФИО пользователя');
    return;
  }

  try {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        full_name: fullName,
        role,
        service,
        status
      })
    });
    const data = await res.json();
    if (data.success) {
      AdminState.users = data.users;
      renderUsersTable();
      closeUserModal();
      loadAuditLogs();
    }
  } catch (err) {
    alert('Ошибка сохранения пользователя');
  }
}

async function deleteUser(username) {
  if (!confirm(`Удалить учетную запись «${username}»?`)) return;

  try {
    const res = await fetch(`/api/admin/users/${username}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      AdminState.users = data.users;
      renderUsersTable();
      loadAuditLogs();
    }
  } catch (err) {
    alert('Ошибка при удалении пользователя');
  }
}

// ==========================================
// 2. AUDIT LOG & EVENT MONITOR
// ==========================================

async function loadAuditLogs() {
  try {
    const res = await fetch('/api/admin/audit?limit=100');
    const data = await res.json();
    AdminState.auditLogs = data.logs || [];
    filterAuditLogs();
  } catch (err) {
    console.error('Failed to load audit logs:', err);
  }
}

function populateAuditUserFilter() {
  const select = document.getElementById('audit-filter-user');
  if (!select) return;

  const users = Array.from(new Set(AdminState.users.map(u => u.username)));
  select.innerHTML = '<option value="all">Все пользователи</option>' + 
    users.map(u => `<option value="${u}">${u}</option>`).join('');
}

function filterAuditLogs() {
  const uFilter = AdminState.filters.user;
  const aFilter = AdminState.filters.action;
  const q = AdminState.filters.search.toLowerCase().trim();

  AdminState.filteredLogs = AdminState.auditLogs.filter(log => {
    const matchUser = uFilter === 'all' || log.username === uFilter;
    const matchAction = aFilter === 'all' || (log.action || '').includes(aFilter);
    const matchQuery = !q || 
      (log.username || '').toLowerCase().includes(q) ||
      (log.action || '').toLowerCase().includes(q) ||
      (log.details || '').toLowerCase().includes(q);

    return matchUser && matchAction && matchQuery;
  });

  renderAuditTable();
}

function renderAuditTable() {
  const tbody = document.getElementById('audit-tbody');
  if (!tbody) return;

  if (AdminState.filteredLogs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; padding: 32px; color: var(--text-muted);">
          События не найдены
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = AdminState.filteredLogs.map(item => {
    const d = new Date(item.timestamp * 1000);
    const dateStr = d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU');

    return `
      <tr>
        <td style="font-family: monospace; font-size: 12px; color: var(--text-muted); white-space: nowrap;">
          ${dateStr}
        </td>
        <td>
          <span style="font-weight: 700; color: var(--accent-blue);">${escapeHtml(item.username)}</span>
        </td>
        <td>
          ${getActionBadge(item.action)}
        </td>
        <td style="font-size: 12px; color: var(--text-secondary); max-width: 500px;">
          ${escapeHtml(item.details)}
        </td>
      </tr>
    `;
  }).join('');
}

function getActionBadge(action) {
  let cls = 'var(--text-secondary)';
  let bg = 'rgba(255,255,255,0.05)';
  if (action.includes('start_call') || action.includes('submit_card')) {
    cls = 'var(--accent-blue)';
    bg = 'rgba(88, 166, 255, 0.15)';
  } else if (action.includes('backup')) {
    cls = 'var(--accent-green)';
    bg = 'rgba(63, 185, 80, 0.15)';
  } else if (action.includes('delete') || action.includes('refusal')) {
    cls = 'var(--accent-admin)';
    bg = 'rgba(248, 81, 73, 0.15)';
  } else if (action.includes('teacher')) {
    cls = 'var(--accent-purple)';
    bg = 'rgba(188, 140, 255, 0.15)';
  }

  return `<span style="font-family: monospace; font-size: 11px; padding: 2px 7px; border-radius: 4px; color: ${cls}; background: ${bg}; font-weight: 600;">${action}</span>`;
}

// ==========================================
// 3. SYSTEM HARDWARE RESOURCE MONITOR
// ==========================================

function startStatsPolling() {
  if (AdminState.statsInterval) clearInterval(AdminState.statsInterval);
  AdminState.statsInterval = setInterval(() => {
    if (AdminState.activeTab === 'stats') {
      loadSystemStats();
    }
  }, 3000);
}

async function loadSystemStats() {
  try {
    const res = await fetch('/api/admin/system_stats');
    const data = await res.json();
    renderSystemStats(data);
  } catch (err) {
    console.error('Stats error:', err);
  }
}

function renderSystemStats(stats) {
  if (!stats) return;

  // CPU
  const cpuVal = document.getElementById('stat-cpu-val');
  const cpuBar = document.getElementById('stat-cpu-bar');
  if (cpuVal && cpuBar) {
    const cpu = Math.round(stats.cpu_usage_percent || 0);
    cpuVal.textContent = cpu + '%';
    cpuBar.style.width = cpu + '%';
    cpuBar.style.backgroundColor = cpu > 80 ? 'var(--accent-admin)' : (cpu > 50 ? 'var(--accent-orange)' : 'var(--accent-green)');
  }

  // Memory
  const memVal = document.getElementById('stat-mem-val');
  const memBar = document.getElementById('stat-mem-bar');
  const memSub = document.getElementById('stat-mem-sub');
  if (memVal && memBar) {
    const mem = Math.round(stats.memory_usage_percent || 0);
    memVal.textContent = mem + '%';
    memBar.style.width = mem + '%';
    memBar.style.backgroundColor = mem > 85 ? 'var(--accent-admin)' : (mem > 60 ? 'var(--accent-orange)' : 'var(--accent-cyan)');
    if (memSub) memSub.textContent = `${stats.memory_used_mb} МБ / ${stats.memory_total_mb} МБ`;
  }

  // Sockets & Latency
  const sockVal = document.getElementById('stat-sockets-val');
  if (sockVal) sockVal.textContent = stats.active_sockets;

  const pingVal = document.getElementById('stat-ping-val');
  if (pingVal) pingVal.textContent = stats.response_time_ms + ' мс';

  // Database size & Uptime
  const dbVal = document.getElementById('stat-db-val');
  if (dbVal) dbVal.textContent = stats.database_size_kb + ' КБ';

  const uptimeVal = document.getElementById('stat-uptime-val');
  if (uptimeVal) {
    const s = stats.server_uptime_seconds || 0;
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    uptimeVal.textContent = `${hrs}ч ${mins}м ${secs}с`;
  }
}

// ==========================================
// 4. DATA BACKUP EMULATION
// ==========================================

async function loadBackups() {
  try {
    const res = await fetch('/api/admin/backups');
    const data = await res.json();
    AdminState.backups = data.backups || [];
    renderBackupsTable();
  } catch (err) {
    console.error('Failed to load backups:', err);
  }
}

function renderBackupsTable() {
  const tbody = document.getElementById('backups-tbody');
  if (!tbody) return;

  if (AdminState.backups.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 24px; color: var(--text-muted);">
          Резервные копии еще не создавались
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = AdminState.backups.map(b => `
    <tr>
      <td>
        <span style="font-family: monospace; font-weight: 700; color: var(--accent-blue);">${escapeHtml(b.filename)}</span>
      </td>
      <td>${b.size_kb} КБ</td>
      <td>${b.created_at}</td>
      <td>
        <span class="status-pill status-active">Целостность проверена</span>
      </td>
      <td style="text-align: right;">
        <button class="btn btn-secondary btn-sm" onclick="simulateRestoreBackup('${b.filename}')">
          🔄 Восстановить
        </button>
      </td>
    </tr>
  `).join('');
}

async function triggerBackupCreation() {
  const btn = document.getElementById('btn-create-backup');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '⏳ Резервное копирование SQLite...';
  }

  try {
    const res = await fetch('/api/admin/backup', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert(`Резервная копия создана!\nФайл: ${data.backup_filename}\nРазмер: ${data.size_kb} КБ\nКонтрольная сумма: ${data.checksum}`);
      loadBackups();
      loadAuditLogs();
    }
  } catch (err) {
    alert('Ошибка создания бэкапа');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '💾 Создать резервную копию базы данных';
    }
  }
}

function simulateRestoreBackup(filename) {
  if (confirm(`Восстановить состояние тренажера из копии «${filename}»?`)) {
    alert(`Состояние базы данных успешно восстановлено из архива ${filename}!`);
    loadUsers();
    loadAuditLogs();
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function uploadScenarios(inputElement) {
    if (!inputElement.files.length) return;
    const file = inputElement.files[0];
    const formData = new FormData();
    formData.append("file", file);
    try {
        const res = await fetch("/api/teacher/scenarios/import", {
            method: "POST",
            body: formData,
            headers: { "X-User-Role": "admin" }
        });
        const json = await res.json();
        if (json.success) {
            alert(`Успех: импортировано ${json.imported_count} сценариев.`);
        } else {
            alert(`Ошибка импорта: ${json.detail}`);
        }
    } catch (e) {
        alert(`Ошибка загрузки: ${e}`);
    }
}
