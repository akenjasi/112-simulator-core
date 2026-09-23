/**
 * Teacher Dashboard & Human-in-the-Loop Controller
 * Google System-112 Training Simulator (Moscow Emergency Operations Center)
 */

// Global State
const TeacherState = {
  activeTab: 'tickets',
  selectedCategory: 'all',
  searchQuery: '',
  allTickets: [],
  filteredTickets: [],
  selectedTicket: null,
  selectedQuestion: null,
  activeSessions: [],
  monitoringInterval: null,
  currentSessionForModal: null,
  analyticsData: null,
  selectedCadet: null,
  currentOverrideEvalId: null,
  currentOverrideEval: null,
  customScenario: {
    situation: '',
    address: 'Москва, Тверская ул., д. 13',
    caller_name: 'Заявитель происшествия',
    caller_phone: '+7 (916) 555-11-22',
    category: 'Пожары',
    expected_group: 'пожар на объекте',
    feature1: 'на улице',
    feature2: 'мусор',
    feature3: 'открытое пламя',
    final_type: 'пожар: мусор',
    has_victims: false,
    expected_services: ['Служба 101', 'ЦОДД'],
    panic_level: 75,
    sla_seconds: 75
  }
};

// Available services in Moscow 112
const ALL_SERVICES = [
  'Служба 101',
  'Служба 102',
  'Служба 103',
  'Служба 104',
  'ЦОДД',
  'ЦЭМП',
  'МГПСС',
  'Мослифт',
  'Мосводоканал',
  'Росгвардия',
  'Управа района / Префектура'
];

// Presets for Scenario Generator
const SCENARIO_PRESETS = [
  {
    title: '🔥 Пожар на складе',
    plot: 'Горит склад лакокрасочных материалов на Варшавском шоссе, 125. Сильное открытое пламя, внутри могут находиться двое рабочих!',
    address: 'Москва, Варшавское ш., д. 125'
  },
  {
    title: '🚗 ДТП на МКАД с зажатыми',
    plot: 'Лобовое столкновение фуры и легкового автомобиля на 34-м км МКАД. Водитель заблокирован в салоне без сознания, сильная течь топлива!',
    address: 'Москва, МКАД, 34-й км'
  },
  {
    title: '⚠️ Утечка газа в подъезде',
    plot: 'Резкий запах газа в подъезде 5-этажного дома на Профсоюзной улице. Жильцы жалуются на головную боль, шипение около трубы на 1 этаже.',
    address: 'Москва, Профсоюзная ул., д. 24'
  },
  {
    title: '🌊 Человек на льдине',
    plot: 'В районе набережной Тараса Шевченко оторвало льдину с человеком, несет вниз по течению Москвы-реки, кричит о помощи!',
    address: 'Москва, наб. Тараса Шевченко, напротив д. 12'
  },
  {
    title: '🛗 Застревание в лифте',
    plot: 'Остановка лифта между 7 и 8 этажами в жилом доме на Ленинском проспекте. В кабине беременная женщина и ребенок, жарко, духота.',
    address: 'Москва, Ленинский просп., д. 82'
  }
];

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initTabs();
  loadTickets();
  loadAnalytics();
  initPresetButtons();
  initHITLEditor();
  startLiveMonitoring();
});

// Real-time Clock
function initClock() {
  const clockEl = document.getElementById('system-clock');
  if (!clockEl) return;
  const update = () => {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('ru-RU') + ' MSK';
  };
  update();
  setInterval(update, 1000);
}

// Navigation Tabs
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
  TeacherState.activeTab = tabId;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.view-panel').forEach(panel => {
    const isActive = panel.id === `view-${tabId}`;
    panel.classList.toggle('active', isActive);
    panel.style.display = isActive ? 'block' : 'none';
  });

  if (tabId === 'monitoring') {
    refreshMonitoringSessions();
  } else if (tabId === 'analytics') {
    loadAnalytics();
  }
}

// ==========================================
// 1. TICKET SELECTOR & CATEGORIES (32 TICKETS)
// ==========================================

function classifyTicketCategory(category, situation) {
  const s = ((category || '') + ' ' + (situation || '')).toLowerCase();
  if (s.includes('газ') || s.includes('утечка')) return 'gas';
  if (s.includes('вод') || s.includes('утоп') || s.includes('лед') || s.includes('льдин')) return 'water';
  if (s.includes('пожар') || s.includes('задымл') || s.includes('горит') || s.includes('плам')) return 'fires';
  if (s.includes('дтп') || s.includes('авари') || s.includes('наезд') || s.includes('столкнов')) return 'dtp';
  if (s.includes('медицин') || s.includes('скора') || s.includes('болит') || s.includes('упал') || s.includes('инфаркт') || s.includes('инсульт') || s.includes('ребенок')) return 'medicine';
  return 'utilities';
}

function getCategoryBadge(catKey) {
  switch (catKey) {
    case 'fires': return '<span class="ticket-cat-badge cat-fires">🔥 Пожары</span>';
    case 'dtp': return '<span class="ticket-cat-badge cat-dtp">🚗 ДТП</span>';
    case 'medicine': return '<span class="ticket-cat-badge cat-medicine">🚑 Медицина</span>';
    case 'gas': return '<span class="ticket-cat-badge cat-gas">⚠️ Газ</span>';
    case 'water': return '<span class="ticket-cat-badge cat-water">🌊 ЧС на воде</span>';
    default: return '<span class="ticket-cat-badge cat-utilities">🏙️ ЖКХ</span>';
  }
}

