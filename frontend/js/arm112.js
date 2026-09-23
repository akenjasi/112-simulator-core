/**
 * ==========================================================================
 * АРМ ПОВ-112 ГОРОДА МОСКВЫ — ЕДИНАЯ СИСТЕМА-112
 * Клиентская логика оператора, классификатора, телефонии и аттестации
 * ==========================================================================
 */

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const ARM = {
  state: {
    role: 'operator', // operator | dds | teacher | admin
    session: {
      active: false,
      sessionId: null,
      ticketId: 1,
      questionId: 1,
      startTime: 0,
      timerInterval: null,
      elapsedSeconds: 0,
      callerName: '',
      callerPhone: '',
      panicLevel: 50,
      applicantState: 'grounded'
    },
    card: {
      incidentId: '77-2025-' + String(Math.floor(10000 + Math.random() * 90000)),
      applicantName: '',
      applicantStatus: 'Очевидец',
      aonPhone: '+7 (916) 126-34-71',
      providedPhone: '+7 (916) 126-34-71',
      onscenePhone: '',
      hasVictims: false,
      refusedMedical: false,
      isBlocked: false,
      isEmergencyChs: false,
      isIncidentChp: false,
      fullAddress: '',
      okrug: 'ЗАО',
      district: 'Дорогомилово',
      street: '',
      house: '',
      building: '',
      entrance: '',
      floor: '',
      apartment: '',
      intercom: '',
      addressDesc: '',
      description: '',
      feature1: 'на улице',
      feature2: 'мусор',
      feature3: 'открытое пламя',
      group: 'пожар на улице',
      finalType: 'пожар: мусор',
      services: ['Служба 101', 'Служба 102', 'Управа района / Префектура']
    },
    tickets: [],
    categories: [],
    ddsCards: [],
    ddsInterval: null,
    clockInterval: null
  },

  // Service name aliases and colors
  serviceDirectory: [
    'Служба 101',
    'Служба 102',
    'Служба 103',
    'Служба 104',
    'ЦОДД',
    'Мослифт',
    'Управа района / Префектура',
    'МГПСС',
    'ЦЭМП',
    'Гор. Хозяйство',
    'Мосводоканал',
    'МОЭК',
    'МОЭСК (Россети)',
    'ОАТИ'
  ],

  // Common Level 1 mapped presets
  level1Presets: [
    { label: 'Улица', value: 'на улице' },
    { label: 'Транспорт', value: 'транспорт' },
    { label: 'Дом', value: 'жилой дом' },
    { label: 'Здание/объект', value: 'объект' },
    { label: 'Опасный объект', value: 'Авария - опасный объект' },
    { label: 'Метро', value: 'метро' },
    { label: 'Вода', value: 'на воде' }
  ],

  // Common Level 2 presets
  level2Presets: [
    { label: 'Дым', value: 'дым' },
    { label: 'Открытое пламя', value: 'открытое пламя' },
    { label: 'Запах гари', value: 'запах гари' },
    { label: 'Мусор', value: 'мусор' },
    { label: 'ДТП', value: 'ДТП' },
    { label: 'Конфликт / Драка', value: 'драка' },
    { label: 'Запах газа', value: 'запах газа' },
    { label: 'Затопление', value: 'затопление' },
    { label: 'Застревание в лифте', value: 'лифт' },
    { label: 'Падение / Травма', value: 'травма/падение' }
  ],

  // Common Level 3 sublevels
  level3Presets: [
    { label: 'квартира', value: 'квартира' },
    { label: 'балкон', value: 'балкон' },
    { label: 'газовая колонка', value: 'газовая колонка' },
    { label: 'мусоропровод', value: 'мусоропровод' },
    { label: 'подъезд', value: 'подъезд' },
    { label: 'электрощит', value: 'электрощит' },
    { label: 'подвал', value: 'подвал' },
    { label: 'кровля', value: 'кровля' },
    { label: 'открытое пламя', value: 'открытое пламя' },
    { label: 'тление', value: 'тление' },
    { label: 'сильное задымление', value: 'сильное задымление' },
    { label: 'с угрозой людям', value: 'есть пострадавшие' }
  ],

  // ==================== ИНИЦИАЛИЗАЦИЯ СИСТЕМЫ ====================
  init() {
    this.bindEvents();
    this.startClock();
    this.loadTickets();
    this.loadCategories();
    this.renderQuestionnaireLevels();
    this.recalculateServices();
    this.updateDescriptionCounter();
    console.log('[АРМ ПОВ-112] Система успешно инициализирована');
  },

  // ==================== ЧАСЫ И ТАЙМЕРЫ ====================
  startClock() {
    const clockEl = document.getElementById('povClock');
    const update = () => {
      const now = new Date();
      if (clockEl) {
        clockEl.textContent = now.toLocaleDateString('ru-RU') + ' ' + now.toLocaleTimeString('ru-RU');
      }
    };
    update();
    this.state.clockInterval = setInterval(update, 1000);
  },

  startCallTimer() {
    if (this.state.session.timerInterval) {
      clearInterval(this.state.session.timerInterval);
    }
    this.state.session.startTime = Date.now();
    this.state.session.elapsedSeconds = 0;
    
    const timerBox = document.getElementById('callTimerBox');
    const timerVal = document.getElementById('callTimerVal');
    
    this.state.session.timerInterval = setInterval(() => {
      this.state.session.elapsedSeconds++;
      const s = this.state.session.elapsedSeconds;
      const mins = String(Math.floor(s / 60)).padStart(2, '0');
      const secs = String(s % 60).padStart(2, '0');
      
      if (timerVal) timerVal.textContent = `[${mins}:${secs}]`;
      const digitsEl = document.getElementById('callTimerDigits');
      if (digitsEl) digitsEl.textContent = `${mins}:${secs}`;
      
      if (timerBox) {
        if (s > 75) {
          timerBox.className = 'call-timer-box overdue';
        } else if (s > 45) {
          timerBox.className = 'call-timer-box warning';
        } else {
          timerBox.className = 'call-timer-box';
        }
      }
    }, 1000);
  },

  stopCallTimer() {
    if (this.state.session.timerInterval) {
      clearInterval(this.state.session.timerInterval);
      this.state.session.timerInterval = null;
    }
  },

  // ==================== ВЗАИМОДЕЙСТВИЕ С API СЕССИИ ====================
  async loadTickets() {
    try {
      const res = await fetch('/api/tickets');
      const data = await res.json();
      this.state.tickets = data.tickets || [];
      this.renderTicketSelector();
    } catch (e) {
      console.warn('Ошибка загрузки билетов:', e);
    }
  },

  renderTicketSelector() {
    const select = document.getElementById('ticketSelect');
    if (!select) return;
    select.innerHTML = '';
    this.state.tickets.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.ticket_id;
      const q = t.questions && t.questions[0] ? t.questions[0] : null;
      const title = q ? `${q.category} (${q.expected_group})` : 'Экзаменационный билет';
      opt.textContent = `Билет №${t.ticket_id} — ${title}`;
      select.appendChild(opt);
    });
    select.value = this.state.session.ticketId;
  },

  async startCallSession() {
    const ticketId = parseInt(document.getElementById('ticketSelect')?.value || '1', 10);
    this.state.session.ticketId = ticketId;
    this.state.session.questionId = 1;

    try {
      const res = await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: ticketId,
          question_id: 1,
          operator_name: 'Курсант Иванов И.И.'
        })
      });

      if (!res.ok) throw new Error('Не удалось начать сессию');
      const data = await res.json();

      this.state.session.active = true;
      this.state.session.sessionId = data.session_id;
      this.state.session.callerName = data.caller_name || 'Заявитель';
      this.state.session.callerPhone = data.caller_phone || '+7 (916) 126-34-71';
      this.state.session.panicLevel = data.panic_level || 65;
      this.state.session.applicantState = data.state || 'panic';

      // Обновляем визуальный статус ПОВ-112
      this.setLineStatus(true);
      this.startCallTimer();

      // Заполняем телефонию
      this.updateField('aonInput', this.state.session.callerPhone);
      this.updateField('providedInput', this.state.session.callerPhone);
      this.updateField('applicantName', this.state.session.callerName);

      // Генерируем новый номер происшествия
      const incId = `77-${new Date().getFullYear()}-${String(Math.floor(10000 + Math.random() * 90000))}`;
      this.state.card.incidentId = incId;
      const incPlate = document.getElementById('incidentPlateId');
      if (incPlate) incPlate.textContent = `Происшествие № ${incId}`;

      // Активация ввода речи оператора сразу при принятии вызова
      const speechInput = document.getElementById('operatorSpeechInput');
      if (speechInput) {
        speechInput.disabled = false;
        speechInput.focus();
      }
      const btnSend = document.getElementById('btnSendSpeech');
      if (btnSend) btnSend.disabled = false;

      // Обновляем диалоговую плашку с 3-секундным окном тишины (оператор может поздороваться первым)
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }
      this.silenceTimer = setTimeout(() => {
        this.silenceTimer = null;
        this.renderApplicantDialog(data.initial_message);
      }, 3000);

      // Подсказка для курсанта по выбранному билету
      this.loadScenarioHints(ticketId);

      const btnStart = document.getElementById('btnStartCall');
      if (btnStart) {
        btnStart.textContent = '📞 Звонок активен';
        btnStart.disabled = true;
      }
    } catch (err) {
      alert('Ошибка старта звонка: ' + err.message);
    }
  },

  loadScenarioHints(ticketId) {
    const t = this.state.tickets.find(x => x.ticket_id === ticketId);
    if (!t || !t.questions || !t.questions[0]) return;
    const q = t.questions[0];
    const hintBox = document.getElementById('examScenarioHint');
    if (hintBox) {
      hintBox.innerHTML = `
        <div class="tip-title">📋 Фабула вводной задачи билета №${ticketId}:</div>
        <div class="tip-body">«${q.situation}». Адрес ориентира: <b>${q.address}</b>. Ожидаемые службы: <b>${(q.expected_services || []).join(', ')}</b>.</div>
      `;
    }
  },

  setLineStatus(online) {
    const badge = document.getElementById('lineStatusBadge');
    const hwHeadset = document.getElementById('hwHeadset');
    const hwRec = document.getElementById('hwRec');

    if (online) {
      if (badge) {
        badge.className = 'line-status-badge online';
        badge.innerHTML = '<span class="status-dot"></span> НА ЛИНИИ';
      }
      if (hwHeadset) hwHeadset.classList.add('active');
      if (hwRec) hwRec.classList.add('rec');
    } else {
      if (badge) {
        badge.className = 'line-status-badge offline';
        badge.innerHTML = '<span class="status-dot"></span> НЕ ПОДКЛЮЧЕН';
      }
      if (hwHeadset) hwHeadset.classList.remove('active');
      if (hwRec) hwRec.classList.remove('rec');
    }
  },

  renderApplicantDialog(speechText) {
    const bar = document.getElementById('applicantDialogBar');
    if (bar) bar.classList.remove('hidden');

    const nameEl = document.getElementById('applicantDialogName');
    if (nameEl) nameEl.textContent = this.state.session.callerName;

    const speechEl = document.getElementById('applicantSpeechText');
    if (speechEl) speechEl.textContent = speechText;

    this.updatePanicBar(this.state.session.panicLevel);

    if (window.audioDSP) {
      window.audioDSP.speakApplicant(speechText, {
        panicLevel: this.state.session.panicLevel,
        state: this.state.session.applicantState
      });
    }
  },

  updatePanicBar(level) {
    this.state.session.panicLevel = level;
    const bar = document.getElementById('panicBarFill');
    const label = document.getElementById('panicStateLabel');
    if (bar) bar.style.width = Math.min(100, Math.max(10, level)) + '%';
    if (label) {
      if (level > 70) {
        label.textContent = `Паника: ${level}% (Агрессия / Шок)`;
        if (bar) bar.style.background = 'var(--red-alert)';
      } else if (level > 40) {
        label.textContent = `Паника: ${level}% (Взволнован)`;
        if (bar) bar.style.background = 'var(--amber-warn)';
      } else {
        label.textContent = `Паника: ${level}% (Сотрудничает)`;
        if (bar) bar.style.background = 'var(--green-online)';
      }
    }
  },

  resolveAudioUrl(audioId) {
    if (!audioId) return '';
    if (audioId.startsWith('http://') || audioId.startsWith('https://') || audioId.startsWith('/')) {
      return audioId;
    }
    const cleanId = audioId.endsWith('.mp3') ? audioId.slice(0, -4) : audioId;
    if (cleanId.startsWith('brk_')) {
      return `/audio/modular/bricks/${cleanId}.mp3`;
    } else if (cleanId.startsWith('t01_')) {
      return `/audio/modular/t01_s01/${cleanId}.mp3`;
    } else if (cleanId.startsWith('univ_')) {
      return `/audio/modular/universal/${cleanId}.mp3`;
    }
    return `/audio/modular/${cleanId}.mp3`;
  },

  async sendOperatorMessage(text) {
    if (!this.state.session.active || !this.state.session.sessionId) {
      alert('Сначала примите входящий вызов (кнопка «Принять вызов» вверху)!');
      return;
    }
    if (!text || !text.trim()) return;

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    // Сразу при отправке реплики оператора: вызов Zero-Vacuum ожидания (акустическая маскировка)
    const dsp = window.audioDSP || window.audioDsp;
    if (dsp && dsp.ambienceEngine && typeof dsp.ambienceEngine.triggerOperatorSpeakingState === 'function') {
      dsp.ambienceEngine.triggerOperatorSpeakingState(false);
    }

    // Защита от Race Conditions: блокировка ввода и кнопок отправки на время запроса
    const input = document.getElementById('operatorSpeechInput');
    const sendBtn = document.getElementById('btnSendSpeech') || document.getElementById('btnSendOperatorSpeech');
    const chips = document.querySelectorAll('.speech-chip, .speech-quick-btn');
    if (input) input.disabled = true;
    if (sendBtn) sendBtn.disabled = true;
    chips.forEach(c => { c.disabled = true; });

    try {
      const res = await fetch('/api/session/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: this.state.session.sessionId,
          message: text.trim()
        })
      });
      if (!res.ok) throw new Error('Ошибка связи с абонентом');
      const data = await res.json();

      // Обработка сбоя SLM Qwen 2.5
      if (data.execution_path === 'slm_error' || data.event === 'slm_error') {
        const errDetails = data.error_details || data.reply || 'Неизвестная ошибка инференса SLM';
        console.error('⚠️ [СБОЙ SLM QWEN 2.5]:', errDetails);
        alert(`⚠️ [СБОЙ SLM QWEN 2.5]: ${errDetails}`);
      }

      // Извлекаем data.reply
      const replyText = data.reply || '';

      // Обеспечить корректное отображение текста в стенограмме (applicantSpeechText)
      const speechEl = document.getElementById('applicantSpeechText');
      if (speechEl) speechEl.textContent = replyText;

      const bar = document.getElementById('applicantDialogBar');
      if (bar) bar.classList.remove('hidden');

      if (data.panic_level !== undefined) {
        this.updatePanicBar(data.panic_level);
      }
      if (data.state || data.applicant_state) {
        this.state.session.applicantState = data.applicant_state || data.state;
      }

      // Воспроизведение аудио через Web Audio DSP (Zero-Vacuum + дыхательная пауза)
      const breathPauseMs = data.breath_pause_ms !== undefined ? data.breath_pause_ms : 120;

      if (dsp) {
        if (data.audio_url) {
          const audioUrl = this.resolveAudioUrl(data.audio_url);
          if (typeof dsp.playAudioFile === 'function') {
            dsp.playAudioFile(audioUrl, {
              initialBreathPauseMs: breathPauseMs,
              state: data.applicant_state || data.state || this.state.session.applicantState,
              panicLevel: data.panic_level !== undefined ? data.panic_level : this.state.session.panicLevel
            });
          } else if (typeof dsp.playAudioUrl === 'function') {
            dsp.playAudioUrl(audioUrl, {
              initialBreathPauseMs: breathPauseMs,
              state: data.applicant_state || data.state || this.state.session.applicantState,
              panicLevel: data.panic_level !== undefined ? data.panic_level : this.state.session.panicLevel
            });
          }
        } else if (replyText) {
          dsp.speakApplicant(replyText, {
            initialBreathPauseMs: breathPauseMs,
            state: data.applicant_state || data.state || this.state.session.applicantState,
            panicLevel: data.panic_level !== undefined ? data.panic_level : this.state.session.panicLevel
          });
        }
      }

      if (data.event === 'cliche_triggered') {
        alert('⚠️ ВНИМАНИЕ: Нарушение регламента речи!\n' + data.penalty);
      }

      // Если заявитель назвал адрес, предлагаем автозаполнение
      if (data.event === 'address_revealed' && data.reply) {
        const addrMatch = data.reply.replace(/^Адрес запишите:\s*/i, '').replace(/!$/, '');
        if (addrMatch) {
          const fullAddrInput = document.getElementById('fullAddressInput');
          if (fullAddrInput && !fullAddrInput.value) {
            fullAddrInput.value = addrMatch;
            this.parseAndFillAddress(addrMatch);
          }
        }
      }

      // Если заявитель сообщил о пострадавших
      if (data.event === 'victims_revealed') {
        const hasVictims = data.reply.includes('нужна скорая') || data.reply.includes('плохо');
        const chk = document.getElementById('chkVictims');
        if (chk && hasVictims) {
          chk.checked = true;
          this.handleIndicatorChange();
        }
      }

      if (input) input.value = '';
    } catch (e) {
      alert('Ошибка диалога: ' + e.message);
    } finally {
      if (input) {
        input.disabled = false;
        input.focus();
      }
      if (sendBtn) sendBtn.disabled = false;
      chips.forEach(c => { c.disabled = false; });
    }
  },

  // ==================== КЛАССИФИКАТОР И ОПРОСНИК ====================
  async loadCategories() {
    try {
      const res = await fetch('/api/classifier/categories');
      const data = await res.json();
      this.state.categories = data.categories || [];
    } catch (e) {
      console.warn('Ошибка загрузки категорий:', e);
    }
  },

  renderQuestionnaireLevels() {
    // 1. Уровень 1 (Локация / Тип объекта)
    const cluster1 = document.getElementById('level1Cluster');
    if (cluster1) {
      cluster1.innerHTML = '';
      this.level1Presets.forEach(item => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'feature-btn' + (this.state.card.feature1 === item.value ? ' active' : '');
        btn.textContent = item.label;
        btn.onclick = () => this.selectFeature1(item.value);
        cluster1.appendChild(btn);
      });
    }

    // 2. Уровень 2 (Характер опасности)
    const cluster2 = document.getElementById('level2Cluster');
    if (cluster2) {
      cluster2.innerHTML = '';
      this.level2Presets.forEach(item => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'feature-btn' + (this.state.card.feature2 === item.value ? ' active' : '');
        btn.textContent = item.label;
        btn.onclick = () => this.selectFeature2(item.value);
        cluster2.appendChild(btn);
      });
    }

    // 3. Уровень 3 (Подуровни / Детализация)
    const cluster3 = document.getElementById('level3Cluster');
    if (cluster3) {
      cluster3.innerHTML = '';
      this.level3Presets.forEach(item => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'feature-btn' + (this.state.card.feature3 === item.value ? ' active' : '');
        btn.textContent = item.label;
        btn.onclick = () => this.selectFeature3(item.value);
        cluster3.appendChild(btn);
      });
    }

    this.updateCalculatedClassDisplay();
  },

  selectFeature1(val) {
    this.state.card.feature1 = val;
    this.renderQuestionnaireLevels();
    this.updateClassAndServices();
  },

  selectFeature2(val) {
    this.state.card.feature2 = val;
    this.renderQuestionnaireLevels();
    this.updateClassAndServices();
  },

  selectFeature3(val) {
    this.state.card.feature3 = val;
    this.renderQuestionnaireLevels();
    this.updateClassAndServices();
  },

  async searchClassifier(query) {
    if (!query || query.trim().length < 2) return;
    try {
      const res = await fetch(`/api/classifier/search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const best = data.results[0];
        if (best.feature1) this.state.card.feature1 = best.feature1;
        if (best.feature2) this.state.card.feature2 = best.feature2;
        if (best.feature3) this.state.card.feature3 = best.feature3;
        if (best.group) this.state.card.group = best.group;
        if (best.final_type) this.state.card.finalType = best.final_type;
        this.renderQuestionnaireLevels();
        this.recalculateServices();
      }
    } catch (e) {
      console.warn('Ошибка поиска классификатора:', e);
    }
  },

  updateCalculatedClassDisplay() {
    const f1 = this.state.card.feature1 || 'на улице';
    const f2 = this.state.card.feature2 || 'мусор';
    const f3 = this.state.card.feature3 || '';

    let calculatedName = `${f1}: ${f2}`;
    if (f2.includes('дым') || f2.includes('пламя') || f2.includes('гари') || f2.includes('мусор')) {
      calculatedName = `Пожар: ${f2}${f3 ? ' (' + f3 + ')' : ''}`;
    } else if (f2.includes('ДТП')) {
      calculatedName = `ДТП: ${f1}`;
    }

    this.state.card.finalType = calculatedName;
    this.state.card.group = `${f1} ${f2}`;

    const labelEl = document.getElementById('calculatedClassLabel');
    if (labelEl) {
      labelEl.textContent = `Класс: ${calculatedName}`;
    }

    const crumbsEl = document.getElementById('hierarchyCrumbs');
    if (crumbsEl) {
      crumbsEl.textContent = `ЕКП: ${f1} > ${f2} > ${f3 || 'норматив'}`;
    }
  },

  async updateClassAndServices() {
    this.updateCalculatedClassDisplay();
    await this.recalculateServices();
  },

  _normalizeService(s, isManual = false) {
    if (!s) return { name: '', is_manual: false, isManual: false, status: 'Добавлена' };
    if (typeof s === 'string') {
      return { name: s, is_manual: isManual, isManual: isManual, status: 'Добавлена' };
    }
    const manual = s.is_manual !== undefined ? !!s.is_manual : (s.isManual !== undefined ? !!s.isManual : isManual);
    return {
      name: s.name || s.id || '',
      is_manual: manual,
      isManual: manual,
      status: s.status || 'Добавлена'
    };
  },

  async recalculateServices() {
    const plateActive = document.getElementById('plateVictims')?.classList.contains('active');
    const chkActive = !!document.getElementById('chkVictims')?.checked;
    const hasVictims = !!this.state.card.hasVictims || !!plateActive || !!chkActive;
    this.state.card.hasVictims = hasVictims;

    const isBlocked = !!document.getElementById('chkBlocked')?.checked ||
                      !!document.getElementById('plateBlocked')?.classList.contains('active');

    let backendServices = [];
    try {
      const res = await fetch('/api/classifier/calculate_services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          final_type: this.state.card.finalType || 'пожар',
          has_victims: hasVictims,
          is_blocked: isBlocked
        })
      });
      const data = await res.json();
      if (data.services && data.services.length > 0) {
        backendServices = data.services;
      }
    } catch (e) {
      // Offline fallback calculation
      const s = new Set(['Служба 101']);
      if (hasVictims) s.add('Служба 103');
      if (isBlocked) s.add('Служба 101');
      if ((this.state.card.finalType || '').includes('ДТП')) {
        s.add('Служба 102');
        s.add('ЦОДД');
      }
      backendServices = Array.from(s);
    }

    // При card.hasVictims === true в список служб ОБЯЗАТЕЛЬНО должна автоматически добавляться «Служба 103» / «ЦЭМП» со статусом «Добавлена»!
    if (hasVictims) {
      if (!backendServices.includes('Служба 103')) {
        backendServices.push('Служба 103');
      }
      const ft = (this.state.card.finalType || '').toLowerCase();
      if (ft.includes('пожар') || ft.includes('дтп') || ft.includes('взрыв') || ft.includes('обрушен') || ft.includes('массов')) {
        if (!backendServices.includes('ЦЭМП')) {
          backendServices.push('ЦЭМП');
        }
      }
    }

    // Сохраняем вручную добавленные оператором службы (is_manual: true)
    const currentManuals = (this.state.card.services || [])
      .map(s => this._normalizeService(s))
      .filter(s => s.is_manual);

    const newServices = backendServices.map(svcName => ({
      name: svcName,
      is_manual: false,
      isManual: false,
      status: 'Добавлена'
    }));

    currentManuals.forEach(m => {
      if (!newServices.some(ns => ns.name === m.name)) {
        newServices.push(m);
      }
    });

    this.state.card.services = newServices;
    this.renderServicesBar();
  },

  renderServicesBar() {
    const container = document.getElementById('servicesChipsFilling');
    if (!container) return;
    container.innerHTML = '';

    const list = this.state.card.services || [];
    list.forEach((item) => {
      const svcObj = this._normalizeService(item);
      const chip = document.createElement('div');
      chip.className = 'service-chip-plate';
      chip.dataset.service = svcObj.name;
      chip.dataset.isManual = svcObj.is_manual ? 'true' : 'false';

      // СТРОГО ПО РЕГЛАМЕНТУ СТР. 14 МЕТОДИЧКИ:
      // у автоматически назначенных служб НЕ ДОЛЖНО БЫТЬ кнопки удаления [✕]!
      // Кнопка удаления [✕] (.svc-remove-x) должна отображаться ТОЛЬКО у служб,
      // добавленных вручную через кнопку [+]!
      let removeBtnHtml = '';
      if (svcObj.is_manual) {
        removeBtnHtml = `<button type="button" class="svc-remove-x" title="Исключить службу">✕</button>`;
      }

      chip.innerHTML = `
        <span class="svc-icon">📞</span>
        <span class="svc-name">${svcObj.name}</span>
        ${removeBtnHtml}
      `;

      chip.onclick = (e) => {
        if (!e.target.closest('.svc-remove-x')) {
          this.openServiceModal(svcObj.name);
        }
      };

      if (svcObj.is_manual) {
        const removeBtn = chip.querySelector('.svc-remove-x');
        if (removeBtn) {
          removeBtn.onclick = (e) => {
            e.stopPropagation();
            this.removeService(svcObj.name);
          };
        }
      }

      container.appendChild(chip);
    });

    const plusBtn = document.createElement('button');
    plusBtn.type = 'button';
    plusBtn.className = 'btn-add-service-plus';
    plusBtn.title = 'Добавить службу';
    plusBtn.textContent = '+';
    plusBtn.onclick = () => this.addManualService();
    container.appendChild(plusBtn);
  },

  removeService(svcName) {
    const svc = (this.state.card.services || []).find(s => {
      const name = typeof s === 'string' ? s : s.name;
      return name === svcName;
    });
    const norm = svc ? this._normalizeService(svc) : null;
    if (norm && !norm.is_manual) {
      console.warn(`[Регламент стр. 14] Автоматически назначенную службу "${svcName}" запрещено удалять!`);
      alert(`Согласно Регламенту (стр. 14 методички) автоматически назначенные классификатором службы (autoAssigned) запрещено удалять!`);
      return;
    }
    this.state.card.services = (this.state.card.services || []).filter(s => {
      const name = typeof s === 'string' ? s : s.name;
      return name !== svcName;
    });
    this.renderServicesBar();
  },

  addManualService() {
    const currentNames = (this.state.card.services || []).map(s => typeof s === 'string' ? s : s.name);
    const available = this.serviceDirectory.filter(s => !currentNames.includes(s));
    if (available.length === 0) {
      alert('Все ведомственные службы уже добавлены в карточку.');
      return;
    }
    const chosen = prompt('Выберите службу для ручного добавления:\n' + available.map((s, i) => `${i + 1}. ${s}`).join('\n'));
    if (!chosen) return;
    const idx = parseInt(chosen.trim(), 10) - 1;
    if (!isNaN(idx) && available[idx]) {
      this.state.card.services.push({
        name: available[idx],
        is_manual: true,
        isManual: true,
        status: 'Добавлена'
      });
      this.renderServicesBar();
    } else {
      alert('Неверный выбор.');
    }
  },

  togglePlateVictims() {
    const plate = document.getElementById('plateVictims');
    const isActive = plate ? plate.classList.toggle('active') : !this.state.card.hasVictims;
    this.state.card.hasVictims = isActive;
    const chkVictims = document.getElementById('chkVictims');
    if (chkVictims) {
      chkVictims.checked = isActive;
      chkVictims.closest('.indicator-checkbox')?.classList.toggle('checked-victim', isActive);
    }
    this.recalculateServices();
  },

  // ==================== АДРЕСНЫЙ БЛОК ====================
  setOkrug(okrug) {
    this.state.card.okrug = okrug;
    document.querySelectorAll('.okrug-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.okrug === okrug);
    });
  },

  parseAndFillAddress(text) {
    if (!text) return;
    const fullInput = document.getElementById('fullAddressInput') || document.getElementById('fullAddressSearchInput');
    if (fullInput) fullInput.value = text;

    // Simple heuristic parser for Moscow addresses
    const streetMatch = text.match(/(?:ул\.|улица|пер\.|переулок|пр-кт|проспект|ш\.|шоссе|бульвар|наб\.)\s+([^,]+)/i) ||
                        text.match(/(?:около|ст\.|станция)\s+([^,]+)/i);
    const houseMatch = text.match(/(?:д\.|дом|вл\.|владение)\s*([0-9]+[а-яА-Я0-9\/\-]*)/i) ||
                       text.match(/\b([0-9]{1,3})\s*(?:стр|корп)/i);
    const corpMatch = text.match(/(?:корп\.|корпус)\s*([0-9]+[а-яА-Я0-9]*)/i);
    const strMatch = text.match(/(?:стр\.|строение|соор\.|сооружение)\s*([0-9]+[а-яА-Я0-9]*)/i);
    const buildingMatch = text.match(/(?:корп\.|корпус|стр\.|строение)\s*([0-9]+[а-яА-Я0-9]*)/i);
    const aptMatch = text.match(/(?:кв\.|квартира|офис)\s*([0-9]+)/i);

    if (streetMatch) this.updateField('addrStreet', streetMatch[0]);
    if (houseMatch) this.updateField('addrHouse', houseMatch[1]);
    if (corpMatch) {
      this.updateField('addrBuildingCorp', corpMatch[1]);
    } else if (buildingMatch) {
      this.updateField('addrBuildingCorp', buildingMatch[1]);
    }
    if (strMatch) this.updateField('addrBuildingStr', strMatch[1]);
    if (aptMatch) this.updateField('addrFlat', aptMatch[1]);

    const descInput = document.getElementById('addrDescriptive') || document.getElementById('addrDesc');
    if (descInput && !descInput.value) {
      descInput.value = text;
    }
  },

  // ==================== ИНДИКАТОРЫ И ЧЕКБОКСЫ ====================
  handleIndicatorChange() {
    const chkVictims = document.getElementById('chkVictims');
    const chkRefused = document.getElementById('chkRefused');
    const chkBlocked = document.getElementById('chkBlocked');
    const chkEmergency = document.getElementById('chkEmergency');
    const chkIncident = document.getElementById('chkIncident');

    chkVictims?.closest('.indicator-checkbox')?.classList.toggle('checked-victim', !!chkVictims?.checked);
    chkBlocked?.closest('.indicator-checkbox')?.classList.toggle('checked-warn', !!chkBlocked?.checked);
    chkRefused?.closest('.indicator-checkbox')?.classList.toggle('checked-warn', !!chkRefused?.checked);
    chkEmergency?.closest('.indicator-checkbox')?.classList.toggle('checked-emergency', !!chkEmergency?.checked);
    chkIncident?.closest('.indicator-checkbox')?.classList.toggle('checked-emergency', !!chkIncident?.checked);

    if (chkVictims) {
      this.state.card.hasVictims = !!chkVictims.checked;
      const plate = document.getElementById('plateVictims');
      if (plate) plate.classList.toggle('active', !!chkVictims.checked);
    }

    this.recalculateServices();
  },

  updateDescriptionCounter() {
    const txt = document.getElementById('descriptionText');
    const counter = document.getElementById('descCharCounter');
    if (!txt || !counter) return;

    const len = txt.value.length;
    counter.textContent = `${len} / 1999`;
    counter.classList.toggle('limit-near', len > 1800);
  },

  // ==================== ОТПРАВКА КАРТОЧКИ И АТТЕСТАЦИЯ ====================
  gatherCardPayload() {
    const hasVictims = document.getElementById('plateVictims')?.classList.contains('active') || !!document.getElementById('chkVictims')?.checked;
    const refusedMed = document.getElementById('plateRefused')?.classList.contains('active') || !!document.getElementById('chkRefused')?.checked;
    const isBlocked = document.getElementById('plateBlocked')?.classList.contains('active') || !!document.getElementById('chkBlocked')?.checked;

    return {
      incident_id: this.state.card.incidentId || '913126',
      applicant_name: document.getElementById('applicantNameInput')?.value || document.getElementById('applicantName')?.value || 'Иванов Иван Иванович',
      applicant_status: document.getElementById('applicantStatusSelect')?.value || this.state.card.applicantStatus || 'очевидец',
      aon_phone: document.getElementById('aonInput')?.value || '+7 (916) 126-34-71',
      provided_phone: document.getElementById('providedInput')?.value || '+7 (916) 126-34-71',
      onscene_phone: document.getElementById('onsceneInput')?.value || '',
      has_victims: hasVictims,
      refused_medical: refusedMed,
      is_blocked: isBlocked,
      is_emergency_chs: !!document.getElementById('chkEmergency')?.checked,
      is_incident_chp: !!document.getElementById('chkIncident')?.checked,
      full_address: document.getElementById('fullAddressSearchInput')?.value || document.getElementById('fullAddressInput')?.value || 'Россия, Москва, Ясный проезд, 10',
      okrug: document.getElementById('addrOkrugSelect')?.value || this.state.card.okrug || 'СВАО',
      district: document.getElementById('addrDistrictSelect')?.value || document.getElementById('addrDistrict')?.value || 'Южное Медведково',
      street: document.getElementById('addrStreet')?.value || 'Ясный проезд',
      house: document.getElementById('addrHouse')?.value || '10',
      building_corp: document.getElementById('addrBuildingCorp')?.value || '',
      building_str: document.getElementById('addrBuildingStr')?.value || '',
      building: document.getElementById('addrBuildingCorp')?.value || document.getElementById('addrBuildingStr')?.value || document.getElementById('addrBuilding')?.value || '',
      entrance: document.getElementById('addrEntrance')?.value || '',
      floor: document.getElementById('addrFloor')?.value || '',
      apartment: document.getElementById('addrFlat')?.value || document.getElementById('addrApartment')?.value || '',
      flat: document.getElementById('addrFlat')?.value || '',
      intercom: document.getElementById('addrIntercomCode')?.value || document.getElementById('addrIntercom')?.value || '',
      address_desc: document.getElementById('addrDescriptive')?.value || document.getElementById('addrDesc')?.value || '',
      description: document.getElementById('descriptionText')?.value || '',
      feature1: this.state.card.feature1 || 'Дом',
      feature2: this.state.card.feature2 || 'Открытое пламя',
      feature3: this.state.card.feature3 || 'балкон',
      group: this.state.card.group || 'пожар в жилом доме',
      final_type: this.state.card.finalType || 'пожар: балкон (открытое пламя)',
      services: (this.state.card.services || ['Служба 101', 'Служба 102']).map(s => typeof s === 'string' ? s : s.name)
    };
  },

  async submitCard() {
    if (!this.state.session.active || !this.state.session.sessionId) {
      // Allow testing submission with simulated session
      this.state.session.sessionId = `sess_${Date.now()}_${this.state.session.ticketId}_1`;
      this.state.session.startTime = Date.now() - 48000;
    }

    const payload = this.gatherCardPayload();

    try {
      const res = await fetch('/api/session/submit_card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: this.state.session.sessionId,
          ticket_id: this.state.session.ticketId,
          question_id: this.state.session.questionId,
          card_data: payload
        })
      });

      if (!res.ok) throw new Error('Ошибка отправки карточки');
      const data = await res.json();

      this.stopCallTimer();
      this.setLineStatus(false);
      this.state.session.active = false;
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }

      const btnStart = document.getElementById('btnStartCall');
      if (btnStart) {
        btnStart.textContent = '📞 Принять вызов';
        btnStart.disabled = false;
      }

      this.showEvaluationModal(data.evaluation, data.card_id, data.eval_id);
    } catch (e) {
      alert('Ошибка при регистрации карточки: ' + e.message);
    }
  },

  showEvaluationModal(evalData, cardId, evalId) {
    const modal = document.getElementById('evaluationModal');
    if (!modal) return;

    const scoreCircle = document.getElementById('evalScoreCircle');
    const statusTitle = document.getElementById('evalStatusTitle');
    const scoreVal = evalData.readiness_index || 0;

    if (scoreCircle) {
      scoreCircle.textContent = `${scoreVal}%`;
      scoreCircle.className = 'eval-score-circle ' + (scoreVal >= 80 ? '' : (scoreVal >= 60 ? 'warn' : 'fail'));
    }

    if (statusTitle) {
      statusTitle.textContent = evalData.status || 'ИТОГ АТТЕСТАЦИИ';
      statusTitle.style.color = scoreVal >= 80 ? 'var(--green-online)' : (scoreVal >= 60 ? 'var(--amber-warn)' : 'var(--red-alert)');
    }

    // Breakdown details
    const bd = evalData.breakdown || {};
    this.setText('evalAddrNotes', `Оценка: ${bd.address?.score || 0}% — ${(bd.address?.notes || []).join(', ')}`);

    // Add PDF download button if evalId exists
    const footer = document.querySelector('#evaluationModal .modal-footer');
    if (footer) {
      let pdfBtn = document.getElementById('btnDownloadPdf');
      if (!pdfBtn) {
        pdfBtn = document.createElement('a');
        pdfBtn.id = 'btnDownloadPdf';
        pdfBtn.className = 'btn-bar-action btn-transfer';
        pdfBtn.style.textDecoration = 'none';
        pdfBtn.style.marginRight = '10px';
        pdfBtn.target = '_blank';
        pdfBtn.textContent = '📄 Скачать протокол (PDF)';
        footer.insertBefore(pdfBtn, footer.firstChild);
      }
      if (evalId) {
        pdfBtn.href = `/api/evaluations/${evalId}/pdf`;
        pdfBtn.style.display = 'inline-block';
      } else {
        pdfBtn.style.display = 'none';
      }
    }
    this.setText('evalClassNotes', `Оценка: ${bd.classification?.score || 0}% — ${(bd.classification?.notes || []).join(', ')}`);
    this.setText('evalServicesNotes', `Оценка: ${bd.services?.score || 0}% — ${(bd.services?.notes || []).join(', ')}`);
    this.setText('evalTimeNotes', `Время: ${evalData.duration_seconds || 0} с — ${(bd.timing?.notes || []).join(', ')}`);

    // Recommendations list
    const recList = document.getElementById('evalRecList');
    if (recList) {
      recList.innerHTML = '';
      (evalData.recommendations || ['Соблюдайте регламент опроса']).forEach(r => {
        const li = document.createElement('li');
        li.textContent = r;
        recList.appendChild(li);
      });
    }

    modal.classList.add('open');
    modal.classList.remove('hidden');
  },

  closeEvaluationModal() {
    const modal = document.getElementById('evaluationModal');
    if (modal) {
      modal.classList.remove('open');
      modal.classList.add('hidden');
    }
  },

  // ==================== ПУЛЬТ ДДС ====================
  async loadDdsCards() {
    try {
      const res = await fetch('/api/dds/cards');
      const data = await res.json();
      this.state.ddsCards = data.cards || [];
      this.renderDdsCards();
    } catch (e) {
      console.warn('Ошибка загрузки карточек ДДС:', e);
    }
  },

  renderDdsCards() {
    const grid = document.getElementById('ddsCardsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    if (this.state.ddsCards.length === 0) {
      grid.innerHTML = '<div style="color:var(--text-muted); padding:20px;">Нет активных нерассмотренных карточек в очереди ДДС.</div>';
      return;
    }

    this.state.ddsCards.forEach(c => {
      const cardEl = document.createElement('div');
      cardEl.className = 'dds-card';

      const servicesRows = (c.services || []).map(s => {
        const st = (c.service_statuses && c.service_statuses[s]) || {};
        const timeLeft = st.time_left !== undefined ? Math.round(st.time_left) : 30;
        const isOverdue = st.is_overdue || timeLeft <= 0;
        const timerClass = isOverdue ? 'expired' : (timeLeft <= 10 ? 'warn' : 'safe');

        return `
          <div class="dds-service-row">
            <div>
              <b>${s}</b>
              <div style="font-size:10px; color:#aaa;">Статус: ${st.status || 'Добавлена'}</div>
            </div>
            <div class="dds-sla-timer ${timerClass}">
              SLA: ${timeLeft} с ${isOverdue ? '⚠️ ПРЕВЫШЕНИЕ' : ''}
            </div>
          </div>
        `;
      }).join('');

      cardEl.innerHTML = `
        <div class="dds-card-header">
          <span class="dds-card-id">КП №${escapeHtml(c.card_id)}</span>
          <span class="service-status-badge accepted">${escapeHtml(c.status || 'Новая')}</span>
        </div>
        <div class="dds-card-body">
          <div><b>Тип:</b> ${escapeHtml(c.incident_type || 'Не указан')}</div>
          <div><b>Адрес:</b> ${escapeHtml(c.address || 'г. Москва')}</div>
        </div>
        <div class="dds-services-list">
          ${servicesRows}
        </div>
        <div class="dds-actions-group">
          <button type="button" class="btn-dds-action accept" onclick="ARM.actionDds('${c.card_id}', '${c.services[0] || 'Служба 101'}', 'Принята')">Принять вызов</button>
          <button type="button" class="btn-dds-action" onclick="ARM.actionDds('${c.card_id}', '${c.services[0] || 'Служба 101'}', 'В работе')">В работу</button>
          <button type="button" class="btn-dds-action duplicate" onclick="ARM.actionDds('${c.card_id}', '${c.services[0] || 'Служба 101'}', 'Дубликат')">Дубликат</button>
        </div>
      `;
      grid.appendChild(cardEl);
    });
  },

  async actionDds(cardId, serviceName, status) {
    try {
      const res = await fetch('/api/dds/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_id: cardId,
          service_name: serviceName,
          status: status,
          user_name: 'Диспетчер ДДС 01'
        })
      });
      if (!res.ok) throw new Error('Ошибка обработки статуса ДДС');
      this.loadDdsCards();
    } catch (e) {
      alert('Ошибка ДДС: ' + e.message);
    }
  },

  // ==================== КАБИНЕТ ПРЕПОДАВАТЕЛЯ ====================
  async loadTeacherPortal() {
    try {
      const res = await fetch('/api/evaluations/history');
      const data = await res.json();
      const tbody = document.getElementById('evaluationsTableBody');
      if (tbody) {
        tbody.innerHTML = '';
        (data.history || []).forEach(e => {
          const tr = document.createElement('tr');
          const scoreClass = e.readiness_index >= 80 ? 'high' : (e.readiness_index >= 60 ? 'medium' : 'low');
          tr.innerHTML = `
            <td><b>#${e.id}</b></td>
            <td>${e.cadet_username}</td>
            <td>Билет №${e.ticket_id} (в. ${e.question_id})</td>
            <td><span class="badge-score ${scoreClass}">${e.readiness_index}%</span></td>
            <td>${Math.round(e.duration_seconds)} с</td>
            <td>${e.status}</td>
            <td style="color:#888;">${e.created_at}</td>
          `;
          tbody.appendChild(tr);
        });
      }
    } catch (err) {
      console.warn('Ошибка загрузки оценок:', err);
    }
  },

  async autoGenerateScenario() {
    const plot = document.getElementById('scenarioPlotInput')?.value;
    if (!plot || !plot.trim()) {
      alert('Введите текст новостной фабулы происшествия');
      return;
    }
    try {
      const res = await fetch('/api/scenarios/auto_generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plot_text: plot,
          default_address: 'Москва, ул. Новый Арбат, д. 21'
        })
      });
      const data = await res.json();
      alert('✅ Сценарий успешно сгенерирован и добавлен в экзаменационную базу!');
      this.loadTickets();
    } catch (e) {
      alert('Ошибка генерации сценария: ' + e.message);
    }
  },

  // ==================== ПАНЕЛЬ АДМИНИСТРАТОРА ====================
  async loadAdminPanel() {
    try {
      const healthRes = await fetch('/api/health');
      const health = await healthRes.json();
      this.setText('adminRecordsCount', health.classifier_records);
      this.setText('adminTicketsCount', health.exam_tickets);
      this.setText('adminRuntime', health.runtime);

      const auditRes = await fetch('/api/admin/audit?limit=30');
      const audit = await auditRes.json();
      const tbody = document.getElementById('auditTableBody');
      if (tbody) {
        tbody.innerHTML = '';
        (audit.logs || []).forEach(l => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>#${l.id}</td>
            <td style="color:#90caf9;"><b>${l.username}</b></td>
            <td><code>${l.action}</code></td>
            <td>${l.details}</td>
            <td style="color:#888;">${l.created_at}</td>
          `;
          tbody.appendChild(tr);
        });
      }
    } catch (e) {
      console.warn('Ошибка загрузки данных администратора:', e);
    }
  },

  // ==================== ПЕРЕКЛЮЧАТЕЛЬ РОЛЕЙ ====================
  switchRole(role) {
    this.state.role = role;
    document.querySelectorAll('.role-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.role === role);
    });

    // Скрываем/показываем панели
    document.getElementById('armWorkspace')?.classList.toggle('hidden', role !== 'operator');
    document.getElementById('ddsWorkspace')?.classList.toggle('hidden', role !== 'dds');
    document.getElementById('teacherWorkspace')?.classList.toggle('hidden', role !== 'teacher');
    document.getElementById('adminWorkspace')?.classList.toggle('hidden', role !== 'admin');

    if (role === 'dds') {
      this.loadDdsCards();
      if (!this.state.ddsInterval) {
        this.state.ddsInterval = setInterval(() => this.loadDdsCards(), 3000);
      }
    } else {
      if (this.state.ddsInterval) {
        clearInterval(this.state.ddsInterval);
        this.state.ddsInterval = null;
      }
    }

    if (role === 'teacher') this.loadTeacherPortal();
    if (role === 'admin') this.loadAdminPanel();
  },


  // ==================== ЭТАЛОННЫЕ РЕЖИМЫ (СКРИНШОТЫ 3 И 4) ====================
  setMode(mode) {
    this.state.cardMode = mode;
    const body = document.body;
    if (mode === 'saved') {
      body.classList.remove('mode-filling');
      body.classList.add('mode-saved');
      document.getElementById('modeBtnFilling')?.classList.remove('active');
      document.getElementById('modeBtnSaved')?.classList.add('active');

      // 1. Реальный номер карточки (если был) или генерируем текущий
      let cardNum = this.state.card.number || this.state.card.id || this.state.session.ticketId;
      if (!cardNum) {
        const existingText = document.getElementById('incidentPlateNumber')?.textContent || '';
        const match = existingText.match(/\d+/);
        cardNum = match ? match[0] : Math.floor(100000 + Math.random() * 900000);
      }
      this.state.card.number = cardNum;
      const pNum = document.getElementById('incidentPlateNumber');
      if (pNum) pNum.textContent = `Происшествие ${cardNum}`;

      // 2. Текущая дата и время сохранения
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const dateStr = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
      const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      const pSaved = document.getElementById('incidentPlateSaved');
      if (pSaved) pSaved.textContent = `Сохр. ${dateStr} в ${timeStr}`;

      const pOper = document.getElementById('incidentPlateOper');
      if (pOper && !pOper.textContent.trim()) {
        pOper.textContent = 'Опер. 1002, АРМ 7, Системны...';
      }

      // 3. Реально введенные телефоны (АОН, предоставленный) — не перезаписывать статическими моками!
      const aon = document.getElementById('aonInput');
      const prov = document.getElementById('providedInput');
      if (aon && aon.value) this.state.card.phone = aon.value;
      if (prov && prov.value) this.state.card.providedPhone = prov.value;

      // 4. Реально введенный курсантом адрес (из полей улицы, дома, корпуса, строения, квартиры)
      const street = document.getElementById('addrStreet')?.value?.trim() || '';
      const house = document.getElementById('addrHouse')?.value?.trim() || '';
      const corp = document.getElementById('addrBuildingCorp')?.value?.trim() || '';
      const str = document.getElementById('addrBuildingStr')?.value?.trim() || '';
      const flat = document.getElementById('addrFlat')?.value?.trim() || '';
      const entrance = document.getElementById('addrEntrance')?.value?.trim() || '';
      const floor = document.getElementById('addrFloor')?.value?.trim() || '';
      const intercom = document.getElementById('addrIntercomCode')?.value?.trim() || '';
      const okrug = document.getElementById('addrOkrugSelect')?.value?.trim() || this.state.card.okrug || '';
      const district = document.getElementById('addrDistrictSelect')?.value?.trim() || '';
      const desc = document.getElementById('addrDescriptive')?.value?.trim() || document.getElementById('addrDesc')?.value?.trim() || '';

      const addrParts = ['Россия', 'Москва'];
      if (okrug || district) {
        addrParts.push(`(${[okrug, district].filter(Boolean).join(', ')})`);
      }
      if (street) addrParts.push(street);
      if (house) addrParts.push(house.toLowerCase().startsWith('д') ? house : `д. ${house}`);
      if (corp) addrParts.push(`корп. ${corp}`);
      if (str) addrParts.push(`стр. ${str}`);
      if (flat) addrParts.push(`кв. ${flat}`);
      if (entrance) addrParts.push(`под. ${entrance}`);
      if (floor) addrParts.push(`эт. ${floor}`);
      if (intercom) addrParts.push(`код ${intercom}`);

      const savedAddressText = addrParts.join(', ');
      const addrBlock = document.getElementById('addressBlockSaved');
      if (addrBlock) {
        addrBlock.innerHTML = `
          <div class="saved-address-container">
            <div class="saved-address-line">
              <span>${savedAddressText}</span>
              <span class="saved-map-icon">🗺️</span>
            </div>
            <div class="saved-address-descriptive">
              ${desc}
            </div>
          </div>
        `;
      }

      // 5. В блоке #questionnaireSaved формируй актуальную строку:
      // «Класс.: {рассчитанный класс происшествия}; [ВИС] Класс.: »
      const calculatedClass = this.state.card.finalType || (this.state.card.feature1 ? `${this.state.card.feature1}: ${this.state.card.feature2 || ''}` : 'пожар');
      const qSaved = document.getElementById('questionnaireSaved');
      if (qSaved) {
        qSaved.innerHTML = `
          <div class="incident-dark-plate-header">
            <span class="plate-title">Происшествие ${cardNum}</span>
          </div>

          <div class="saved-incident-description-card">
            <p class="saved-type-bold">${calculatedClass}</p>
            <p class="saved-type-note">${desc || street || 'Описание происшествия'}</p>
          </div>

          <div class="saved-classification-field">
            <span class="field-label">Класс.:</span>
            <span class="field-value">${calculatedClass};</span>
          </div>

          <div class="saved-classification-field">
            <span class="field-label">[ВИС] Класс.:</span>
            <span class="field-value empty"></span>
          </div>
        `;
      }

    } else {
      body.classList.remove('mode-saved');
      body.classList.add('mode-filling');
      document.getElementById('modeBtnSaved')?.classList.remove('active');
      document.getElementById('modeBtnFilling')?.classList.add('active');

      const timerDigits = document.getElementById('callTimerDigits');
      if (timerDigits && !this.state.session.active) timerDigits.textContent = '00:16';
    }
  },

  saveAndSwitchToSaved() {
    this.setMode('saved');
    console.log('[АРМ ПОВ-112] Карточка сохранена, переход в режим Сохраненной карточки (Скриншот 4)');
  },

  // Режим сохраненной карточки: алиас к единому реестру истории служб
  get savedServicesData() {
    return this.serviceHistory;
  },

  markDispatchedAndEvaluate() {
    alert('✅ Карточка № 913123 успешно отработана всеми оперативными службами ДДС!');
    this.submitCard();
  },

  copyAonToProvided() {
    const aonVal = document.getElementById('aonInput')?.value || '+7 (916) 126-34-71';
    const prov = document.getElementById('providedInput');
    if (prov) prov.value = aonVal;
  },

  copyAonToOnscene() {
    const aonVal = document.getElementById('aonInput')?.value || '+7 (916) 126-34-71';
    const onscene = document.getElementById('onsceneInput');
    if (onscene) onscene.value = aonVal;
  },

  clearAddressFields() {
    ['addrStreet', 'addrHouse', 'addrBuildingCorp', 'addrBuildingStr', 'addrFlat', 'addrEntrance', 'addrFloor', 'addrIntercomCode', 'addrDescriptive', 'addrObject'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const search = document.getElementById('fullAddressSearchInput');
    if (search) search.value = '';
  },

  toggleFeature(btn, featureKey, val) {
    if (!btn) return;
    if (featureKey === 'feature1' || featureKey === 'feature2') {
      const parentRow = btn.parentElement;
      if (parentRow) {
        parentRow.querySelectorAll('.pov-chip-btn').forEach(b => b.classList.remove('active'));
      }
      btn.classList.add('active');
      this.state.card[featureKey] = val;
    } else {
      btn.classList.toggle('active');
      this.state.card[featureKey] = val;
    }
    this.updateClassAndServices();
  },

  addDispatchRow() {
    const svc = document.getElementById('newDispatchServiceSelect')?.value || 'Служба 102';
    const where = document.getElementById('newDispatchWhere')?.value || '';
    const phone = document.getElementById('newDispatchPhone')?.value || '102';
    const fio = document.getElementById('newDispatchFio')?.value || 'Оператор';
    const msg = document.getElementById('newDispatchMessage')?.value || 'Информация передана';

    const tbody = document.getElementById('dispatchTableBody');
    const interactiveRow = tbody ? tbody.querySelector('.dispatch-row-interactive') : null;
    if (!tbody || !interactiveRow) return;

    const tr = document.createElement('tr');
    tr.className = 'dispatch-row-saved';
    const curDate = new Date();
    const dStr = curDate.toLocaleDateString('ru-RU').slice(0, 8) + ' ' + curDate.toLocaleTimeString('ru-RU').slice(0, 5);
    const tStr = curDate.toLocaleTimeString('ru-RU').slice(0, 5);
    tr.innerHTML = `
      <td class="badge-cell-wine">1002</td>
      <td class="badge-cell-wine">7</td>
      <td class="badge-cell-wine">${dStr}</td>
      <td class="badge-cell-white">${tStr} ${escapeHtml(svc)}</td>
      <td>${escapeHtml(where)}</td>
      <td>${escapeHtml(phone)}</td>
      <td><span class="handset-mini">📞</span> ${escapeHtml(fio)}</td>
      <td>${escapeHtml(msg)}</td>
    `;
    tbody.insertBefore(tr, interactiveRow);

    if (document.getElementById('newDispatchWhere')) document.getElementById('newDispatchWhere').value = '';
    if (document.getElementById('newDispatchPhone')) document.getElementById('newDispatchPhone').value = '';
    if (document.getElementById('newDispatchFio')) document.getElementById('newDispatchFio').value = '';
    if (document.getElementById('newDispatchMessage')) document.getElementById('newDispatchMessage').value = '';
  },

  triggerCallEvent(evtType) {
    if (evtType === 'no_contact') {
      alert('Зафиксировано событие телефонии: «нет контакта» с абонентом.');
    } else if (evtType === 'call_drop') {
      alert('Зафиксировано событие: «срыв звонка». Инициируется повторный дозвон по АОН.');
    }
  },

  // ==================== СВЯЗЫВАНИЕ СОБЫТИЙ UI ====================
  bindEvents() {
    // Переключатель ролей
    document.querySelectorAll('.role-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchRole(btn.dataset.role));
    });

    // Старт звонка
    document.getElementById('btnStartCall')?.addEventListener('click', () => this.startCallSession());

    // Переключение статуса заявителя
    document.querySelectorAll('.status-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.status-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.state.card.applicantStatus = btn.textContent.trim();
      });
    });

    // Округа Москвы
    document.querySelectorAll('.okrug-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setOkrug(btn.dataset.okrug));
    });

    // Чекбоксы-индикаторы
    ['chkVictims', 'chkRefused', 'chkBlocked', 'chkEmergency', 'chkIncident'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => this.handleIndicatorChange());
    });

    // Счетчик символов описания
    document.getElementById('descriptionText')?.addEventListener('input', () => this.updateDescriptionCounter());

    // Поиск по классификатору
    let searchDebounce = null;
    document.getElementById('classifierSearchInput')?.addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => this.searchClassifier(e.target.value), 250);
    });

    // Поиск по адресу
    document.getElementById('btnSearchAddress')?.addEventListener('click', () => {
      const val = document.getElementById('fullAddressInput')?.value;
      if (val) this.parseAndFillAddress(val);
    });

    // Диалог: отправка сообщений
    document.getElementById('btnSendSpeech')?.addEventListener('click', () => {
      const input = document.getElementById('operatorSpeechInput');
      if (input) this.sendOperatorMessage(input.value);
    });
    document.getElementById('operatorSpeechInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.sendOperatorMessage(e.target.value);
      }
    });

    // Быстрые фразы деэскалации и захвата внимания
    document.querySelectorAll('.quick-phrase-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.sendOperatorMessage(btn.dataset.phrase || btn.textContent);
      });
    });

    // Кнопки телефонии
    document.getElementById('btnNoContact')?.addEventListener('click', () => {
      alert('Зафиксирован статус: «Нет контакта с заявителем». Карточка обновлена.');
    });
    document.getElementById('btnCallDrop')?.addEventListener('click', () => {
      alert('Зафиксирован «Срыв звонка». Автоматический повторный перезвон на АОН.');
    });

    // Нижняя панель действий
    document.getElementById('btnAddServiceManual')?.addEventListener('click', () => this.addManualService());
    document.getElementById('btnSaveDraft')?.addEventListener('click', () => {
      alert('Черновик карточки сохранен локально в хранилище оператора.');
    });
    document.getElementById('btnDispatchCard')?.addEventListener('click', () => this.submitCard());
    document.getElementById('btnFinishCall')?.addEventListener('click', () => {
      if (confirm('Завершить опрос и закрыть текущий вызов?')) {
        this.submitCard();
      }
    });

    // Модальное окно аттестации
    document.getElementById('btnCloseEvalModal')?.addEventListener('click', () => this.closeEvaluationModal());
    document.getElementById('btnNextTicket')?.addEventListener('click', () => {
      this.closeEvaluationModal();
      const sel = document.getElementById('ticketSelect');
      if (sel) {
        sel.selectedIndex = (sel.selectedIndex + 1) % sel.options.length;
        this.startCallSession();
      }
    });

    // Генерация сценария в кабинете преподавателя
    document.getElementById('btnGenerateScenario')?.addEventListener('click', () => this.autoGenerateScenario());

    // Панель проставления статуса оператора (Скриншот 1)
    document.getElementById('btnOperatorConfirmStatus')?.addEventListener('click', () => this.confirmStatus());
    document.getElementById('btnOperatorCancelStatus')?.addEventListener('click', () => this.closeStatusPanel());
    document.getElementById('btnOperatorClosePopup')?.addEventListener('click', () => {
      this.closeServicePopup();
    });

    const opSelect = document.getElementById('operatorStatusSelect');
    const opComment = document.getElementById('operatorStatusCommentInput');
    if (opSelect && opComment) {
      opSelect.addEventListener('change', () => {
        if (opSelect.value === 'Не принята') {
          if (opComment.value === 'Направлены рабочие') {
            opComment.value = '';
            opComment.placeholder = 'Обоснование отказа...';
          }
        } else if (opSelect.value === 'Принята') {
          if (!opComment.value) {
            opComment.value = 'Направлены рабочие';
            opComment.placeholder = 'Направлены рабочие';
          }
        }
      });
    }

    // Закрытие панели при клике вне ее
    document.addEventListener('click', (e) => {
      const panel = document.getElementById('operatorStatusPanel');
      if (panel && !panel.classList.contains('hidden') && !panel.contains(e.target) && !e.target.closest('.btn-tab-pencil') && !e.target.closest('#btnAssignCardStatus') && !e.target.closest('.btn-tab-open-status')) {
        this.closeStatusPanel();
      }
    });

    // Карточки служб в режиме сохранения
    document.querySelectorAll('#savedServiceBlocksRow .saved-service-status-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (!e.target.closest('.btn-tab-pencil') && !e.target.closest('.btn-tab-arrow')) {
          const svc = card.dataset.service;
          if (svc) this.openServiceModal(svc);
        }
      });
    });

    // Плашки служб в режиме заполнения
    const fillingChips = document.getElementById('servicesChipsFilling');
    if (fillingChips) {
      fillingChips.addEventListener('click', (e) => {
        const chip = e.target.closest('.service-chip-plate');
        if (!chip || e.target.closest('.svc-remove-x')) return;
        const svc = chip.dataset.service || chip.querySelector('.svc-name')?.textContent || '';
        if (svc) this.openServiceModal(svc);
      });
    }

    // Переход на вкладку карты по клику на иконку
    document.querySelectorAll('.map-ico, .saved-map-icon, .addr-label-map').forEach(icon => {
      icon.addEventListener('click', () => this.switchMainTab('map'));
    });
  },

  operatorDirectory: {
    'оп. 908': 'Смирнов А. В.',
    'оп. 464': 'Артёмова А. В.',
    'оп. 0': 'Системный оператор ДДС',
    'оп. 14': 'Рожкова О. И.',
    'оп. 1002': 'Петрова С. И.',
    'оп. 9999': 'Внешняя информационная система (ВИС)'
  },

  // ==================== РЕГЛАМЕНТНЫЕ СТАТУСЫ СЛУЖБ (СКРИНШОТ 1-4) ====================
  serviceHistory: {
    'Служба 101': [
      { operator: 'оп. 908', fio: 'Артёмова А. В.', time: '31.01.2025 08:57:39', status: 'Добавлена', isRejected: false },
      { operator: 'оп. 9999', fio: 'Внешняя информационная система (ВИС)', time: '31.01.2025 08:57:40', status: 'Получена службой', isRejected: false },
      { operator: 'оп. 9999', fio: 'Внешняя информационная система (ВИС)', time: '31.01.2025 09:02:25', status: 'Не принята', isRejected: true, is_red: true, comment: 'Заявка отклонена: передано в округ' }
    ],
    'ЦОДД': [
      { operator: 'оп. 464', fio: 'Смирнов И. К.', time: '31.01.2025 08:55:10', status: 'Добавлена', isRejected: false },
      { operator: 'оп. 0', fio: 'Системный оператор ДДС', time: '31.01.2025 08:56:00', status: 'Получена службой', isRejected: false },
      { operator: 'оп. 0', fio: 'Системный оператор ДДС', time: '31.01.2025 08:57:15', status: 'Работы завершены', isRejected: false }
    ],
    'Автодороги': [
      { operator: 'оп. 908', fio: 'Артёмова А. В.', time: '31.01.2025 13:20:00', status: 'Добавлена', isRejected: false },
      { operator: 'оп. 0', fio: 'Системный оператор ДДС', time: '31.01.2025 13:20:45', status: 'Получена службой', isRejected: false },
      { operator: 'оп. 0', fio: 'Системный оператор ДДС', time: '31.01.2025 13:22:10', status: 'Работы завершены', isRejected: false }
    ],
    'Россети МР': [
      { operator: 'оп. 908', fio: 'Артёмова А. В.', time: '31.01.2025 09:00:12', status: 'Добавлена', isRejected: false },
      { operator: 'оп. 9999', fio: 'Внешняя информационная система (ВИС)', time: '31.01.2025 09:00:30', status: 'Получена службой', isRejected: false },
      { operator: 'оп. 9999', fio: 'Внешняя информационная система (ВИС)', time: '31.01.2025 09:12:05', status: 'Не принята', isRejected: true, is_red: true, comment: 'нет повреждений сетей' }
    ],
    'МОЭК': [
      { operator: 'оп. 908', fio: 'Артёмова А. В.', time: '31.01.2025 08:57:39', status: 'Добавлена', isRejected: false },
      { operator: 'оп. 0', fio: 'Системный оператор ДДС', time: '31.01.2025 08:59:10', status: 'Получена службой', isRejected: false },
      { operator: 'оп. 0', fio: 'Системный оператор ДДС', time: '31.01.2025 08:59:59', status: 'Не принята', isRejected: true, is_red: true, comment: 'вне компетенции моэк' }
    ],
    'ЦЭМП': [
      { operator: 'оп. 464', fio: 'Смирнов И. К.', time: '31.01.2025 19:23:53', status: 'Добавлена', isRejected: false },
      { operator: 'оп. 0', fio: 'Системный оператор ДДС', time: '31.01.2025 19:27:06', status: 'Получена службой', isRejected: false },
      { operator: 'оп. 0', fio: 'Системный оператор ДДС', time: '31.01.2025 19:27:14', status: 'Принята', isRejected: false, is_red: true },
      { operator: 'оп. 0', fio: 'Системный оператор ДДС', time: '31.01.2025 19:27:18', status: 'Работы завершены', isRejected: false }
    ],
    'ДДС ТиНАО': [
      { operator: 'Попова М А', is_fio: true, time: '01.02.2025 15:41:55', status: 'Добавлена', isRejected: false },
      { operator: 'Платонова Е А', is_fio: true, time: '01.02.2025 15:42:24', status: 'Получена службой', isRejected: false },
      { operator: 'Платонова Е А', is_fio: true, time: '01.02.2025 15:42:37', status: 'Принята', isRejected: false }
    ],
    'Упр. Чертанов...': [
      { operator: 'оп. 14', fio: 'Рожкова О. И.', time: '20.08.2021 11:59:43', status: 'Добавлена', isRejected: false },
      { operator: 'оп. 0', fio: 'Системный оператор ДДС', time: '20.08.2021 13:22:25', status: 'Получена службой', isRejected: false }
    ],
    'Преф. ЮАО': [
      { operator: 'оп. 14', fio: 'Рожкова О. И.', time: '20.08.2021 11:59:43', status: 'Добавлена', isRejected: false }
    ],
    'Деп. природ.': [
      { operator: 'оп. 14', fio: 'Рожкова О. И.', time: '20.08.2021 11:59:43', status: 'Добавлена', isRejected: false }
    ],
    'Служба 102': [
      { operator: 'оп. 1002', fio: 'Петрова С. И.', time: '16.12.2022 14:53:10', status: 'Добавлена', isRejected: false }
    ],
    'Служба 103': [
      { operator: 'оп. 1002', fio: 'Петрова С. И.', time: '16.12.2022 14:50:00', status: 'Добавлена', isRejected: false }
    ],
    'ОМВД': [
      { operator: 'оп. 1002', fio: 'Петрова С. И.', time: '16.12.2022 14:53:10', status: 'Добавлена', isRejected: false }
    ],
    'Преф. ЮВАО': [
      { operator: 'оп. 1002', fio: 'Петрова С. И.', time: '16.12.2022 14:53:10', status: 'Добавлена', isRejected: false }
    ],
    'Упр. Печатники': [
      { operator: 'оп. 1002', fio: 'Петрова С. И.', time: '16.12.2022 14:53:10', status: 'Добавлена', isRejected: false }
    ]
  },
  currentEditingService: 'Служба 102',

  openStatusPanel(svcName, btnEl) {
    this.currentEditingService = svcName || 'Служба 102';
    const panel = document.getElementById('operatorStatusPanel');
    if (!panel) return;

    this.closeServicePopup();

    const targetCard = btnEl ? (btnEl.closest('.saved-service-status-card') || btnEl.parentElement) : document.querySelector(`#savedServiceBlocksRow [data-service="${this.currentEditingService}"]`);
    if (targetCard) {
      document.querySelectorAll('#savedServiceBlocksRow .saved-service-status-card').forEach(c => c.classList.remove('active-service-tab'));
      targetCard.classList.add('active-service-tab');

      const rect = targetCard.getBoundingClientRect();
      panel.style.position = 'fixed';
      panel.style.bottom = Math.max(10, window.innerHeight - rect.top + 4) + 'px';
      panel.style.top = 'auto';
      const maxLeft = Math.max(10, window.innerWidth - 620);
      panel.style.left = Math.min(Math.max(10, rect.left), maxLeft) + 'px';
      panel.style.right = 'auto';
    }

    const selectEl = document.getElementById('operatorStatusSelect');
    const orderEl = document.getElementById('operatorStatusOrderInput');
    const commentEl = document.getElementById('operatorStatusCommentInput');

    if (selectEl) selectEl.value = 'Принята';
    if (orderEl) {
      orderEl.value = 'Номер наряда';
      orderEl.placeholder = 'Номер наряда';
    }
    if (commentEl) {
      commentEl.value = 'Направлены рабочие';
      commentEl.placeholder = 'Направлены рабочие';
      commentEl.classList.remove('input-error');
    }

    panel.classList.remove('hidden');
  },

  closeStatusPanel() {
    const panel = document.getElementById('operatorStatusPanel');
    if (panel) panel.classList.add('hidden');
    const popup = document.getElementById('operatorStatusPopup');
    if (popup && popup.classList.contains('hidden')) {
      document.querySelectorAll('#savedServiceBlocksRow .saved-service-status-card').forEach(c => {
        c.classList.remove('active-service-tab');
        const arrow = c.querySelector('.btn-tab-arrow');
        if (arrow) arrow.textContent = '⌃';
      });
    }
  },

  confirmStatus() {
    const selectEl = document.getElementById('operatorStatusSelect');
    const orderEl = document.getElementById('operatorStatusOrderInput');
    const commentEl = document.getElementById('operatorStatusCommentInput');

    const statusVal = selectEl ? selectEl.value : 'Принята';
    const orderVal = orderEl ? orderEl.value.trim() : '';
    const commentVal = commentEl ? commentEl.value.trim() : '';
    const svcName = this.currentEditingService || 'Служба 102';

      // Обязательное обоснование для остальных служб
      if (!commentVal || commentVal === 'Направлены рабочие' || commentVal.length < 3) {
        if (commentEl) {
          commentEl.classList.add('input-error');
          commentEl.focus();
        }
        alert('Для статуса «Не принята» необходимо указать обязательное обоснование отказа (согласно ТЗ)!');
        return;
      }
    }
    if (commentEl) commentEl.classList.remove('input-error');

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const shortTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const fullTime = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    if (!this.serviceHistory[svcName]) {
      this.serviceHistory[svcName] = [];
    }

    const fullComment = (orderVal && orderVal !== 'Номер наряда')
      ? `Наряд № ${orderVal}${commentVal && commentVal !== 'Направлены рабочие' ? ': ' + commentVal : ''}`
      : (commentVal || 'Направлены рабочие');

    const isRejected = (statusVal === 'Не принята');

    this.serviceHistory[svcName].push({
      operator: 'оп. 1002',
      fio: 'Петрова С. И.',
      time: fullTime,
      status: statusVal,
      comment: fullComment,
      isRejected: isRejected,
      is_red: isRejected
    });

    const targetCard = document.querySelector(`#savedServiceBlocksRow [data-service="${svcName}"]`) ||
                       [...document.querySelectorAll('.saved-service-status-card')].find(c => c.querySelector('.title')?.textContent.includes(svcName));

    if (targetCard) {
      const foot = targetCard.querySelector('.svc-card-foot');
      if (foot) {
        if (isRejected) {
          foot.innerHTML = `<span class="status-time-badge-red tab-time-badge-rejected">${shortTime}</span> Не принята`;
        } else {
          foot.textContent = `${shortTime} ${statusVal}`;
        }
      }
    }

    this.closeStatusPanel();
    this.toggleServicePopup(svcName, targetCard);
  },

  toggleServicePopup(svcName, btnEl) {
    const popup = document.getElementById('operatorStatusPopup');
    if (!popup) return;

    if (!popup.classList.contains('hidden') && this.currentEditingService === svcName) {
      this.closeServicePopup();
      return;
    }

    this.currentEditingService = svcName;
    this.closeStatusPanel();

    const targetCard = btnEl ? (btnEl.closest('.saved-service-status-card') || btnEl.parentElement) : document.querySelector(`#savedServiceBlocksRow [data-service="${svcName}"]`);

    document.querySelectorAll('#savedServiceBlocksRow .saved-service-status-card').forEach(c => {
      c.classList.remove('active-service-tab');
      const arrowBtn = c.querySelector('.btn-tab-arrow');
      if (arrowBtn) arrowBtn.textContent = '⌃';
    });

    if (targetCard) {
      targetCard.classList.add('active-service-tab');
      const arrowBtn = targetCard.querySelector('.btn-tab-arrow');
      if (arrowBtn) arrowBtn.textContent = '▾';

      const rect = targetCard.getBoundingClientRect();
      popup.style.position = 'fixed';
      popup.style.bottom = Math.max(10, window.innerHeight - rect.top + 4) + 'px';
      popup.style.top = 'auto';
      const maxLeft = Math.max(10, window.innerWidth - 440);
      popup.style.left = Math.min(Math.max(10, rect.left), maxLeft) + 'px';
      popup.style.right = 'auto';
    }

    this.renderServicePopup(svcName);
    popup.classList.remove('hidden');
  },

  closeServicePopup() {
    const popup = document.getElementById('operatorStatusPopup');
    if (popup) popup.classList.add('hidden');
    document.querySelectorAll('#savedServiceBlocksRow .saved-service-status-card').forEach(c => {
      c.classList.remove('active-service-tab');
      const arrowBtn = c.querySelector('.btn-tab-arrow');
      if (arrowBtn) arrowBtn.textContent = '⌃';
    });
  },

  renderServicePopup(svcName) {
    const titleEl = document.getElementById('operatorPopupServiceTitle');
    if (titleEl) titleEl.textContent = svcName;

    const listEl = document.getElementById('operatorPopupHistoryList');
    if (!listEl) return;

    const hist = this.serviceHistory[svcName] || [
      { operator: 'оп. 1002', time: '16.12.2022 14:53:10', status: 'Добавлена', isRejected: false }
    ];

    listEl.innerHTML = hist.map(item => {
      // 1. Атрибуция пользователей:
      // ВИС -> оп. 9999
      // Службы с АРМ-112 -> ФИО
      // Операторы -> номер + тултип с ФИО
      let userHtml = '';
      if (item.is_fio) {
        userHtml = `<span class="pop-op pop-fio">${item.operator}</span>`;
      } else if (item.operator === 'оп. 9999') {
        userHtml = `<span class="pop-op pop-vis" title="Внешняя информационная система (ВИС)">оп. 9999</span>`;
      } else {
        const fio = item.fio || this.operatorDirectory[item.operator] || item.operator;
        userHtml = `<span class="pop-op pop-op-num has-tooltip" data-tooltip="${fio}" title="${fio}">${item.operator}</span>`;
      }

      // 2. Красная подсветка даты и времени
      const isRed = item.is_red || item.isRejected || item.status === 'Не принята' || String(item.status).includes('Не принята') || item.sla_delay;
      const timeClass = isRed ? 'pop-time pop-time-red pop-time-rejected' : 'pop-time';

      // 3. Комментарий к статусу
      let commentHtml = '';
      if (item.comment) {
        commentHtml = `
          <span class="pop-arrow">&gt;</span>
          <span class="pop-comment">${item.comment}</span>
        `;
      }

      return `
        <div class="popup-history-row">
          ${userHtml}
          <span class="pop-arrow">&gt;</span>
          <span class="pop-content-segment">
            <span class="${timeClass}">${item.time}</span>
            <span class="pop-status">${item.status}</span>
          </span>
          ${commentHtml}
        </div>
      `;
    }).join('');
  },

  // Вспомогательные сеттеры
  updateField(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  },

  setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  },

  // ==================== НАВИГАЦИЯ ПО ОСНОВНЫМ ВКЛАДКАМ ====================
  switchMainTab(tabKey) {
    const tabBtns = document.querySelectorAll('#armNavTabs .tab-btn');
    tabBtns.forEach(btn => {
      btn.classList.remove('active');
    });

    const panels = {
      'card': document.getElementById('panelCallCard'),
      'services': document.getElementById('panelServicesView'),
      'audit': document.getElementById('panelAuditView'),
      'map': document.getElementById('panelMapView')
    };

    const targetBtnId = {
      'card': 'tabBtnCard',
      'services': 'tabBtnServices',
      'audit': 'tabBtnAudit',
      'map': 'tabBtnMap'
    }[tabKey] || 'tabBtnCard';

    const targetBtn = document.getElementById(targetBtnId);
    if (targetBtn) targetBtn.classList.add('active');

    Object.keys(panels).forEach(key => {
      const p = panels[key];
      if (p) {
        if (key === tabKey) {
          p.classList.remove('hidden');
          p.classList.add('active');
        } else {
          p.classList.add('hidden');
          p.classList.remove('active');
        }
      }
    });

    if (tabKey === 'audit') {
      this.refreshAuditLog();
    }

    this.showToast(`Переключено на вкладку: ${targetBtn ? targetBtn.textContent.trim() : tabKey}`, 'info');
  },

  // ==================== МОДАЛЬНЫЕ ОКНА СЛУЖБ ====================
  openServiceModal(svcKey) {
    let modalId = '';
    const key = String(svcKey).toUpperCase();
    if (key.includes('101')) modalId = 'modalService101';
    else if (key.includes('МОЭК') || key.includes('MOEK')) modalId = 'modalServiceMOEK';
    else if (key.includes('102')) modalId = 'modalService102';
    else if (key.includes('103')) modalId = 'modalService103';
    else if (key === 'SIGNS' || key.includes('ПРИЗНАК')) modalId = 'signsModal';
    else modalId = 'modalService101';

    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('open');
      modal.classList.add('active');
    }
  },

  closeServiceModal(svcKey) {
    let modalId = '';
    const key = String(svcKey).toUpperCase();
    if (key.includes('101')) modalId = 'modalService101';
    else if (key.includes('МОЭК') || key.includes('MOEK')) modalId = 'modalServiceMOEK';
    else if (key.includes('102')) modalId = 'modalService102';
    else if (key.includes('103')) modalId = 'modalService103';
    else if (key === 'SIGNS' || key.includes('ПРИЗНАК')) modalId = 'signsModal';
    else modalId = 'modalService101';

    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('open');
      modal.classList.remove('active');
    }
  },

  saveServiceModal(svcKey) {
    const key = String(svcKey).toUpperCase();
    let svcName = 'Служба 101';
    let newStatus = 'Принята';
    let orderNum = '';

    if (key.includes('101')) {
      svcName = 'Служба 101';
      newStatus = document.getElementById('serviceStatus_101')?.value || 'Принята';
      orderNum = document.getElementById('serviceOrder_101')?.value || '';
      const dashStatus = document.getElementById('dashStatus_101');
      if (dashStatus) dashStatus.textContent = newStatus;
    } else if (key.includes('МОЭК') || key.includes('MOEK')) {
      svcName = 'МОЭК';
      newStatus = document.getElementById('serviceStatus_MOEK')?.value || 'Не принята';
      orderNum = document.getElementById('serviceOrder_MOEK')?.value || '';
      const dashStatus = document.getElementById('dashStatus_MOEK');
      if (dashStatus) dashStatus.textContent = newStatus;
    } else if (key.includes('102')) {
      svcName = 'Служба 102';
      newStatus = document.getElementById('serviceStatus_102')?.value || 'Принята';
      orderNum = document.getElementById('serviceOrder_102')?.value || '';
      const dashStatus = document.getElementById('dashStatus_102');
      if (dashStatus) dashStatus.textContent = newStatus;
    } else if (key.includes('103')) {
      svcName = 'Служба 103';
      newStatus = document.getElementById('serviceStatus_103')?.value || 'Принята';
      orderNum = document.getElementById('serviceOrder_103')?.value || '';
      const dashStatus = document.getElementById('dashStatus_103');
      if (dashStatus) dashStatus.textContent = newStatus;
    } else if (key === 'SIGNS' || key.includes('ПРИЗНАК')) {
      svcName = 'Признаки происшествия';
      newStatus = 'Сохранено';
    }

    // Запись в историю службы
    if (!this.serviceHistory[svcName]) this.serviceHistory[svcName] = [];
    const nowStr = new Date().toLocaleTimeString('ru-RU');
    this.serviceHistory[svcName].push({
      operator: 'оп. 1002',
      fio: 'Петрова С. И.',
      time: new Date().toLocaleDateString('ru-RU') + ' ' + nowStr,
      status: newStatus,
      isRejected: newStatus === 'Не принята',
      comment: orderNum ? `Наряд: ${orderNum}` : ''
    });

    this.closeServiceModal(svcKey);
    this.showToast(`Параметры службы «${svcName}» успешно зафиксированы [${newStatus}]`, 'success');
  },

  // ==================== ОПЕРАТИВНЫЕ ДЕЙСТВИЯ ====================
  exportCard() {
    const cardData = JSON.stringify(this.state.card, null, 2);
    const blob = new Blob([cardData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `incident_card_${this.state.card.incidentId || '913126'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.showToast('Карточка происшествия успешно экспортирована', 'success');
  },

  printCard() {
    this.showToast('Карточка происшествия отправлена на печать', 'info');
    window.print();
  },

  openConsultation() {
    this.showToast('Сессия оперативной консультации с врачом 112 активирована', 'info');
  },

  resetCardForm() {
    const desc = document.getElementById('descriptionText');
    if (desc) desc.value = '';
    const addr = document.getElementById('fullAddressSearchInput');
    if (addr) addr.value = '';
    this.updateDescriptionCounter();
    this.showToast('Поля ввода карточки сброшены', 'warn');
  },

  refreshAuditLog() {
    const tbody = document.getElementById('armAuditTableBody');
    if (!tbody) return;
    const now = new Date();
    const timeStr = now.toLocaleDateString('ru-RU') + ' ' + now.toLocaleTimeString('ru-RU');
    const newRow = document.createElement('tr');
    newRow.innerHTML = `
      <td>${tbody.children.length + 1}</td>
      <td>оп. 1002 (Петрова С.И.)</td>
      <td>Проверка регламента</td>
      <td>Синхронизация АРМ-112 со сменой №4</td>
      <td>${timeStr}</td>
    `;
    tbody.prepend(newRow);
    this.showToast('Журнал аудита обновлен', 'info');
  },

  showToast(message, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `sys112-toast toast ${type}`;
    toast.innerHTML = `<span>📢</span> <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3500);
  }
};

