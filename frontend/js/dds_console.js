/**
 * ============================================================================
 * АРМ-112 ДИСПЕТЧЕРА ДДС (ЧЕРТАНОВО ЮЖНОЕ)
 * 100% реализация функционала по Скриншоту 5
 * ============================================================================
 */

(function () {
  'use strict';

  const OPERATOR_DIRECTORY = {
    'оп. 908': 'Смирнов А. В.',
    'оп. 464': 'Артёмова А. В.',
    'оп. 0': 'Системный оператор ДДС',
    'оп. 14': 'Рожкова О. И.',
    'оп. 1002': 'Петрова С. И.',
    'оп. 9999': 'Внешняя информационная система (ВИС)'
  };

  function getOperatorFio(opStr) {
    return OPERATOR_DIRECTORY[opStr] || opStr;
  }

  // Эталонная карточка происшествия (Скриншот 5: ДДС Чертаново Южное)
  const CHERTANOVO_CARD = {
    card_id: '881412',
    saved_time: '20.08.2021 в 11:57:19',
    operator_info: 'Опер. 14, АРМ 7, Рожкова О И',
    caller_name: 'Иванов',
    caller_category: 'очевидец',
    aon_phone: '+7 (749) 512-34-56',
    provided_phone: '+7 (749) 512-3...',
    address: 'Россия, Москва, (ЮАО, Чертаново Южное), Чертановская улица, 58, к. 2, под. 2',
    description: 'Поваленное дерево во дворе возле подъезда 2 перегородило сквозной проезд и вход. Пострадавших нет. Угрозы падения на припаркованные автомобили нет.',
    indicators: {
      victims: false,
      refusal_ambulance: false,
      blocked_access: false,
      is_emerg: false,
      is_alert: false
    },
    incident: {
      rubric: 'Аварии и происшествия в городском хозяйстве',
      title: 'Дерево. Двор (упало).',
      incident_class: 'Класс.: Дерево упало во дворе;',
      vis_class: '[ВИС] Класс.:'
    },
    services: [
      {
        id: 'svc_101',
        name: 'Служба 101',
        full_name: 'Служба 101',
        hasPhone: true,
        status: 'Не принята',
        short_time: '09:02',
        is_rejected: true,
        status_line: '09:02 Не принята',
        history: [
          { operator: 'оп. 908', fio: 'Смирнов А. В.', time: '31.01.2025 08:57:39', status: 'Добавлена', is_red: false },
          { operator: 'оп. 9999', fio: 'Внешняя информационная система (ВИС)', time: '31.01.2025 08:57:40', status: 'Получена службой', is_red: false },
          { operator: 'оп. 9999', fio: 'Внешняя информационная система (ВИС)', time: '31.01.2025 09:02:25', status: 'Не принята', is_red: true, comment: 'Заявка отклонена: передано в округ' }
        ]
      },
      {
        id: 'svc_codd',
        name: 'ЦОДД',
        full_name: 'ЦОДД',
        hasPhone: false,
        status: 'Работы завершены',
        short_time: '08:57',
        is_rejected: false,
        status_line: '08:57 Работы заве...',
        history: [
          { operator: 'оп. 464', fio: 'Ковалев Д. С.', time: '31.01.2025 08:55:10', status: 'Добавлена', is_red: false },
          { operator: 'оп. 0', fio: 'Системный оператор ДДС', time: '31.01.2025 08:56:00', status: 'Получена службой', is_red: false },
          { operator: 'оп. 0', fio: 'Системный оператор ДДС', time: '31.01.2025 08:57:15', status: 'Работы завершены', is_red: false }
        ]
      },
      {
        id: 'svc_roads',
        name: 'Автодороги',
        full_name: 'Автодороги',
        hasPhone: false,
        status: 'Работы завершены',
        short_time: '13:22',
        is_rejected: false,
        status_line: '13:22 Работы заве...',
        history: [
          { operator: 'оп. 908', fio: 'Смирнов А. В.', time: '31.01.2025 13:20:00', status: 'Добавлена', is_red: false },
          { operator: 'оп. 0', fio: 'Системный оператор ДДС', time: '31.01.2025 13:20:45', status: 'Получена службой', is_red: false },
          { operator: 'оп. 0', fio: 'Системный оператор ДДС', time: '31.01.2025 13:22:10', status: 'Работы завершены', is_red: false }
        ]
      },
      {
        id: 'svc_rosseti',
        name: 'Россети МР',
        full_name: 'Россети МР',
        hasPhone: false,
        status: 'Не принята',
        short_time: '09:12',
        is_rejected: true,
        status_line: '09:12 Не принята',
        history: [
          { operator: 'оп. 908', fio: 'Смирнов А. В.', time: '31.01.2025 09:00:12', status: 'Добавлена', is_red: false },
          { operator: 'оп. 9999', fio: 'Внешняя информационная система (ВИС)', time: '31.01.2025 09:00:30', status: 'Получена службой', is_red: false },
          { operator: 'оп. 9999', fio: 'Внешняя информационная система (ВИС)', time: '31.01.2025 09:12:05', status: 'Не принята', is_red: true, comment: 'нет повреждений сетей' }
        ]
      },
      {
        id: 'svc_moek',
        name: 'МОЭК',
        full_name: 'МОЭК',
        hasPhone: false,
        status: 'Не принята',
        short_time: '08:59',
        is_rejected: true,
        status_line: '08:59 Не принята',
        history: [
          { operator: 'оп. 908', fio: 'Смирнов А. В.', time: '31.01.2025 08:57:39', status: 'Добавлена', is_red: false },
          { operator: 'оп. 0', fio: 'Системный оператор ДДС', time: '31.01.2025 08:59:10', status: 'Получена службой', is_red: false },
          { operator: 'оп. 0', fio: 'Системный оператор ДДС', time: '31.01.2025 08:59:59', status: 'Не принята', is_red: true, comment: 'вне компетенции моэк' }
        ]
      },
      {
        id: 'svc_cemp',
        name: 'ЦЭМП',
        full_name: 'ЦЭМП',
        hasPhone: false,
        status: 'Работы завершены',
        short_time: '19:27',
        is_rejected: false,
        status_line: '19:27 Работы заве...',
        history: [
          { operator: 'оп. 464', fio: 'Ковалев Д. С.', time: '31.01.2025 19:23:53', status: 'Добавлена', is_red: false },
          { operator: 'оп. 0', fio: 'Системный оператор ДДС', time: '31.01.2025 19:27:06', status: 'Получена службой', is_red: false },
          { operator: 'оп. 0', fio: 'Системный оператор ДДС', time: '31.01.2025 19:27:14', status: 'Принята', is_red: true }, // Срыв SLA (>30s)
          { operator: 'оп. 0', fio: 'Системный оператор ДДС', time: '31.01.2025 19:27:18', status: 'Работы завершены', is_red: false }
        ]
      },
      {
        id: 'svc_tinao',
        name: 'ДДС ТиНАО',
        full_name: 'ДДС ТиНАО',
        hasPhone: false,
        status: 'Принята',
        short_time: '15:42',
        is_rejected: false,
        status_line: '15:42 Принята',
        history: [
          { operator: 'Попова М А', is_fio: true, time: '01.02.2025 15:41:55', status: 'Добавлена', is_red: false },
          { operator: 'Платонова Е А', is_fio: true, time: '01.02.2025 15:42:24', status: 'Получена службой', is_red: false },
          { operator: 'Платонова Е А', is_fio: true, time: '01.02.2025 15:42:37', status: 'Принята', is_red: false }
        ]
      },
      {
        id: 'chertanovo',
        name: 'Упр. Чертанов...',
        full_name: 'Упр. Чертаново Южное',
        status: 'Получена службой',
        status_line: '13:22 Получена слу...',
        hasPencil: true,
        history: [
          { operator: 'оп. 14', fio: 'Рожкова О. И.', time: '11:59:43', status: 'Добавлена', is_red: false },
          { operator: 'оп. 0', fio: 'Системный оператор ДДС', time: '13:22:25', status: 'Получена службой', is_red: false }
        ]
      },
      {
        id: 'prefecture',
        name: 'Преф. ЮАО',
        full_name: 'Префектура ЮАО',
        status: 'Добавлена',
        status_line: '11:59 Добавлена',
        history: [
          { operator: 'оп. 14', fio: 'Рожкова О. И.', time: '11:59:43', status: 'Добавлена', is_red: false }
        ]
      },
      {
        id: 'dep_nature',
        name: 'Деп. природ.',
        full_name: 'Департамент природопользования',
        status: 'Добавлена',
        status_line: '11:59 Добавлена',
        history: [
          { operator: 'оп. 14', fio: 'Рожкова О. И.', time: '11:59:43', status: 'Добавлена', is_red: false }
        ]
      }
    ]
  };

  // Состояние пульта ДДС
  const state = {
    card: JSON.parse(JSON.stringify(CHERTANOVO_CARD)),
    activeServiceId: null,     // Текущий открытый pop-up (null = скрыт)
    popupVisible: false,       // Синее всплывающее окно истории
    statusMenuVisible: false,  // Меню карандаша
    audioEnabled: true,
    editingServiceId: null,    // ID службы, для которой открыта панель статуса

    // SLA тайминг
    slaSeconds: 30,
    slaStartTime: Date.now(),
    slaTimerId: null,
    isAccepted: false,
    isBreached: false,
    alarmAudioPlaying: false
  };

  // Web Audio Context для автономных сигналов тревоги и подтверждения
  let audioCtx = null;
  let alarmInterval = null;

  function getAudioContext() {
    if (!audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioCtx = new AudioCtx();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  // Звук аварийной тревоги «НЕ ОПОВЕЩЕНО» (двухтональный зуммер ДДС)
  function playAlarmTone() {
    if (!state.audioEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(440, now + 0.12);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.28);
    } catch (e) {
      // Игнорируем
    }
  }

  // Звук успешного принятия вызова (мягкий колокольчик)
  function playSuccessTone() {
    if (!state.audioEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880, now + 0.1); // A5

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) {
      // Игнорируем
    }
  }

  function startAlarmLoop() {
    if (alarmInterval) clearInterval(alarmInterval);
    playAlarmTone();
    alarmInterval = setInterval(playAlarmTone, 800);
  }

  function stopAlarmLoop() {
    if (alarmInterval) {
      clearInterval(alarmInterval);
      alarmInterval = null;
    }
  }

  // ==================== ИНИЦИАЛИЗАЦИЯ ====================
  function init() {
    renderCardData();
    bindEvents();
    startSlaTimer();
    tryFetchBackendCard();
  }

  // Отрисовка всех полей карточки происшествия
  function renderCardData() {
    const c = state.card;

    // Паспорт
    const valCardId = document.getElementById('valCardId');
    if (valCardId) valCardId.textContent = `Происшествие ${c.card_id}`;

    const valSavedTime = document.getElementById('valCardSavedTime');
    if (valSavedTime) valSavedTime.textContent = `Сохр. ${c.saved_time}`;

    const valOperator = document.getElementById('valCardOperator');
    if (valOperator) valOperator.textContent = c.operator_info;

    // Телефоны
    const valAon = document.getElementById('valAonPhone');
    if (valAon) valAon.textContent = c.aon_phone;

    const valProvided = document.getElementById('valProvidedPhone');
    if (valProvided) valProvided.textContent = c.provided_phone;

    // Заявитель и адрес
    const valCallerName = document.getElementById('valCallerName');
    if (valCallerName) valCallerName.textContent = c.caller_name;

    const valCallerCategory = document.getElementById('valCallerCategory');
    if (valCallerCategory) valCallerCategory.textContent = c.caller_category;

    const valAddress = document.getElementById('valAddress');
    if (valAddress) valAddress.textContent = c.address;

    const valDesc = document.getElementById('valDescription');
    if (valDesc) valDesc.textContent = c.description;

    // Индикаторы
    updateIndicatorsUI();

    // Классификация происшествия
    const valTitle = document.getElementById('valIncidentTitle');
    if (valTitle) valTitle.textContent = c.incident.title;

    const valClass = document.getElementById('valIncidentClass');
    if (valClass) valClass.textContent = c.incident.incident_class;

    const valVis = document.getElementById('valVisClass');
    if (valVis) valVis.textContent = c.incident.vis_class;

    // История статусов в Pop-up и табы служб
    updatePopupAndTabs();
  }

  function updateIndicatorsUI() {
    const ind = state.card.indicators;
    const elVictims = document.getElementById('indVictims');
    if (elVictims) elVictims.textContent = ind.victims ? 'да' : 'нет';

    const elRefusal = document.getElementById('indRefusal');
    if (elRefusal) elRefusal.textContent = ind.refusal_ambulance ? 'да' : 'нет';

    const elBlocked = document.getElementById('indBlocked');
    if (elBlocked) elBlocked.textContent = ind.blocked_access ? 'да' : 'нет';

    const badgeEmerg = document.getElementById('badgeEmerg');
    if (badgeEmerg) badgeEmerg.classList.toggle('active-emerg', ind.is_emerg);

    const badgeAlert = document.getElementById('badgeAlert');
    if (badgeAlert) badgeAlert.classList.toggle('active-alert', ind.is_alert);
  }

  function getFullFormattedDateTime() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }

  // Отрисовка свернутых табов служб в нижней панели
  function renderServicesTabs() {
    const container = document.getElementById('servicesTabsContainer');
    if (!container) return;

    container.innerHTML = state.card.services.map(svc => {
      const isActive = (state.activeServiceId === svc.id && state.popupVisible);
      const arrowSymbol = '▾';

      let statusHtml = '';
      if (svc.is_rejected || svc.status === 'Не принята') {
        const t = svc.short_time || '09:02';
        statusHtml = `<span class="status-time-badge-red tab-time-badge-rejected">${escapeHtml(t)}</span>&nbsp;Не принята`;
      } else if (svc.status_line) {
        statusHtml = escapeHtml(svc.status_line);
      } else {
        const t = svc.short_time || '11:59';
        statusHtml = `${escapeHtml(t)} ${escapeHtml(svc.status)}`;
      }

      const isChertanovo = (svc.id === 'chertanovo');
      const statusClass = (svc.status === 'Получена службой') ? 'tab-service-status status-cyan' : 'tab-service-status';

      return `
        <div class="service-tab-card ${isActive ? 'active-service-tab' : ''}"
             id="tab_${svc.id}"
             data-service-id="${svc.id}"
             title="${escapeHtml(svc.full_name || svc.name)}">
          <div class="tab-control-icons">
            ${svc.hasPhone ? '<span class="svc-phone-ico" title="Телефонное оповещение">📞</span>' : ''}
            <button type="button" class="btn-tab-arrow-purple btn-tab-toggle-popup"
                    data-service-id="${svc.id}"
                    title="История статусов службы">${arrowSymbol}</button>
            <button type="button" class="btn-tab-pencil btn-tab-open-status"
                    id="${svc.id === 'chertanovo' ? 'btnOpenChertanovoStatusMenu' : 'btnOpen_' + svc.id + '_status'}"
                    data-service-id="${svc.id}"
                    title="Изменить статус реагирования">✏️</button>
          </div>
          <div class="tab-service-name">${escapeHtml(svc.name)}</div>
          <div class="${isChertanovo ? statusClass + '" id="chertanovoStatusLine"' : statusClass + '"'}>
            ${statusHtml}
          </div>
        </div>
      `;
    }).join('');

    // Клики по стрелке (toggle pop-up)
    container.querySelectorAll('.btn-tab-toggle-popup').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const svcId = btn.getAttribute('data-service-id');
        if (state.activeServiceId === svcId && state.popupVisible) {
          // Второй клик — скрываем
          state.popupVisible = false;
          state.activeServiceId = null;
        } else {
          state.activeServiceId = svcId;
          state.popupVisible = true;
        }
        positionPopupAboveTab(svcId);
        updatePopupAndTabs();
      });
    });

    // Клики по карандашу (toggle status panel)
    container.querySelectorAll('.btn-tab-open-status').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const svcId = btn.getAttribute('data-service-id');
        openStatusPanel(svcId);
      });
    });
  }

  // Позиционируем pop-up над конкретным табом
  function positionPopupAboveTab(svcId) {
    const tabEl = document.getElementById('tab_' + svcId);
    const popupEl = document.getElementById('ddsStatusPopup');
    if (!tabEl || !popupEl) return;

    const tabRect = tabEl.getBoundingClientRect();
    const windowContainer = document.querySelector('.arm112-dds-window');
    const containerRect = windowContainer ? windowContainer.getBoundingClientRect() : { left: 0, bottom: 0 };

    // Позиционируем fixed относительно вьюпорта
    popupEl.style.position = 'fixed';
    popupEl.style.bottom = (window.innerHeight - tabRect.top + 2) + 'px';
    popupEl.style.top = 'auto';
    popupEl.style.left = Math.max(8, tabRect.left) + 'px';
    popupEl.style.right = 'auto';
  }

  function openStatusPanel(svcId) {
    const panelEl = document.getElementById('statusAssignmentPanel');
    const selectEl = document.getElementById('statusSelect');
    const orderEl = document.getElementById('statusOrderInput');
    const commentEl = document.getElementById('statusCommentInput');
    if (!panelEl) return;

    // Сохраняем какую службу редактируем
    state.editingServiceId = svcId;

    // Скрываем pop-up, чтобы не перекрывал панель
    const popupEl = document.getElementById('ddsStatusPopup');
    if (popupEl) popupEl.classList.add('hidden');
    state.popupVisible = false;

    // Позиционируем панель над табом
    const tabEl = document.getElementById('tab_' + svcId);
    if (tabEl) {
      panelEl.classList.remove('hidden');
      const rect = tabEl.getBoundingClientRect();
      const panelWidth = panelEl.offsetWidth || 520;
      panelEl.style.position = 'fixed';
      panelEl.style.bottom = (window.innerHeight - rect.top + 2) + 'px';
      panelEl.style.top = 'auto';
      panelEl.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - panelWidth - 16)) + 'px';
      panelEl.style.right = 'auto';
    } else {
      panelEl.classList.remove('hidden');
    }

    // Сбрасываем поля
    if (selectEl) selectEl.value = 'Принята';
    if (orderEl) { orderEl.value = 'Номер наряда'; orderEl.placeholder = 'Номер наряда'; }
    if (commentEl) {
      commentEl.value = 'Направлены рабочие';
      commentEl.placeholder = 'Направлены рабочие';
      commentEl.classList.remove('input-error');
    }
  }

  function closeStatusPanel() {
    const panelEl = document.getElementById('statusAssignmentPanel');
    if (panelEl) panelEl.classList.add('hidden');
    state.editingServiceId = null;
  }

  function toggleStatusPanel(svcId) {
    const panelEl = document.getElementById('statusAssignmentPanel');
    if (panelEl && !panelEl.classList.contains('hidden') && state.editingServiceId === svcId) {
      closeStatusPanel();
    } else {
      openStatusPanel(svcId);
    }
  }

  // Рендер строк истории в синем всплывающем окне (Скриншоты 2, 3, 4)
  function renderPopupHistory() {
    const popupEl = document.getElementById('ddsStatusPopup');
    const titleEl = document.getElementById('popupServiceTitle');
    const listEl = document.getElementById('popupHistoryList');
    if (!popupEl || !listEl) return;

    if (!state.popupVisible || !state.activeServiceId) {
      popupEl.classList.add('hidden');
      return;
    }
    popupEl.classList.remove('hidden');

    const currentSvc = state.card.services.find(s => s.id === state.activeServiceId);
    if (!currentSvc) return;

    if (titleEl) {
      titleEl.textContent = currentSvc.full_name || currentSvc.name;
    }

    listEl.innerHTML = currentSvc.history.map(item => {
      // 1. Атрибуция пользователей:
      // - У ВИС — всегда «оп. 9999»
      // - У служб с АРМ-112 — реальные Ф.И.О. (is_fio)
      // - У операторов с номером — оп. 908, оп. 464, оп. 0 с тултипом Ф.И.О.
      let userHtml = '';
      if (item.is_fio) {
        userHtml = `<span class="pop-op pop-fio">${escapeHtml(item.operator)}</span>`;
      } else if (item.operator === 'оп. 9999') {
        userHtml = `<span class="pop-op pop-vis" title="Внешняя информационная система (ВИС)">оп. 9999</span>`;
      } else {
        const fio = item.fio || getOperatorFio(item.operator);
        userHtml = `<span class="pop-op has-tooltip" data-tooltip="${escapeHtml(fio)}" title="${escapeHtml(fio)}">${escapeHtml(item.operator)}</span>`;
      }

      // 2. Красная подсветка даты и времени (при «Не принята»)
      const isRed = item.is_red || item.isRejected || item.status === 'Не принята';
      const timeClass = isRed ? 'pop-time pop-time-red pop-time-rejected' : 'pop-time';

      // 3. Комментарий к статусу
      let commentHtml = '';
      if (item.comment) {
        commentHtml = `
          <span class="pop-arrow">&gt;</span>
          <span class="pop-comment">${escapeHtml(item.comment)}</span>
        `;
      }

      return `
        <div class="popup-history-row">
          ${userHtml}
          <span class="pop-arrow">&gt;</span>
          <span class="pop-content-segment">
            <span class="${timeClass}">${escapeHtml(item.time)}</span>
            <span class="pop-status">${escapeHtml(item.status)}</span>
          </span>
          ${commentHtml}
        </div>
      `;
    }).join('');
  }

  function updatePopupAndTabs() {
    renderServicesTabs();
    renderPopupHistory();
    // Переустановить позицию pop-up при перерисовке
    if (state.popupVisible && state.activeServiceId) {
      positionPopupAboveTab(state.activeServiceId);
    }
  }

  // ==================== 30-СЕКУНДНЫЙ SLA ТАЙМЕР ====================
  function startSlaTimer() {
    if (state.slaTimerId) clearInterval(state.slaTimerId);

    state.slaStartTime = Date.now();
    state.isAccepted = false;
    state.isBreached = false;
    stopAlarmLoop();

    const widget = document.getElementById('slaClockWidget');
    if (widget) {
      widget.classList.remove('alarm-active', 'accepted-active');
    }

    const pill = document.getElementById('slaStatusPill');
    if (pill) pill.textContent = 'ОЖИДАНИЕ ПРИНЯТИЯ';

    // После перерисовки табов находим таб по data-service-id
    setTimeout(() => {
      const chertanovoTab = document.getElementById('tab_chertanovo');
      if (chertanovoTab) {
        chertanovoTab.classList.remove('card-alarm-breach');
      }
      const chertanovoStatusLine = document.getElementById('chertanovoStatusLine');
      if (chertanovoStatusLine) {
        chertanovoStatusLine.textContent = '13:22 Получена слу...';
        chertanovoStatusLine.className = 'tab-service-status status-cyan';
      }
    }, 50);

    state.slaTimerId = setInterval(() => {
      if (state.isAccepted) {
        clearInterval(state.slaTimerId);
        return;
      }

      const elapsed = (Date.now() - state.slaStartTime) / 1000;
      const remaining = Math.max(0, state.slaSeconds - elapsed);

      const displayEl = document.getElementById('slaCountdownDisplay');
      if (displayEl) {
        displayEl.textContent = `${remaining.toFixed(1)}с`;
      }

      // Срыв норматива (0 секунд) -> «НЕ ОПОВЕЩЕНО»
      if (remaining <= 0 && !state.isBreached) {
        triggerSlaBreach();
      }
    }, 100);
  }

  // Срабатывание срыва SLA норматива
  function triggerSlaBreach() {
    state.isBreached = true;
    startAlarmLoop();

    const widget = document.getElementById('slaClockWidget');
    if (widget) {
      widget.classList.add('alarm-active');
      widget.classList.remove('accepted-active');
    }

    const pill = document.getElementById('slaStatusPill');
    if (pill) pill.textContent = '🚨 СРЫВ SLA (НЕ ОПОВЕЩЕНО)';

    // Подсветка таба службы красным
    const chertanovoTab = document.getElementById('tab_chertanovo');
    if (chertanovoTab) {
      chertanovoTab.classList.add('card-alarm-breach');
    }

    const chertanovoStatusLine = document.getElementById('chertanovoStatusLine');
    if (chertanovoStatusLine) {
      chertanovoStatusLine.textContent = '🚨 НЕ ОПОВЕЩЕНО';
      chertanovoStatusLine.className = 'tab-service-status';
    }

    // Добавление записи о срыве в историю
    const chertanovoSvc = state.card.services.find(s => s.id === 'chertanovo');
    if (chertanovoSvc) {
      const nowTime = getFullFormattedDateTime();
      chertanovoSvc.history.push({
        operator: 'оп. 9999',
        fio: 'Внешняя информационная система (ВИС)',
        time: nowTime,
        status: 'НЕ ОПОВЕЩЕНО (Срыв SLA)',
        is_red: true
      });
      updatePopupAndTabs();
    }
  }

  // ==================== ДЕЙСТВИЯ СО СТАТУСАМИ ====================
  function setChertanovoStatus(statusName) {
    if (statusName === 'Не принята') {
      openRejectionModal();
      return;
    }

    applyStatusChange(statusName);
  }

  async function applyStatusChange(statusName, comment = '', duplicateId = '') {
    const chertanovoSvc = state.card.services.find(s => s.id === 'chertanovo');
    if (!chertanovoSvc) return;

    const nowTime = getFullFormattedDateTime();
    const shortTime = nowTime.split(' ')[1]?.substring(0, 5) || '13:22';

    // Обновляем состояние карточки
    chertanovoSvc.status = statusName;
    chertanovoSvc.short_time = shortTime;

    // Формируем текст на табе службы
    const statusLineEl = document.getElementById('chertanovoStatusLine');
    const chertanovoTab = document.getElementById('tabChertanovo');

    if (chertanovoTab) {
      chertanovoTab.classList.remove('card-alarm-breach');
    }

    stopAlarmLoop();

    if (statusName === 'Принята') {
      state.isAccepted = true;
      chertanovoSvc.is_rejected = false;
      if (state.slaTimerId) clearInterval(state.slaTimerId);

      const widget = document.getElementById('slaClockWidget');
      if (widget) {
        widget.classList.remove('alarm-active');
        widget.classList.add('accepted-active');
      }

      const pill = document.getElementById('slaStatusPill');
      if (pill) {
        pill.textContent = state.isBreached ? 'ПРИНЯТА (С ОПОЗДАНИЕМ)' : '✅ ПРИНЯТА ВОВРЕМЯ';
      }

      if (statusLineEl) {
        statusLineEl.textContent = `${shortTime} Принята`;
        statusLineEl.className = 'tab-service-status status-cyan';
      }

      playSuccessTone();
    } else if (statusName === 'Не принята') {
      chertanovoSvc.is_rejected = true;
      if (statusLineEl) {
        statusLineEl.innerHTML = `<span class="status-time-badge-red">${shortTime}</span> Не принята`;
        statusLineEl.className = 'tab-service-status';
      }
    } else {
      chertanovoSvc.is_rejected = false;
      if (statusLineEl) {
        statusLineEl.textContent = `${shortTime} ${statusName}`;
        statusLineEl.className = 'tab-service-status status-cyan';
      }
    }

    // Добавляем запись в историю статусов
    chertanovoSvc.history.push({
      operator: 'оп. 0',
      fio: 'Системный оператор ДДС',
      time: nowTime,
      status: statusName,
      is_red: (statusName === 'Не принята' || state.isBreached),
      comment: comment
    });

    updatePopupAndTabs();
    closeStatusMenu();

    // Отправка в backend (если сервер доступен)
    try {
      await fetch('/api/dds/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_id: state.card.card_id,
          service_name: 'Упр. Чертаново Южное',
          status: statusName,
          comment: comment,
          duplicate_id: duplicateId,
          user_name: 'Диспетчер Управы Чертаново Южное'
        })
      });
    } catch (e) {
      console.log('Синхронизация с сервером 112 выполнена локально');
    }
  }

  // ==================== СОБЫТИЯ И ОБРАБОТЧИКИ ====================
  function bindEvents() {
    // 1. Кнопка закрытия синего pop-up
    const btnClosePopup = document.getElementById('btnClosePopup');
    const popupEl = document.getElementById('ddsStatusPopup');
    if (btnClosePopup && popupEl) {
      btnClosePopup.addEventListener('click', (e) => {
        e.stopPropagation();
        popupEl.classList.add('hidden');
        state.popupVisible = false;
        state.activeServiceId = null;
        renderServicesTabs(); // Обновить стрелки
      });
    }

    // 2. Панель проставления статуса (универсальная — работает для любой службы)
    const panelEl = document.getElementById('statusAssignmentPanel');
    const selectEl = document.getElementById('statusSelect');
    const orderEl = document.getElementById('statusOrderInput');
    const commentEl = document.getElementById('statusCommentInput');
    const btnConfirmStatus = document.getElementById('btnConfirmStatus');
    const btnCancelStatus = document.getElementById('btnCancelStatus');

    if (btnCancelStatus) {
      btnCancelStatus.addEventListener('click', (e) => {
        e.stopPropagation();
        closeStatusPanel();
      });
    }

    if (selectEl) {
      selectEl.addEventListener('change', () => {
        if (selectEl.value === 'Не принята' || selectEl.value === 'Отказ от выполнения работ') {
          if (commentEl) {
            if (commentEl.value === 'Направлены рабочие') commentEl.value = '';
            commentEl.placeholder = 'Обоснование отказа (причина, номер дубля или служба)...';
            commentEl.focus();
          }
        } else {
          if (commentEl) {
            if (!commentEl.value) commentEl.value = 'Направлены рабочие';
            commentEl.placeholder = 'Направлены рабочие';
          }
        }
      });
    }

    if (btnConfirmStatus) {
      btnConfirmStatus.addEventListener('click', (e) => {
        e.stopPropagation();
        const svcId = state.editingServiceId;
        if (!svcId) return;

        const statusVal = selectEl ? selectEl.value : 'Принята';
        const orderVal = orderEl ? orderEl.value.trim() : '';
        const commentVal = commentEl ? commentEl.value.trim() : '';

        // Найти службу
        const svc = state.card.services.find(s => s.id === svcId);
        if (!svc) return;

        const isRefusal = (statusVal === 'Не принята' || statusVal === 'Отказ от выполнения работ' || statusVal === 'Отказ');
        if (isRefusal) {
          if (!commentVal || commentVal === 'Направлены рабочие' || commentVal.length < 5) {
            if (commentEl) {
              commentEl.classList.add('input-error');
              commentEl.focus();
            }
            alert('Для статуса «' + statusVal + '» необходимо указать обоснование отказа (причина, номер дубля или служба переадресации, минимум 5 символов)!');
            return;
          }
          if (commentEl) commentEl.classList.remove('input-error');
        } else {
          if (commentEl) commentEl.classList.remove('input-error');
        }

        const nowTime = getFormattedTime();
        const shortTime = nowTime.substring(0, 5);
        const fullTime = getFullFormattedDateTime();
        const fullComment = (orderVal && orderVal !== 'Номер наряда')
          ? `Наряд № ${orderVal}${commentVal && commentVal !== 'Направлены рабочие' ? ': ' + commentVal : ''}`
          : (commentVal || 'Направлены рабочие');

        svc.status = statusVal;
        svc.is_rejected = isRefusal;
        svc.short_time = shortTime;
        svc.status_line = `${shortTime} ${statusVal}`;

        svc.history.push({
          operator: 'оп. 0',
          fio: 'Системный оператор ДДС',
          time: fullTime,
          status: statusVal,
          comment: fullComment,
          is_red: isRefusal,
          isRejected: isRefusal
        });

        // SLA-логика только для своей службы (chertanovo)
        if (svcId === 'chertanovo') {
          if (statusVal === 'Принята') {
            state.isAccepted = true;
            if (state.slaTimerId) clearInterval(state.slaTimerId);
            const widget = document.getElementById('slaClockWidget');
            if (widget) {
              widget.classList.remove('alarm-active');
              widget.classList.add('accepted-active');
            }
            const pill = document.getElementById('slaStatusPill');
            if (pill) {
              pill.textContent = state.isBreached ? 'ПРИНЯТА (С ОПОЗДАНИЕМ)' : '✅ ПРИНЯТА ВОВРЕМЯ';
            }
            stopAlarmLoop();
            playSuccessTone();
          }
          // Сбрасываем аварийный режим
          stopAlarmLoop();
          const chertanovoTabEl = document.getElementById('tab_chertanovo');
          if (chertanovoTabEl) chertanovoTabEl.classList.remove('card-alarm-breach');
        }

        // Показываем pop-up для данной службы после сохранения
        state.activeServiceId = svcId;
        state.popupVisible = true;
        closeStatusPanel();
        updatePopupAndTabs();
      });
    }

    // Закрытие панели при клике вне её
    document.addEventListener('click', (e) => {
      if (panelEl && !panelEl.classList.contains('hidden')
          && !panelEl.contains(e.target)
          && !e.target.closest('.btn-tab-open-status')
          && !e.target.closest('.btn-tab-pencil')) {
        closeStatusPanel();
      }
    });

    // 3. Управление SLA в тренажере
    const btnResetSla = document.getElementById('btnResetSla');
    if (btnResetSla) {
      btnResetSla.addEventListener('click', () => {
        startSlaTimer();
        const pill = document.getElementById('slaStatusPill');
        if (pill) {
          pill.textContent = 'ОЖИДАНИЕ ПРИНЯТИЯ';
          pill.className = 'sla-status-pill';
        }
        playSuccessTone();
        showToast('Таймер SLA сброшен на 30.0 секунд', 'info');
      });
    }

    const btnAudio = document.getElementById('btnToggleAudio');
    if (btnAudio) {
      btnAudio.addEventListener('click', () => {
        state.audioEnabled = !state.audioEnabled;
        btnAudio.textContent = state.audioEnabled ? '🔔 Звук включен' : '🔕 Звук выключен';
        btnAudio.classList.toggle('audio-active', state.audioEnabled);
        if (state.audioEnabled) {
          playSuccessTone();
          showToast('Звуковая сигнализация ДДС включена', 'success');
        } else {
          stopAlarmLoop();
          showToast('Звуковая сигнализация ДДС выключена', 'warn');
        }
      });
    }

    const btnSimulate = document.getElementById('btnSimulateCard');
    if (btnSimulate) {
      btnSimulate.addEventListener('click', () => {
        simulateIncomingCard();
        showToast('Смоделировано поступление нового вызова 112', 'info');
      });
    }

    // 4. Индикаторы (карандаш редактирования индикаторов)
    const btnEditInd = document.getElementById('btnEditIndicators');
    if (btnEditInd) {
      btnEditInd.addEventListener('click', () => {
        toggleIndicatorValues();
        showToast('Признаки происшествия обновлены', 'info');
      });
    }

    // Клик по бейджам ЧС / ЧП
    const badgeEmerg = document.getElementById('badgeEmerg');
    if (badgeEmerg) {
      badgeEmerg.addEventListener('click', () => {
        state.card.indicators.is_emerg = !state.card.indicators.is_emerg;
        updateIndicatorsUI();
        showToast(`Признак ЧС: ${state.card.indicators.is_emerg ? 'Установлен ⚡' : 'Снят'}`, 'info');
      });
    }

    const badgeAlert = document.getElementById('badgeAlert');
    if (badgeAlert) {
      badgeAlert.addEventListener('click', () => {
        state.card.indicators.is_alert = !state.card.indicators.is_alert;
        updateIndicatorsUI();
        showToast(`Признак ЧП: ${state.card.indicators.is_alert ? 'Установлен ⚠️' : 'Снят'}`, 'info');
      });
    }

    // 5. Карта происшествия
    const btnOpenMap = document.getElementById('btnOpenMap');
    const mapModal = document.getElementById('mapModal');
    const btnCloseMap = document.getElementById('btnCloseMapModal');

    if (btnOpenMap && mapModal) {
      btnOpenMap.addEventListener('click', () => {
        mapModal.classList.add('active');
        showToast('Интерактивная карта происшествия открыта', 'info');
      });
    }

    if (btnCloseMap && mapModal) {
      btnCloseMap.addEventListener('click', () => {
        mapModal.classList.remove('active');
      });
    }

    // 6. Модальное окно отклонения («Не принята»)
    setupRejectionModal();

    // 7. Кнопки верхней телефонии (записи, SMS, копирование АОН)
    const btnCallRecords = document.getElementById('btnCallRecords');
    if (btnCallRecords) {
      btnCallRecords.addEventListener('click', () => {
        playSuccessTone();
        showToast('Журнал аудиозаписей звонков: вызов №881412 (01:24 мин)', 'info');
      });
    }

    const btnSmsList = document.getElementById('btnSmsList');
    if (btnSmsList) {
      btnSmsList.addEventListener('click', () => {
        playSuccessTone();
        showToast('Журнал SMS: 2 сообщения от заявителя (Чертановская ул.)', 'info');
      });
    }

    const btnCopyAon = document.getElementById('btnCopyAon');
    if (btnCopyAon) {
      btnCopyAon.addEventListener('click', () => {
        const provEl = document.getElementById('valProvidedPhone');
        if (provEl) provEl.textContent = state.card.aon_phone;
        playSuccessTone();
        showToast('Номер АОН скопирован в предоставленный телефон', 'success');
      });
    }

    // 8. Кнопки просмотра и дополнения
    const btnView = document.getElementById('btnViewCard');
    if (btnView) {
      btnView.addEventListener('click', () => {
        showToast(`Просмотр КП №${state.card.card_id}: ${state.card.address}`, 'info');
      });
    }

    const btnSupplement = document.getElementById('btnSupplementCard');
    if (btnSupplement) {
      btnSupplement.addEventListener('click', () => {
        let text = 'Проезд расчищен спецтехникой, препятствий нет.';
        try {
          const userText = prompt('Введите дополнение к карточке от ДДС Чертаново Южное:', text);
          if (userText && userText.trim()) text = userText.trim();
        } catch (_) {}
        state.card.description += `\n[${getFormattedTime()} Дополнение ДДС]: ${text}`;
        const valDesc = document.getElementById('valDescription');
        if (valDesc) valDesc.textContent = state.card.description;
        showToast('Дополнение внесено в карточку происшествия', 'success');
      });
    }

    // 9. Кнопки нижней полосы (чат и закрытие)
    const btnChat = document.getElementById('btnBottomChat');
    if (btnChat) {
      btnChat.addEventListener('click', () => {
        showToast('Журнал связи Системы-112: входящий вызов передан без искажений', 'info');
      });
    }

    const btnBottomClose = document.getElementById('btnBottomClose');
    if (btnBottomClose) {
      btnBottomClose.addEventListener('click', () => {
        if (confirm('Закрыть карточку происшествия №881412?')) {
          window.location.href = '/index.html';
        }
      });
    }

    // 10. Кнопки статуса бригады и радиообмена
    const brigadeBtns = document.querySelectorAll('.btn-brigade-status:not(.btn-radio-mode)');
    brigadeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const st = btn.dataset.status;
        if (st) setBrigadeStatus(st);
      });
    });

    const btnRadio = document.getElementById('btnRadioExchange');
    if (btnRadio) {
      btnRadio.addEventListener('click', () => triggerRadioTransmission());
    }

    const btnCloseRadio = document.getElementById('btnCloseRadio');
    if (btnCloseRadio) {
      btnCloseRadio.addEventListener('click', () => toggleRadioConsole(false));
    }

    const btnSendRadio = document.getElementById('btnSendRadioMsg');
    if (btnSendRadio) {
      btnSendRadio.addEventListener('click', () => triggerRadioTransmission());
    }
  }

  function setBrigadeStatus(statusText) {
    const tag = document.getElementById('brigadeStatusTag');
    if (tag) {
      tag.innerText = statusText.toUpperCase();
      tag.className = 'brigade-status-tag';
      if (statusText === 'В пути') tag.style.background = '#2563eb';
      else if (statusText === 'Прибыл') tag.style.background = '#d97706';
      else if (statusText === 'Ликвидация') tag.style.background = '#dc2626';
      else if (statusText === 'Завершено') tag.style.background = '#16a34a';
      tag.style.color = '#ffffff';
    }
    showToast(`Статус бригады ДДС изменен: «${statusText}»`, 'success');
  }

  function toggleRadioConsole(forceState) {
    const consoleEl = document.getElementById('ddsRadioConsole');
    if (consoleEl) {
      if (typeof forceState === 'boolean') {
        consoleEl.classList.toggle('hidden', !forceState);
      } else {
        consoleEl.classList.toggle('hidden');
      }
    }
  }

  function triggerRadioTransmission() {
    toggleRadioConsole(true);
    const feed = document.getElementById('ddsRadioFeed');
    const input = document.getElementById('radioMsgInput');
    const msg = (input && input.value.trim()) ? input.value.trim() : 'Доложите оперативную обстановку на объекте';
    if (feed) {
      const now = new Date().toTimeString().slice(0, 8);
      const line1 = document.createElement('div');
      line1.className = 'radio-line';
      line1.textContent = `[${now}] ДДС (Эфир): ${msg}`;
      feed.appendChild(line1);

      setTimeout(() => {
        const ackNow = new Date().toTimeString().slice(0, 8);
        const line2 = document.createElement('div');
        line2.className = 'radio-line radio-ack';
        line2.textContent = `[${ackNow}] Бригада Чертаново: Принято, продолжаем локализацию на Чертановской 58.`;
        feed.appendChild(line2);
        feed.scrollTop = feed.scrollHeight;
      }, 350);
      feed.scrollTop = feed.scrollHeight;
    }
    showToast('Радиосообщение передано в эфир бригаде', 'info');
  }

  function closeStatusMenu() {
    const menuEl = document.getElementById('statusSelectionMenu');
    if (menuEl) {
      menuEl.classList.remove('active');
      state.statusMenuVisible = false;
    }
  }

  function toggleIndicatorValues() {
    const ind = state.card.indicators;
    // Циклическое переключение для демонстрации возможностей инспекции
    ind.victims = !ind.victims;
    updateIndicatorsUI();
  }

  // Настройка модального окна отклонения карточки
  function setupRejectionModal() {
    const modal = document.getElementById('rejectionModal');
    const btnClose = document.getElementById('btnCloseRejectModal');
    const btnCancel = document.getElementById('btnCancelRejectModal');
    const btnSave = document.getElementById('btnSaveRejection');
    const reasonSelect = document.getElementById('rejectReasonSelect');
    const customReason = document.getElementById('rejectCustomReason');
    const duplicateInput = document.getElementById('rejectDuplicateInput');
    const errorHint = document.getElementById('modalValidationHint');

    function closeModal() {
      if (modal) modal.classList.remove('active');
      if (customReason) customReason.value = '';
      if (duplicateInput) duplicateInput.value = '';
      if (reasonSelect) reasonSelect.selectedIndex = 0;
      if (btnSave) btnSave.disabled = true;
      if (errorHint) errorHint.style.display = 'none';
    }

    if (btnClose) btnClose.addEventListener('click', closeModal);
    if (btnCancel) btnCancel.addEventListener('click', closeModal);

    function validate() {
      if (!btnSave) return;
      const sReason = reasonSelect ? reasonSelect.value.trim() : '';
      const cReason = customReason ? customReason.value.trim() : '';
      const dup = duplicateInput ? duplicateInput.value.trim() : '';

      const reasonCombined = (sReason === 'custom' || !sReason) ? cReason : `${sReason} ${cReason}`.trim();
      const isValid = (reasonCombined.length >= 5) && (dup.length >= 3);

      btnSave.disabled = !isValid;
      if (errorHint) {
        errorHint.style.display = isValid ? 'none' : 'block';
      }
    }

    if (reasonSelect) reasonSelect.addEventListener('change', validate);
    if (customReason) customReason.addEventListener('input', validate);
    if (duplicateInput) duplicateInput.addEventListener('input', validate);

    if (btnSave) {
      btnSave.addEventListener('click', () => {
        if (btnSave.disabled) return;
        const sReason = reasonSelect.value;
        const cReason = customReason.value.trim();
        const fullReason = (sReason === 'custom') ? cReason : `${sReason}. ${cReason}`.trim();
        const dup = duplicateInput.value.trim();

        closeModal();
        applyStatusChange('Не принята', fullReason, dup);
      });
    }
  }

  function openRejectionModal() {
    closeStatusMenu();
    const modal = document.getElementById('rejectionModal');
    if (modal) modal.classList.add('active');
  }

  // ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
  function getFormattedTime() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Попытка загрузить карточку 881412 с бэкенда
  async function tryFetchBackendCard() {
    try {
      const resp = await fetch('/api/dds/cards');
      if (!resp.ok) return;
      const data = await resp.json();
      const cards = data.cards || [];
      const chertanovoBackend = cards.find(c => String(c.card_id) === '881412');
      if (chertanovoBackend) {
        // Синхронизируем статусы
        const statuses = chertanovoBackend.service_statuses || {};
        const chertanovoSt = statuses['Упр. Чертаново Южное'];
        if (chertanovoSt && chertanovoSt.history && chertanovoSt.history.length > 0) {
          const chertanovoSvc = state.card.services.find(s => s.id === 'chertanovo');
          if (chertanovoSvc) {
            chertanovoSvc.history = chertanovoSt.history;
            renderPopupHistory();
          }
        }
      }
    } catch (e) {
      // Игнорируем сетевые задержки
    }
  }

  function simulateIncomingCard() {
    state.card = JSON.parse(JSON.stringify(CHERTANOVO_CARD));
    renderCardData();
    startSlaTimer();
    const popupEl = document.getElementById('ddsStatusPopup');
    if (popupEl) {
      popupEl.classList.remove('hidden');
      state.popupVisible = true;
    }
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Экспорт
  window.ddsConsole = {
    init,
    startSlaTimer,
    setChertanovoStatus,
    simulateIncomingCard
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