async function loadTickets() {
  try {
    const res = await fetch('/api/tickets');
    const data = await res.json();
    TeacherState.allTickets = data.tickets || [];
    filterTickets();
  } catch (err) {
    console.error('Failed to load tickets:', err);
    showToast('Ошибка загрузки экзаменационных билетов', 'error');
  }
}

function filterTickets() {
  const cat = TeacherState.selectedCategory;
  const q = TeacherState.searchQuery.toLowerCase().trim();

  TeacherState.filteredTickets = TeacherState.allTickets.filter(ticket => {
    // Ticket level category matches if any question matches
    const questions = ticket.questions || [];
    const matchesCat = cat === 'all' || questions.some(qst => {
      return classifyTicketCategory(qst.category, qst.situation) === cat;
    });

    const matchesQuery = !q || 
      `билет ${ticket.ticket_id}`.includes(q) ||
      `№${ticket.ticket_id}`.includes(q) ||
      questions.some(qst => 
        (qst.situation || '').toLowerCase().includes(q) ||
        (qst.address || '').toLowerCase().includes(q) ||
        (qst.category || '').toLowerCase().includes(q)
      );

    return matchesCat && matchesQuery;
  });

  renderTicketsGrid();
}

function setCategoryFilter(cat) {
  TeacherState.selectedCategory = cat;
  document.querySelectorAll('.filter-chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.category === cat);
  });
  filterTickets();
}