// Глобальный доступ
window.ARM = ARM;
window.arm = ARM;

// Запуск при готовности DOM
document.addEventListener('DOMContentLoaded', () => ARM.init());

const ARM_Tour = {
  currentStep: 0,
  steps: [
    {
      target: '#btnStartCall',
      title: 'Шаг 1: Прием вызова',
      text: 'Нажмите «Принять вызов», чтобы начать сеанс связи. Запустится таймер и начнется диалог с заявителем.',
      position: 'bottom'
    },
    {
      target: '.dialog-interaction-controls',
      title: 'Шаг 2: Диалог со стресс-заявителем',
      text: 'Здесь вы общаетесь с заявителем. Выслушайте его, используйте фразы деэскалации (заземление). Избегайте канцелярита, чтобы не спровоцировать панику.',
      position: 'top'
    },
    {
      target: '#telBoxProvided',
      title: 'Шаг 3: Быстрая вставка фактов',
      text: 'Во время разговора система может извлекать данные. Используйте кнопки быстрого копирования (например, копирование АОН в один клик) и следите за автозаполнением адреса.',
      position: 'bottom'
    },
    {
      target: '.questionnaire-hierarchical-tree',
      title: 'Шаг 4: Дерево опросника ЕКП',
      text: 'Выберите признаки происшествия из иерархического классификатора. Это автоматически определит привлекаемые службы.',
      position: 'top'
    },
    {
      target: '#btnSaveCardOrange',
      title: 'Шаг 5: Оповещение служб',
      text: 'Проверьте список привлекаемых служб. После этого нажмите «Сохранить карточку», чтобы разослать информацию в ДДС ведомств.',
      position: 'top'
    }
  ],

  injectCSS() {
    if (document.getElementById('arm-tour-css')) return;
    const style = document.createElement('style');
    style.id = 'arm-tour-css';
    style.innerHTML = `
      .tour-overlay {
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.4);
        z-index: 9999;
        pointer-events: none;
      }
      .tour-highlight {
        position: relative;
        z-index: 10000 !important;
        box-shadow: 0 0 0 4px #10b981, 0 0 15px rgba(16, 185, 129, 0.8) !important;
        background: #fff;
        pointer-events: auto;
        border-radius: 4px;
      }
      .tour-tooltip {
        position: absolute;
        background: #1B365D;
        color: #fff;
        padding: 16px;
        border-radius: 8px;
        width: 320px;
        z-index: 10001;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        border: 2px solid #d97706;
      }
      .tour-tooltip-title {
        font-weight: bold;
        font-size: 16px;
        margin-bottom: 8px;
        color: #f1f5f9;
        border-bottom: 1px solid rgba(255,255,255,0.2);
        padding-bottom: 4px;
      }
      .tour-tooltip-text {
        font-size: 14px;
        line-height: 1.5;
        margin-bottom: 16px;
        color: #e2e8f0;
      }
      .tour-tooltip-buttons {
        display: flex;
        justify-content: space-between;
      }
      .tour-btn {
        padding: 6px 12px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        font-weight: bold;
      }
      .tour-btn-close {
        background: transparent;
        color: #cbd5e1;
        border: 1px solid #cbd5e1;
      }
      .tour-btn-close:hover { background: rgba(255,255,255,0.1); }
      .tour-btn-nav {
        background: #d97706;
        color: #fff;
      }
      .tour-btn-nav:hover { background: #b45309; }
    `;
    document.head.appendChild(style);
  },

  start() {
    this.injectCSS();
    this.currentStep = 0;
    
    let overlay = document.getElementById('tour-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'tour-overlay';
      overlay.className = 'tour-overlay';
      document.body.appendChild(overlay);
    }
    
    this.showStep();
  },

  showStep() {
    this.cleanup();
    
    if (this.currentStep >= this.steps.length) {
      this.close();
      return;
    }
    
    const step = this.steps[this.currentStep];
    const targetEl = document.querySelector(step.target);
    if (!targetEl) {
      console.warn('Tour target not found:', step.target);
      this.currentStep++;
      this.showStep();
      return;
    }
    
    targetEl.classList.add('tour-highlight');
    if(this.currentStep === 4) {
       const saveBtn = document.getElementById('btnSaveCardOrange');
       if(saveBtn) saveBtn.classList.add('tour-highlight');
    }

    const rect = targetEl.getBoundingClientRect();
    
    const tooltip = document.createElement('div');
    tooltip.id = 'tour-tooltip';
    tooltip.className = 'tour-tooltip';
    
    let html = `
      <div class="tour-tooltip-title">${escapeHtml(step.title)}</div>
      <div class="tour-tooltip-text">${escapeHtml(step.text)}</div>
      <div class="tour-tooltip-buttons">
        <button class="tour-btn tour-btn-close" onclick="ARM_Tour.close()">Закрыть обучение</button>
        <div>
    `;
    if (this.currentStep > 0) {
      html += `<button class="tour-btn tour-btn-close" onclick="ARM_Tour.prev()" style="margin-right:8px;">Назад</button>`;
    }
    html += `<button class="tour-btn tour-btn-nav" onclick="ARM_Tour.next()">${this.currentStep === this.steps.length - 1 ? 'Завершить' : 'Далее'}</button>
        </div>
      </div>
    `;
    tooltip.innerHTML = html;
    document.body.appendChild(tooltip);
    
    // Positioning
    const tooltipRect = tooltip.getBoundingClientRect();
    let top = rect.bottom + 10;
    let left = rect.left;
    
    if (step.position === 'top') {
      top = rect.top - tooltipRect.height - 10;
    } else if (step.position === 'left') {
      top = rect.top;
      left = rect.left - tooltipRect.width - 10;
    } else if (step.position === 'right') {
      top = rect.top;
      left = rect.right + 10;
    }
    
    // Bounds check
    if (left + tooltipRect.width > window.innerWidth) {
      left = window.innerWidth - tooltipRect.width - 20;
    }
    if (top < 0) {
      top = rect.bottom + 10;
    }
    
    tooltip.style.top = top + 'px';
    tooltip.style.left = left + 'px';
    
    // Scroll into view
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },

  next() {
    this.currentStep++;
    this.showStep();
  },

  prev() {
    this.currentStep--;
    this.showStep();
  },

  cleanup() {
    document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
    const tooltip = document.getElementById('tour-tooltip');
    if (tooltip) tooltip.remove();
  },

  close() {
    this.cleanup();
    const overlay = document.getElementById('tour-overlay');
    if (overlay) overlay.remove();
  }
};