function renderTicketsGrid() {
  const grid = document.getElementById('tickets-grid');
  if (!grid) return;

  if (TeacherState.filteredTickets.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 48px; color: var(--text-muted);">
        Билеты по выбранным фильтрам не найдены.
      </div>
    `;
    return;
  }

  grid.innerHTML = TeacherState.filteredTickets.map(ticket => {
    const questions = ticket.questions || [];
    const firstQ = questions[0] || {};
    const catKey = classifyTicketCategory(firstQ.category, firstQ.situation);
    
    // Check if it is an official ticket
    const isOfficial = ticket.ticket_id >= 1 && ticket.ticket_id <= 32;

    return `
      <div class="ticket-card" id="ticket-card-${ticket.ticket_id}">
        <div class="ticket-card-header">
          <span class="ticket-num-badge">Экзаменационный билет №${ticket.ticket_id}</span>
          ${getCategoryBadge(catKey)}
        </div>
        
        ${isOfficial ? `<div style="margin-bottom: 12px; font-size: 11px; font-weight: 700; color: #d29922; background: rgba(210, 153, 34, 0.1); padding: 4px 8px; border-radius: 4px; border: 1px solid rgba(210, 153, 34, 0.2);">🔒 Официальный билет программы 112 (Эталон защищён)</div>` : ''}
        
        <div class="ticket-questions-list">
          ${questions.map(q => `
            <div class="ticket-q-item ${q.has_victims ? 'has-victims' : ''}">
              <div class="q-title">Вопрос №${q.id}: ${q.category || 'Происшествие'}</div>
              <div class="q-situation">${escapeHtml(q.situation || '')}</div>
              <div style="margin-top: 6px; font-size: 11px; color: var(--text-muted); display: flex; justify-content: space-between;">
                <span>📍 ${escapeHtml(q.address || 'Москва')}</span>
                <span>🚨 ${q.has_victims ? 'Есть пострадавшие' : 'Без пострадавших'}</span>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="ticket-card-actions">
          <button class="btn btn-primary btn-sm" onclick="startCadetTraining(${ticket.ticket_id}, 1)">
            ▶ Запустить тренировку
          </button>
          ${isOfficial 
            ? `<button class="btn btn-secondary btn-sm" disabled style="opacity: 0.5; cursor: not-allowed;" title="Официальный экзаменационный билет защищён от изменений. Чтобы изменить фабулу, используйте кнопку 'Создать свой сценарий'">
                 🔒 Редактировать эталон
               </button>`
            : `<button class="btn btn-secondary btn-sm" onclick="openHITLForTicket(${ticket.ticket_id}, 1)">
                 ✏️ Редактировать эталон
               </button>`
          }
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// 2. SCENARIO GENERATOR & HITL EDITOR
// ==========================================

function initPresetButtons() {
  const container = document.getElementById('preset-pills');
  if (!container) return;

  container.innerHTML = SCENARIO_PRESETS.map((p, idx) => `
    <button class="preset-pill" onclick="loadPresetScenario(${idx})">${p.title}</button>
  `).join('');
}

function loadPresetScenario(idx) {
  const preset = SCENARIO_PRESETS[idx];
  if (!preset) return;
  const plotInput = document.getElementById('gen-plot-text');
  const addrInput = document.getElementById('gen-address');
  if (plotInput) plotInput.value = preset.plot;
  if (addrInput) addrInput.value = preset.address;
  autoCalculateGroundTruth();
}

async function autoCalculateGroundTruth() {
  const plotText = document.getElementById('gen-plot-text')?.value || '';
  const address = document.getElementById('gen-address')?.value || 'Москва, Тверская ул., д. 13';

  if (!plotText.trim()) {
    showToast('Введите фабулу происшествия для генерации', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/scenarios/auto_generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plot_text: plotText, default_address: address })
    });
    const data = await res.json();
    const sc = data.scenario;

    // Populate HITL Editor with calculated Ground Truth
    TeacherState.customScenario = {
      ...sc,
      situation: plotText,
      address: address
    };
    syncHITLForm();
    showToast('Эталон происшествия успешно рассчитан алгоритмом!', 'success');
  } catch (err) {
    console.error('Error calculating ground truth:', err);
    showToast('Ошибка расчета эталона', 'error');
  }
}

function initHITLEditor() {
  // Render service checkboxes
  const srvGrid = document.getElementById('services-checkbox-grid');
  if (srvGrid) {
    srvGrid.innerHTML = ALL_SERVICES.map(svc => `
      <label class="service-chip-checkbox" id="svc-chk-${svc.replace(/[^a-zA-Z0-9]/g, '')}">
        <input type="checkbox" value="${svc}" onchange="toggleServiceSelection('${svc}')" style="accent-color: var(--accent-green);">
        ${svc}
      </label>
    `).join('');
  }

  // Panic slider sync
  const panicSlider = document.getElementById('hitl-panic-slider');
  const panicDisplay = document.getElementById('hitl-panic-val');
  if (panicSlider && panicDisplay) {
    panicSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      TeacherState.customScenario.panic_level = val;
      panicDisplay.textContent = val + '%';
      panicDisplay.className = 'panic-meter-display ' + (val > 65 ? 'panic-high' : (val > 40 ? 'panic-mid' : 'panic-low'));
    });
  }

  // SLA slider sync
  const slaSlider = document.getElementById('hitl-sla-slider');
  const slaDisplay = document.getElementById('hitl-sla-val');
  if (slaSlider && slaDisplay) {
    slaSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      TeacherState.customScenario.sla_seconds = val;
      slaDisplay.textContent = val + ' сек';
    });
  }
}

function syncHITLForm() {
  const sc = TeacherState.customScenario;
  if (!sc) return;

  const f1 = document.getElementById('hitl-feature1');
  const f2 = document.getElementById('hitl-feature2');
  const f3 = document.getElementById('hitl-feature3');
  const ft = document.getElementById('hitl-final-type');
  const victimsChk = document.getElementById('hitl-victims');
  const panicSlider = document.getElementById('hitl-panic-slider');
  const panicDisplay = document.getElementById('hitl-panic-val');
  const slaSlider = document.getElementById('hitl-sla-slider');
  const slaDisplay = document.getElementById('hitl-sla-val');

  if (f1) f1.value = sc.feature1 || '';
  if (f2) f2.value = sc.feature2 || '';
  if (f3) f3.value = sc.feature3 || '';
  if (ft) ft.value = sc.final_type || '';
  if (victimsChk) victimsChk.checked = !!sc.has_victims;

  if (panicSlider && panicDisplay) {
    panicSlider.value = sc.panic_level || 75;
    panicDisplay.textContent = (sc.panic_level || 75) + '%';
    const val = sc.panic_level || 75;
    panicDisplay.className = 'panic-meter-display ' + (val > 65 ? 'panic-high' : (val > 40 ? 'panic-mid' : 'panic-low'));
  }

  if (slaSlider && slaDisplay) {
    slaSlider.value = sc.sla_seconds || 75;
    slaDisplay.textContent = (sc.sla_seconds || 75) + ' сек';
  }

  // Services selection chips
  const expected = sc.expected_services || [];
  ALL_SERVICES.forEach(svc => {
    const safeId = svc.replace(/[^a-zA-Z0-9]/g, '');
    const chip = document.getElementById(`svc-chk-${safeId}`);
    if (chip) {
      const isChecked = expected.includes(svc);
      const input = chip.querySelector('input');
      if (input) input.checked = isChecked;
      chip.classList.toggle('checked', isChecked);
    }
  });
}

function toggleServiceSelection(serviceName) {
  const list = TeacherState.customScenario.expected_services || [];
  const idx = list.indexOf(serviceName);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.push(serviceName);
  }
  TeacherState.customScenario.expected_services = list;

  const safeId = serviceName.replace(/[^a-zA-Z0-9]/g, '');
  const chip = document.getElementById(`svc-chk-${safeId}`);
  if (chip) {
    chip.classList.toggle('checked', idx < 0);
  }
}

function openHITLForTicket(ticketId, questionId) {
  const ticket = TeacherState.allTickets.find(t => t.ticket_id === ticketId);
  if (!ticket) return;
  const q = (ticket.questions || []).find(item => item.id === questionId) || ticket.questions[0];
  if (!q) return;

  TeacherState.customScenario = {
    ticket_id: ticketId,
    question_id: questionId,
    situation: q.situation,
    address: q.address || 'Москва, Тверская ул., д. 13',
    caller_name: q.caller_name || 'Заявитель',
    caller_phone: q.caller_phone || '+7 (916) 000-00-00',
    category: q.category || 'Пожары',
    expected_group: q.expected_group || 'оперативное реагирование',
    feature1: q.feature1 || 'на улице',
    feature2: q.feature2 || 'мусор',
    feature3: q.feature3 || 'открытое пламя',
    final_type: q.final_type || 'пожар',
    has_victims: !!q.has_victims,
    expected_services: q.expected_services || ['Служба 101'],
    panic_level: q.panic_level || 75,
    sla_seconds: q.sla_seconds || 75
  };

  const plotInput = document.getElementById('gen-plot-text');
  const addrInput = document.getElementById('gen-address');
  if (plotInput) plotInput.value = q.situation;
  if (addrInput) addrInput.value = q.address;

  switchTab('generator');
  syncHITLForm();
  showToast(`Загружен эталон Билета №${ticketId} для редактирования`, 'info');
}

async function saveCustomScenario() {
  // Collect values from form
  const sc = TeacherState.customScenario;
  sc.feature1 = document.getElementById('hitl-feature1')?.value || sc.feature1;
  sc.feature2 = document.getElementById('hitl-feature2')?.value || sc.feature2;
  sc.feature3 = document.getElementById('hitl-feature3')?.value || sc.feature3;
  sc.final_type = document.getElementById('hitl-final-type')?.value || sc.final_type;
  sc.has_victims = document.getElementById('hitl-victims')?.checked || false;
  sc.situation = document.getElementById('gen-plot-text')?.value || sc.situation;
  sc.address = document.getElementById('gen-address')?.value || sc.address;

  try {
    const res = await fetch('/api/scenarios/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sc)
    });
    const data = await res.json();
    if (data.success) {
      showToast('Эталон успешно сохранен в базе тренировочных сценариев!', 'success');
    }
  } catch (err) {
    console.error('Save scenario error:', err);
    showToast('Ошибка сохранения сценария', 'error');
  }
}

async function startCadetTrainingWithCustom() {
  await saveCustomScenario();
  startCadetTraining(999, 1, TeacherState.customScenario);
}

async function startCadetTraining(ticketId, questionId = 1, customData = null) {
  try {
    const payload = {
      ticket_id: ticketId,
      question_id: questionId,
      operator_name: 'Курсант Иванов И.И.',
      custom_scenario: customData
    };
    const res = await fetch('/api/session/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.session_id) {
      showToast(`Сессия тренировки #${ticketId} запущена! ID: ${data.session_id}`, 'success');
      switchTab('monitoring');
      refreshMonitoringSessions();
    }
  } catch (err) {
    console.error('Error starting session:', err);
    showToast('Ошибка старта сессии тренировки', 'error');
  }
}

// ==========================================
// 3. REAL-TIME CADET SESSION MONITORING
// ==========================================

function startLiveMonitoring() {
  if (TeacherState.monitoringInterval) clearInterval(TeacherState.monitoringInterval);
  TeacherState.monitoringInterval = setInterval(() => {
    if (TeacherState.activeTab === 'monitoring') {
      refreshMonitoringSessions();
    }
  }, 2500);
}

async function refreshMonitoringSessions() {
  try {
    const res = await fetch('/api/teacher/sessions');
    const data = await res.json();
    TeacherState.activeSessions = data.sessions || [];
    renderMonitoringGrid();

    // Update live badge count in header
    const liveCountBadge = document.getElementById('live-sessions-count');
    if (liveCountBadge) {
      const cnt = TeacherState.activeSessions.length;
      liveCountBadge.textContent = cnt;
      liveCountBadge.classList.toggle('live-pulse', cnt > 0);
    }
  } catch (err) {
    console.error('Error refreshing sessions:', err);
  }
}

function renderMonitoringGrid() {
  const grid = document.getElementById('monitoring-grid');
  if (!grid) return;

  if (TeacherState.activeSessions.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; background: var(--bg-secondary); border: 1px dashed var(--border-color); border-radius: var(--radius-lg); padding: 48px; text-align: center;">
        <div style="font-size: 32px; margin-bottom: 12px;">🎧</div>
        <h3 style="margin-bottom: 8px;">Нет активных вызовов в реальном времени</h3>
        <p style="color: var(--text-secondary); margin-bottom: 20px; font-size: 14px;">
          Сейчас курсанты не ведут активных диалогов с заявителем. Вы можете запустить билет из каталога или сэмулировать звонок.
        </p>
        <button class="btn btn-blue" onclick="simulateCadetSession()">
          ⚡ Эмулировать вызов курсанта для проверки
        </button>
      </div>
    `;
    return;
  }

  grid.innerHTML = TeacherState.activeSessions.map(sess => {
    const elapsed = Math.round(sess.elapsed_seconds || 0);
    const sla = sess.sla_seconds || 75;
    const isOverdue = elapsed > sla;
    const panic = sess.panic_level || 50;

    let timerClass = 'normal';
    if (isOverdue) timerClass = 'danger';
    else if (elapsed > sla * 0.75) timerClass = 'warning';

    const panicColor = panic > 65 ? 'var(--accent-red)' : (panic > 40 ? 'var(--accent-orange)' : 'var(--accent-green)');

    return `
      <div class="session-live-card ${isOverdue ? 'overdue' : ''}" id="sess-card-${sess.session_id}">
        <div class="session-card-top">
          <div class="cadet-info">
            <div class="cadet-icon">👤</div>
            <div class="cadet-meta">
              <div class="name">${escapeHtml(sess.operator_name || 'Курсант')}</div>
              <div class="ticket">Билет №${sess.ticket_id} (Вопрос ${sess.question_id})</div>
            </div>
          </div>
          <div class="session-timer ${timerClass}">
            ⏱️ ${formatTime(elapsed)} / ${sla}с
          </div>
        </div>

        <div style="font-size: 13px; color: var(--text-primary); margin-bottom: 8px;">
          <strong>Заявитель:</strong> ${escapeHtml(sess.caller_name || 'Очевидец')} (${escapeHtml(sess.caller_phone || '')})
        </div>

        <div class="live-panic-gauge">
          <div class="panic-gauge-header">
            <span>Уровень стресса заявителя</span>
            <span style="color: ${panicColor}; font-weight: 700;">${panic}%</span>
          </div>
          <div class="panic-progress-track">
            <div class="panic-progress-bar" style="width: ${panic}%; background: ${panicColor};"></div>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin: 10px 0;">
          <span class="state-badge state-${sess.state || 'grounded'}">
            Состояние: ${getStateTitle(sess.state)}
          </span>
          <span style="font-size: 11px; color: ${sess.cliche_violations > 0 ? 'var(--accent-red)' : 'var(--text-muted)'};">
            Канцелярит: <strong>${sess.cliche_violations || 0}</strong>
          </span>
        </div>

        <div class="session-dialogue-snippet">
          💬 ${escapeHtml(sess.last_message || 'Ожидание реплики курсанта...')}
        </div>

        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button class="btn btn-secondary btn-sm" onclick="openInterventionModal('${sess.session_id}')">
            🎛️ Стенограмма и Вмешательство
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function getStateTitle(state) {
  switch (state) {
    case 'panic': return '🔴 Паника';
    case 'aggressive': return '🟠 Агрессия';
    case 'grounded': return '🔵 Заземлен';
    case 'cooperative': return '🟢 Кооперация';
    default: return state || 'Норма';
  }
}

async function simulateCadetSession() {
  try {
    const res = await fetch('/api/teacher/simulate_cadet', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Тестовый сеанс курсанта успешно эмулирован!', 'success');
      refreshMonitoringSessions();
    }
  } catch (err) {
    showToast('Ошибка эмуляции сессии', 'error');
  }
}

function openInterventionModal(sessionId) {
  const sess = TeacherState.activeSessions.find(s => s.session_id === sessionId);
  if (!sess) return;
  TeacherState.currentSessionForModal = sess;

  const modal = document.getElementById('intervention-modal');
  if (!modal) return;

  document.getElementById('modal-session-title').textContent = 
    `Контроль сессии: ${sess.operator_name} (Билет №${sess.ticket_id})`;

  // Render dialogue history
  const chatBox = document.getElementById('modal-chat-transcript');
  if (chatBox) {
    const history = sess.dialogue_history || [];
    chatBox.innerHTML = history.map(item => `
      <div class="chat-bubble ${item.sender === 'operator' ? 'operator' : (item.sender === 'instructor_prompt' ? 'instructor' : 'caller')}">
        <div class="chat-sender-name">
          ${item.sender === 'operator' ? 'Курсант' : (item.sender === 'instructor_prompt' ? 'Инструктор (Подсказка)' : 'Заявитель')}
        </div>
        <div class="chat-message-text">${escapeHtml(item.text)}</div>
      </div>
    `).join('');
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  modal.style.display = 'flex';
}

function closeInterventionModal() {
  const modal = document.getElementById('intervention-modal');
  if (modal) modal.style.display = 'none';
  TeacherState.currentSessionForModal = null;
}

async function sendTeacherIntervention(actionType, delta = 0, newState = null) {
  if (!TeacherState.currentSessionForModal) return;
  const sid = TeacherState.currentSessionForModal.session_id;

  const payload = {
    session_id: sid,
    action: actionType,
    panic_delta: delta,
    new_state: newState
  };

  const hintInput = document.getElementById('modal-instructor-hint');
  if (actionType === 'inject_message' && hintInput) {
    payload.instructor_message = hintInput.value;
    hintInput.value = '';
  }

  try {
    const res = await fetch('/api/teacher/intervene', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast('Управляющее воздействие отправлено в сессию!', 'success');
      refreshMonitoringSessions();
      closeInterventionModal();
    }
  } catch (err) {
    showToast('Ошибка отправки вмешательства', 'error');
  }
}

// ==========================================
// 4. ANALYTICS: RADAR, HEATMAP, READINESS
// ==========================================

async function loadAnalytics(cadetUsername = null) {
  try {
    const url = cadetUsername ? `/api/teacher/analytics?cadet=${cadetUsername}` : '/api/teacher/analytics';
    const res = await fetch(url);
    const data = await res.json();
    TeacherState.analyticsData = data;
    renderAnalyticsView(data);
  } catch (err) {
    console.error('Failed to load analytics:', err);
  }
}

function renderAnalyticsView(data) {
  if (!data) return;

  // 1. Group Summary Numbers
  const readinessVal = document.getElementById('stat-readiness-val');
  const readinessStatus = document.getElementById('stat-readiness-status');
  if (readinessVal) readinessVal.textContent = data.group_readiness_index + '%';
  if (readinessStatus) {
    readinessStatus.textContent = data.group_status;
    readinessStatus.style.color = data.group_readiness_index >= 80 ? 'var(--accent-green)' : 'var(--accent-orange)';
  }

  const testsCount = document.getElementById('stat-tests-count');
  if (testsCount) testsCount.textContent = data.total_evaluations;

  // 2. Render Competency Radar (Pure SVG/Canvas for Air-Gapped Offline Operation)
  // renderCompetencyRadar(data.radar);

  // 3. Render Heatmap of Vulnerabilities
  renderHeatmap(data.heatmap);

  // 4. Render Cadets Roster
  renderCadetRoster(data.cadet_roster);
}

function renderCompetencyRadar(radarScores) {
  const container = document.getElementById('radar-canvas-container');
  if (!container) return;

  const width = 380;
  const height = 340;
  const cx = width / 2;
  const cy = height / 2;
  const radius = 120;

  // Axes definition matching evaluation rubric
  const axes = [
    { key: 'address', label: 'Адрес (25%)', score: radarScores?.address || 85 },
    { key: 'classification', label: 'Классификатор (25%)', score: radarScores?.classification || 80 },
    { key: 'services', label: 'Службы (20%)', score: radarScores?.services || 80 },
    { key: 'communication', label: 'Стресс/Коммуникация (15%)', score: radarScores?.communication || 85 },
    { key: 'timing', label: 'Скорость/SLA (15%)', score: radarScores?.timing || 85 },
    { key: 'grammar', label: 'Грамотность (Штраф)', score: radarScores?.grammar || 90 }
  ];

  const totalAxes = axes.length;
  const angleStep = (Math.PI * 2) / totalAxes;

  // Calculate polygon vertices for actual scores
  const scorePoints = axes.map((a, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const r = (a.score / 100) * radius;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    return `${x},${y}`;
  }).join(' ');

  // Calculate threshold 80% readiness ring vertices
  const benchmarkPoints = axes.map((_, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const r = 0.8 * radius;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    return `${x},${y}`;
  }).join(' ');

  // Web rings (20%, 40%, 60%, 80%, 100%)
  const rings = [0.2, 0.4, 0.6, 0.8, 1.0].map(level => {
    const pts = axes.map((_, i) => {
      const angle = i * angleStep - Math.PI / 2;
      const r = level * radius;
      return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
    }).join(' ');
    return `<polygon points="${pts}" fill="none" stroke="#30363d" stroke-dasharray="${level === 0.8 ? '3,3' : 'none'}" stroke-width="${level === 0.8 ? '1.5' : '1'}" />`;
  }).join('');

  // Axis lines and labels
  const axisLinesAndLabels = axes.map((a, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const x2 = cx + radius * Math.cos(angle);
    const y2 = cy + radius * Math.sin(angle);

    // Label position offset
    const labelDist = radius + 22;
    const lx = cx + labelDist * Math.cos(angle);
    const ly = cy + labelDist * Math.sin(angle) + 4;
    const textAnchor = Math.abs(Math.cos(angle)) < 0.2 ? 'middle' : (Math.cos(angle) > 0 ? 'start' : 'end');

    return `
      <line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="#30363d" stroke-width="1" />
      <text x="${lx}" y="${ly}" fill="#c9d1d9" font-size="11" font-weight="600" text-anchor="${textAnchor}">
        ${a.label} (${Math.round(a.score)}%)
      </text>
    `;
  }).join('');

  container.innerHTML = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="overflow: visible;">
      <!-- Concentric Grid -->
      ${rings}
      <!-- 80% Benchmark Line (Combat Ready Standard) -->
      <polygon points="${benchmarkPoints}" fill="none" stroke="#58a6ff" stroke-width="1.5" stroke-dasharray="4,4" opacity="0.6" />
      <!-- Axes Lines & Labels -->
      ${axisLinesAndLabels}
      <!-- Cadet Score Polygon -->
      <polygon points="${scorePoints}" fill="rgba(63, 185, 80, 0.25)" stroke="#3fb950" stroke-width="2.5" />
      <!-- Vertices dots -->
      ${axes.map((a, i) => {
        const angle = i * angleStep - Math.PI / 2;
        const r = (a.score / 100) * radius;
        return `<circle cx="${cx + r * Math.cos(angle)}" cy="${cy + r * Math.sin(angle)}" r="4.5" fill="#3fb950" stroke="#0d1117" stroke-width="1.5" />`;
      }).join('')}
    </svg>
    <div style="margin-top: 8px; display: flex; justify-content: center; gap: 16px; font-size: 11px; color: var(--text-secondary);">
      <span style="display: inline-flex; align-items: center; gap: 4px;">
        <span style="width: 10px; height: 10px; background: #3fb950; border-radius: 2px;"></span> Фактический балл курсанта
      </span>
      <span style="display: inline-flex; align-items: center; gap: 4px;">
        <span style="width: 10px; height: 1px; border-top: 2px dashed #58a6ff;"></span> Стандарт готовности (80%)
      </span>
    </div>
  `;
}

function renderHeatmap(heatmapList) {
  const tbody = document.getElementById('heatmap-tbody');
  if (!tbody) return;

  tbody.innerHTML = (heatmapList || []).map(row => {
    return `
      <tr>
        <td><strong>${row.category}</strong></td>
        <td>${row.attempts}</td>
        <td>
          <span class="vuln-badge vuln-${row.vulnerability_level}">
            ${getVulnLabel(row.vulnerability_level)}
          </span>
        </td>
        <td style="color: ${row.address_errors > 0 ? 'var(--accent-red)' : 'var(--text-muted)'};">
          ${row.address_errors}
        </td>
        <td style="color: ${row.classifier_errors > 0 ? 'var(--accent-red)' : 'var(--text-muted)'};">
          ${row.classifier_errors}
        </td>
        <td style="color: ${row.services_errors > 0 ? 'var(--accent-red)' : 'var(--text-muted)'};">
          ${row.services_errors}
        </td>
        <td style="color: ${row.cliche_errors > 0 ? 'var(--accent-red)' : 'var(--text-muted)'};">
          ${row.cliche_errors}
        </td>
        <td style="color: ${row.sla_breaches > 0 ? 'var(--accent-red)' : 'var(--text-muted)'};">
          ${row.sla_breaches}
        </td>
        <td>
          <strong style="color: ${row.avg_readiness >= 80 ? 'var(--accent-green)' : (row.avg_readiness >= 65 ? 'var(--accent-orange)' : 'var(--accent-red)')};">
            ${row.avg_readiness}%
          </strong>
        </td>
      </tr>
    `;
  }).join('');
}

function getVulnLabel(level) {
  switch (level) {
    case 'low': return 'Низкая (Норма)';
    case 'medium': return 'Умеренная';
    case 'high': return 'Повышенная';
    case 'critical': return 'КРИТИЧЕСКАЯ';
    default: return level;
  }
}

function renderCadetRoster(cadets) {
  const tbody = document.getElementById('roster-tbody');
  if (!tbody) return;

  tbody.innerHTML = (cadets || []).map(cadet => {
    const isReady = cadet.readiness_index >= 80;
    const barColor = isReady ? 'var(--accent-green)' : (cadet.readiness_index >= 60 ? 'var(--accent-orange)' : 'var(--accent-red)');
    const evalId = cadet.latest_eval_id || cadet.eval_id || cadet.id;

    return `
      <tr>
        <td>
          <strong>${escapeHtml(cadet.full_name || cadet.cadet_username || cadet.username || '')}</strong>
          <div style="font-size: 11px; color: var(--text-muted);">${cadet.username || cadet.cadet_username || ''}</div>
        </td>
        <td>
          <div class="readiness-bar-cell">
            <span style="font-weight: 800; color: ${barColor}; min-width: 38px;">${cadet.readiness_index}%</span>
            <div class="progress-track-sm">
              <div style="height: 100%; width: ${cadet.readiness_index}%; background: ${barColor};"></div>
            </div>
          </div>
        </td>
        <td>
          <span class="vuln-badge ${isReady ? 'vuln-low' : 'vuln-high'}">
            ${cadet.status || 'В процессе'}
          </span>
        </td>
        <td>${cadet.completed_tests ?? 0}</td>
        <td>${cadet.avg_duration ?? 0}с</td>
        <td>
          <div style="display: flex; gap: 6px; align-items: center;">
            ${evalId ? `<a href="/api/evaluation/${evalId}/pdf" class="btn btn-sm btn-outline-primary" target="_blank">📄 Отчет (PDF)</a>` : '<span style="font-size: 11px; color: var(--text-muted);">Нет данных</span>'}
            ${evalId ? `<button type="button" class="btn btn-sm btn-secondary btn-override" onclick="openOverrideModal(${evalId})" data-eval-id="${evalId}">Исправить</button>` : `<button type="button" class="btn btn-sm btn-secondary btn-override" disabled>Исправить</button>`}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ==========================================
// TEACHER SCORE OVERRIDE (HUMAN-IN-THE-LOOP)
// ==========================================

async function openOverrideModal(evalId) {
  try {
    const res = await fetch('/api/teacher/evaluations');
    if (!res.ok) {
      throw new Error(`Ошибка загрузки оценок: ${res.status}`);
    }
    const data = await res.json();
    const evals = Array.isArray(data) ? data : (data.evaluations || []);
    const evalItem = evals.find(e => String(e.id) === String(evalId));
    if (!evalItem) {
      showToast(`Оценка #${evalId} не найдена`, 'error');
      return null;
    }

    TeacherState.currentOverrideEvalId = evalId;
    TeacherState.currentOverrideEval = evalItem;

    const modal = document.getElementById('override-modal');
    if (!modal) return null;

    const evalIdInput = document.getElementById('override-eval-id');
    if (evalIdInput) evalIdInput.value = evalId;

    const infoEl = document.getElementById('override-eval-info');
    if (infoEl) {
      const cadetName = evalItem.cadet_username || 'Не указан';
      const ticketText = `№${evalItem.ticket_id || '—'}${evalItem.question_id ? ` (Вопрос ${evalItem.question_id})` : ''}`;
      const readinessText = `${evalItem.readiness_index ?? '—'}%`;
      const statusText = evalItem.status || '—';
      infoEl.innerHTML = `
        <strong>Курсант:</strong> ${escapeHtml(cadetName)} &nbsp;|&nbsp;
        <strong>Билет:</strong> ${escapeHtml(ticketText)} &nbsp;|&nbsp;
        <strong>Текущий балл готовности:</strong> <span style="font-weight: 700; color: var(--accent-blue);">${escapeHtml(readinessText)}</span> &nbsp;|&nbsp;
        <strong>Статус:</strong> ${escapeHtml(statusText)}
      `;
    }

    const diffs = evalItem.diff || evalItem.data?.diff || [];
    const tbody = document.getElementById('override-diff-tbody');
    if (tbody) {
      if (diffs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 16px;">Нет данных diff по данной оценке</td></tr>`;
      } else {
        tbody.innerHTML = diffs.map(d => {
          const fieldName = d.field || d.name || 'Критерий';
          const expectedVal = d.expected !== undefined ? (typeof d.expected === 'object' ? JSON.stringify(d.expected) : d.expected) : '—';
          const actualVal = d.actual !== undefined ? (typeof d.actual === 'object' ? JSON.stringify(d.actual) : d.actual) : '—';
          const score = d.score ?? d.actual_score ?? 0;
          const maxScore = d.max ?? d.max_score ?? 100;
          const isMatch = d.is_match !== undefined ? d.is_match : (d.status === 'ok' || score >= maxScore);
          const statusBadge = isMatch 
            ? `<span class="vuln-badge vuln-low" style="color: var(--accent-green);">Эталон</span>`
            : `<span class="vuln-badge vuln-high" style="color: var(--accent-red);">Расхождение (${score - maxScore})</span>`;

          return `
            <tr style="cursor: pointer;" onclick="selectOverrideField('${escapeHtml(fieldName)}', ${score}, ${maxScore})" title="Нажмите для выбора этого критерия">
              <td><strong>${escapeHtml(fieldName)}</strong></td>
              <td><code>${escapeHtml(String(expectedVal))}</code></td>
              <td><code>${escapeHtml(String(actualVal))}</code></td>
              <td><strong>${score}</strong></td>
              <td>${maxScore}</td>
              <td>${statusBadge}</td>
            </tr>
          `;
        }).join('');
      }
    }

    const fieldSelect = document.getElementById('override-field-select');
    if (fieldSelect && diffs.length > 0) {
      fieldSelect.innerHTML = diffs.map(d => {
        const fieldName = d.field || d.name;
        return `<option value="${escapeHtml(fieldName)}">${escapeHtml(fieldName)} (текущий балл: ${d.score ?? 0})</option>`;
      }).join('');

      const firstDiscrepancy = diffs.find(d => !d.is_match && d.status !== 'ok') || diffs[0];
      if (firstDiscrepancy) {
        const fName = firstDiscrepancy.field || firstDiscrepancy.name;
        fieldSelect.value = fName;
        const scoreInput = document.getElementById('override-score-input');
        if (scoreInput) {
          scoreInput.value = firstDiscrepancy.max ?? firstDiscrepancy.max_score ?? firstDiscrepancy.score ?? 0;
        }
      }
    }

    const reasonInput = document.getElementById('override-reason-input');
    if (reasonInput) reasonInput.value = '';

    modal.style.display = 'flex';
    modal.classList.remove('hidden');
    return evalItem;
  } catch (err) {
    console.error('Failed to open override modal:', err);
    showToast(`Ошибка открытия модального окна: ${err.message}`, 'error');
    return null;
  }
}

async function submitOverride() {
  const evalIdInput = document.getElementById('override-eval-id');
  const evalId = evalIdInput ? evalIdInput.value : TeacherState.currentOverrideEvalId;

  const fieldSelect = document.getElementById('override-field-select');
  const field = fieldSelect ? fieldSelect.value : '';

  const scoreInput = document.getElementById('override-score-input');
  const scoreVal = scoreInput ? scoreInput.value : '';

  const reasonInput = document.getElementById('override-reason-input');
  const reason = reasonInput ? reasonInput.value.trim() : '';

  if (!evalId) {
    showToast('Не выбран ID оценки для исправления', 'error');
    return null;
  }
  if (!field) {
    showToast('Выберите критерий для исправления', 'error');
    return null;
  }
  if (scoreVal === '' || isNaN(Number(scoreVal))) {
    showToast('Укажите корректный балл', 'error');
    return null;
  }

  const newScore = parseInt(scoreVal, 10);

  const payload = {
    field: field,
    score: newScore,
    new_score: newScore,
    reason: reason,
    teacher_id: 'instructor_1',
    overrides: {
      [field]: {
        new_score: newScore,
        score: newScore,
        reason: reason
      }
    }
  };

  try {
    const res = await fetch(`/api/teacher/evaluations/${evalId}/override`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': 'instructor'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Ошибка сервера: ${res.status}`);
    }

    const data = await res.json();
    showToast(`Балл успешно обновлен (Новый индекс: ${data.readiness_index ?? newScore})`, 'success');
    closeOverrideModal();
    await loadAnalytics(TeacherState.selectedCadet);
    return data;
  } catch (err) {
    console.error('Failed to submit score override:', err);
    showToast(`Ошибка сохранения: ${err.message}`, 'error');
    return null;
  }
}

function closeOverrideModal() {
  const modal = document.getElementById('override-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.add('hidden');
  }
}

function selectOverrideField(fieldName, currentScore, maxScore) {
  const fieldSelect = document.getElementById('override-field-select');
  if (fieldSelect) {
    fieldSelect.value = fieldName;
  }
  const scoreInput = document.getElementById('override-score-input');
  if (scoreInput) {
    scoreInput.value = maxScore !== undefined ? maxScore : currentScore;
  }
}

function onOverrideFieldChange() {
  const fieldSelect = document.getElementById('override-field-select');
  if (!fieldSelect || !TeacherState.currentOverrideEval) return;
  const diffs = TeacherState.currentOverrideEval.diff || TeacherState.currentOverrideEval.data?.diff || [];
  const found = diffs.find(d => (d.field || d.name) === fieldSelect.value);
  if (found) {
    const scoreInput = document.getElementById('override-score-input');
    if (scoreInput) {
      scoreInput.value = found.max ?? found.max_score ?? found.score ?? 0;
    }
  }
}

// Expose on window for global access
window.openOverrideModal = openOverrideModal;
window.submitOverride = submitOverride;
window.closeOverrideModal = closeOverrideModal;
window.selectOverrideField = selectOverrideField;
window.onOverrideFieldChange = onOverrideFieldChange;

function filterAnalyticsByCadet(username) {
  TeacherState.selectedCadet = username;
  loadAnalytics(username);
  showToast(`Загружен радар компетенций для курсанта: ${username}`, 'info');
}

function resetCadetFilter() {
  TeacherState.selectedCadet = null;
  loadAnalytics(null);
  showToast('Отображается общая сводка по группе', 'info');
}

function exportEvaluations(format) {
  window.location.href = `/api/evaluations/export?format=${format}`;
  showToast(`Запущен экспорт отчета в формате ${format.toUpperCase()}...`, 'success');
}

// ==========================================
// UTILITIES
// ==========================================

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(message, type = 'info') {
  if (typeof document === 'undefined' || !document.createElement) return;
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    if (document.body && document.body.appendChild) {
      document.body.appendChild(container);
    }
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
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
            headers: { "X-User-Role": "instructor" }
        });
        const json = await res.json();
        if (json.success) {
            alert(`Успех: импортировано ${json.imported_count} сценариев.`);
            loadAnalytics();
        } else {
            alert(`Ошибка импорта: ${json.detail}`);
        }
    } catch (e) {
        alert(`Ошибка загрузки: ${e}`);
    }
}
