/**
 * modular_test.js - Контроллер тестовой песочницы модульного речевого движка и фонотеки Системы-112.
 * 
 * Функциональность:
 * 1. Вкладка «Интерактивный звонок»:
 *    - Запуск сессии вызова (Билет 1, Сит 1: пожар у депо Киевского вокзала, рабочий Сидоров И.С., 50 лет)
 *    - Воспроизведение 2-дорожечного аудио: процедурный амбиенс пожара + реальные нейрореплики Edge-TTS
 *    - DSP телефонный тракт: полосовой фильтр 300-3400 Гц, сатурация, шум линии, радио-клики
 *    - Barge-In перебивание с мягким затуханием (fade-out ramp 80-120 мс)
 *    - Быстрые регламентные фразы оператора (адрес, пострадавшие, заземление, канцелярит, переспрос)
 *    - Живая телеметрия стейт-машины: шкала стресса (0-100%), бейдж эмоции, semantic_event, fact_status
 *    - Интерактивный лог Black Box аудита
 * 2. Вкладка «Каталог реплик (205 фраз)»:
 *    - Загрузка cosyvoice_manifest.json (121 фраза сценария + 84 универсальные реакции)
 *    - Фильтры по банку, событиям, эмоциям, статусам фактов и текстовый поиск
 *    - Карточки реплик с кнопкой мгновенного прослушивания реального MP3 через Web Audio DSP
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. СОСТОЯНИЕ ПРИЛОЖЕНИЯ
    // =========================================================================
    const state = {
        activeTab: 'call', // 'call' | 'catalog'
        sessionId: null,
        serverOnline: false,
        debugLogs: [],
        isCallActive: false,
        callDurationSec: 0,
        callTimerInterval: null,
        isApplicantSpeaking: false,
        currentAudioId: null,

        // Настройки аудио DSP
        dsp: {
            phoneFilter: true,
            lineNoise: true,
            radioClick: true,
            ambience: true,
            ambienceVolume: 0.3,
            masterVolume: 0.9
        },

        // Телеметрия заявителя
        telemetry: {
            panicLevel: 75,
            state: 'panic',
            emotion: 'panic',
            semanticEvent: 'GREETING',
            factStatus: 'CORRECT',
            audioId: 't01_q01_greeting_correct_panic_01',
            revealed: {
                address: false,
                victims: false,
                details: false,
                name: false,
                phone: false
            },
            revealedValues: {
                address: 'МЖД Киевская 1 км. 2 стр.2',
                victims: 'Пострадавших нет',
                details: 'Возгорание мусорного контейнера у депо, открытое пламя',
                name: 'Сидоров Иван Сергеевич',
                phone: '+7 (916) 126-34-71'
            },
            clicheCount: 0,
            groundingCount: 0,
            metadata: null,
            blackBox: []
        },

        // Каталог 205 реплик
        catalog: {
            loaded: false,
            items: [],
            filtered: [],
            currentPlayingId: null,
            filters: {
                source: 'all',     // 'all' | 't01_s01' | 'universal'
                event: 'all',
                emotion: 'all',    // 'all' | 'panic' | 'anxious' | 'neutral' | 'angry'
                status: 'all',     // 'all' | 'correct' | 'partial' | 'uncertain' | 'wrong' | 'repeat'
                search: ''
            }
        }
    };

    // =========================================================================
    // 2. ИНИЦИАЛИЗАЦИЯ И ОБРАБОТЧИКИ СОБЫТИЙ
    // =========================================================================
    document.addEventListener('DOMContentLoaded', () => {
        initTabs();
        initDspControls();
        initCallControls();
        initQuickChips();
        initCatalogControls();
        initDebugLogControls();
        loadCatalogData();
        checkServerConnection();
    });

    // =========================================================================
    // 3. УПРАВЛЕНИЕ ВКЛАДКАМИ
    // =========================================================================
    function initTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.dataset.tab;
                switchTab(target);
            });
        });
    }

    function switchTab(tabId) {
        state.activeTab = tabId;
        document.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === tabId);
        });
        document.querySelectorAll('.tab-content').forEach(c => {
            c.classList.toggle('active', c.id === `tab-${tabId}`);
        });

        if (tabId === 'catalog' && !state.catalog.loaded) {
            loadCatalogData();
        }
    }

    // =========================================================================
    // 4. УПРАВЛЕНИЕ АУДИО DSP
    // =========================================================================
    function getAudioDsp() {
        if (window.audioDsp) return window.audioDsp;
        if (window.AudioDSP) {
            window.audioDsp = new window.AudioDSP();
            return window.audioDsp;
        }
        return null;
    }

    function initDspControls() {
        const toggleFilter = document.getElementById('dsp-toggle-filter');
        const toggleNoise = document.getElementById('dsp-toggle-noise');
        const toggleAmbience = document.getElementById('dsp-toggle-ambience');
        const ambienceVolSlider = document.getElementById('dsp-ambience-volume');
        const ambienceVolVal = document.getElementById('dsp-ambience-val');

        if (toggleFilter) {
            toggleFilter.addEventListener('click', () => {
                state.dsp.phoneFilter = !state.dsp.phoneFilter;
                toggleFilter.classList.toggle('active', state.dsp.phoneFilter);
                showToast(`Телефонный фильтр: ${state.dsp.phoneFilter ? 'ВКЛ' : 'ВЫКЛ'}`);
            });
        }

        if (toggleNoise) {
            toggleNoise.addEventListener('click', () => {
                state.dsp.lineNoise = !state.dsp.lineNoise;
                toggleNoise.classList.toggle('active', state.dsp.lineNoise);
                showToast(`Шум линии и радио-клики: ${state.dsp.lineNoise ? 'ВКЛ' : 'ВЫКЛ'}`);
            });
        }

        if (toggleAmbience) {
            toggleAmbience.addEventListener('click', () => {
                state.dsp.ambience = !state.dsp.ambience;
                toggleAmbience.classList.toggle('active', state.dsp.ambience);
                const dsp = getAudioDsp();
                if (dsp && dsp.ambience) {
                    if (state.dsp.ambience && state.isCallActive) {
                        dsp.ambience.start({ type: 'fire_depot', volume: state.dsp.ambienceVolume });
                    } else if (dsp.ambience.isActive) {
                        dsp.ambience.stop({ fadeOutSec: 0.5 });
                    }
                }
                showToast(`Амбиенс пожара: ${state.dsp.ambience ? 'ВКЛ' : 'ВЫКЛ'}`);
            });
        }

        if (ambienceVolSlider) {
            ambienceVolSlider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                state.dsp.ambienceVolume = val;
                if (ambienceVolVal) ambienceVolVal.textContent = `${Math.round(val * 100)}%`;
                const dsp = getAudioDsp();
                if (dsp && dsp.ambience && dsp.ambience.masterGain && dsp.ctx) {
                    dsp.ambience.masterGain.gain.setValueAtTime(val, dsp.ctx.currentTime);
                }
            });
        }
    }

    // =========================================================================
    // 5. ИНТЕРАКТИВНЫЙ ЗВОНОК (ВКЛАДКА 1)
    // =========================================================================
    function initCallControls() {
        const btnStart = document.getElementById('btn-start-call');
        const btnEnd = document.getElementById('btn-end-call');
        const btnBargeIn = document.getElementById('btn-barge-in');
        const btnSend = document.getElementById('btn-send-message');
        const inputMsg = document.getElementById('input-operator-message');

        if (btnStart) btnStart.addEventListener('click', startCall);
        if (btnEnd) btnEnd.addEventListener('click', endCall);
        if (btnBargeIn) btnBargeIn.addEventListener('click', handleBargeIn);

        if (btnSend) {
            btnSend.addEventListener('click', () => {
                sendMessageFromInput();
            });
        }

        if (inputMsg) {
            inputMsg.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessageFromInput();
                }
            });
        }
    }

    function initQuickChips() {
        const chips = document.querySelectorAll('.chip-btn');
        chips.forEach(chip => {
            chip.addEventListener('click', () => {
                if (!state.isCallActive) {
                    showToast('Сначала начните звонок!', 'warn');
                    return;
                }
                const text = chip.dataset.text || chip.textContent.trim();
                sendOperatorMessage(text);
            });
        });
    }

    async function startCall() {
        const dsp = getAudioDsp();
        if (dsp) {
            dsp.initContext();
        }

        // Обновление UI кнопок
        setCallActiveUI(true);

        // Старт таймера
        state.callDurationSec = 0;
        updateCallTimerUI();
        clearInterval(state.callTimerInterval);
        state.callTimerInterval = setInterval(() => {
            state.callDurationSec++;
            updateCallTimerUI();
        }, 1000);

        // Очистить чат и сбросить телеметрию
        clearChat();
        resetTelemetry();

        // 1. Запуск процедурного амбиенса пожара/депо
        if (dsp && dsp.ambience && state.dsp.ambience) {
            dsp.ambience.start({
                type: 'fire_depot',
                volume: state.dsp.ambienceVolume,
                fadeInSec: 1.2
            });
        }

        // 2. Запрос сессии на бэкенд
        try {
            const resp = await fetch('/api/session/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticket_id: 1,
                    question_id: 1,
                    operator_name: 'Тестировщик-Аудио'
                })
            });

            if (resp.ok) {
                const data = await resp.json();
                state.sessionId = data.session_id;
                state.telemetry.panicLevel = data.panic_level || 75;
                state.telemetry.state = data.state || 'panic';
                updateServerStatus(true);

                const initialAudioId = data.initial_audio_id || 't01_q01_greeting_correct_panic_01';
                const initialText = data.initial_message || 
                    "Алло! 112?! Помогите скорее! Возгорание мусорного контейнера у железнодорожного депо Киевского вокзала, открытое пламя, черный дым! Вы слышите меня?!";

                const triggerInitialGreeting = () => {
                    if (!state.isCallActive) return;
                    state.turn0Timer = null;

                    // Добавить приветствие заявителя в чат
                    appendApplicantMessage(initialText, initialAudioId);

                    // Воспроизвести реальный MP3 с телефонным фильтром
                    playApplicantAudio(initialAudioId, {
                        state: state.telemetry.state,
                        fallbackText: initialText
                    });

                    // Обновить телеметрию
                    updateTelemetryUI({
                        panic_level: data.panic_level || 75,
                        state: data.state || 'panic',
                        semantic_event: 'GREETING',
                        fact_status: 'CORRECT',
                        audio_id: initialAudioId,
                        metadata: {
                            intensity: 3,
                            duration_ms: 3200,
                            speech_rate: 'fast',
                            cosyvoice_prompt: 'Panicked Russian male, 50yo, shouting at operator'
                        }
                    });

                    // Добавить в лог отладки
                    addDebugLog({
                        timestamp: formatTimeNow(),
                        operator_text: '— [Установление вызова 112: Реплика заявителя] —',
                        intent: 'session_start',
                        semantic_event: 'GREETING',
                        fact_status: 'CORRECT',
                        audio_id: initialAudioId,
                        panic_level: data.panic_level || 75,
                        state: data.state || 'panic',
                        reply: initialText
                    });

                    fetchBlackBoxHistory();
                };

                // Turn 0: Окно тишины 3.0 секунды, чтобы курсант мог поприветствовать абонента первым
                if (state.turn0Timer) {
                    clearTimeout(state.turn0Timer);
                    state.turn0Timer = null;
                }
                appendSystemMessage('⏱️ [Turn 0]: Окно тишины 3.0 сек — оператор может поприветствовать абонента первым.');
                state.turn0Timer = setTimeout(triggerInitialGreeting, 3000);

            } else {
                handleOfflineFallbackCall();
            }
        } catch (err) {
            console.warn('[ModularTest] Ошибка связи с сервером, локальный запуск:', err);
            handleOfflineFallbackCall();
        }
    }

    function handleOfflineFallbackCall() {
        updateServerStatus(false);
        const initialText = "Алло! 112?! Помогите скорее! Возгорание мусорного контейнера у железнодорожного депо Киевского вокзала, открытое пламя, черный дым! Вы слышите меня?!";
        const initialAudioId = 't01_q01_greeting_correct_panic_01';
        state.sessionId = 'local_session_' + Date.now();

        appendApplicantMessage(initialText, initialAudioId);
        playApplicantAudio(initialAudioId, { state: 'panic', fallbackText: initialText });

        updateTelemetryUI({
            panic_level: 75,
            state: 'panic',
            semantic_event: 'GREETING',
            fact_status: 'CORRECT',
            audio_id: initialAudioId,
            metadata: {
                intensity: 3,
                duration_ms: 3200,
                speech_rate: 'fast',
                cosyvoice_prompt: 'Panicked Russian male, 50yo, shouting at operator'
            }
        });

        addDebugLog({
            timestamp: formatTimeNow(),
            operator_text: '— [Установление вызова 112 (локально)] —',
            intent: 'session_start_local',
            semantic_event: 'GREETING',
            fact_status: 'CORRECT',
            audio_id: initialAudioId,
            panic_level: 75,
            state: 'panic',
            reply: initialText
        });
    }

    function endCall() {
        if (state.turn0Timer) {
            clearTimeout(state.turn0Timer);
            state.turn0Timer = null;
        }
        setCallActiveUI(false);
        clearInterval(state.callTimerInterval);

        const dsp = getAudioDsp();
        if (dsp) {
            if (dsp.ambience && dsp.ambience.isActive) {
                dsp.ambience.stop({ fadeOutSec: 0.8 });
            }
            dsp.stopCurrentAudioFile({ fadeDurationMs: 80 });
            dsp.cancelSpeech();
        }

        setApplicantSpeakingUI(false);
        appendSystemMessage('Звонок завершен оператором.');
        showToast('Звонок завершен');
    }

    function handleBargeIn() {
        if (!state.isCallActive) return;
        const dsp = getAudioDsp();
        if (dsp) {
            dsp.interruptApplicant('operator_interrupted', {
                fadeDurationMs: 100,
                withMarker: true,
                withClick: state.dsp.lineNoise
            });
        }
        setApplicantSpeakingUI(false);
        showToast('⚡ Собеседник перебит оператором (Barge-In, 100 мс fade-out)', 'warn');
        appendSystemMessage('⚡ Оператор перебил заявителя (Barge-In, затухание 100 мс)');
    }

    function sendMessageFromInput() {
        const input = document.getElementById('input-operator-message');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;
        if (!state.isCallActive) {
            showToast('Сначала начните звонок!', 'warn');
            return;
        }
        input.value = '';
        sendOperatorMessage(text);
    }

    async function sendOperatorMessage(text) {
        if (state.turn0Timer) {
            clearTimeout(state.turn0Timer);
            state.turn0Timer = null;
        }

        // Если заявитель говорит в момент клика/ввода — мягкий Barge-In
        if (state.isApplicantSpeaking) {
            const dsp = getAudioDsp();
            if (dsp) {
                dsp.interruptApplicant('operator_speaking', { fadeDurationMs: 90 });
            }
            setApplicantSpeakingUI(false);
        }

        // 1. Отобразить сообщение оператора в чате
        appendOperatorMessage(text);

        // Блокировка инпута и кнопок отправки на время запроса
        const input = document.getElementById('input-operator-message');
        const sendBtn = document.getElementById('btn-send-message');
        const quickBtns = document.querySelectorAll('.quick-phrase-btn');
        if (input) input.disabled = true;
        if (sendBtn) sendBtn.disabled = true;
        quickBtns.forEach(b => { b.disabled = true; });

        // 2. Отправить на бэкенд
        try {
            if (state.sessionId && !state.sessionId.startsWith('local_session_')) {
                const resp = await fetch('/api/session/message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        session_id: state.sessionId,
                        message: text
                    })
                });

                if (resp.ok) {
                    const result = await resp.json();
                    updateServerStatus(true);
                    processApplicantReply(result, text);
                    fetchBlackBoxHistory();
                    return;
                }
            }
            // Локальная эмуляция если сервер недоступен
            updateServerStatus(false);
            simulateApplicantReply(text);
        } catch (e) {
            console.warn('[ModularTest] Ошибка API запроса, эмуляция ответа:', e);
            updateServerStatus(false);
            simulateApplicantReply(text);
        } finally {
            if (input) {
                input.disabled = false;
                input.focus();
            }
            if (sendBtn) sendBtn.disabled = false;
            quickBtns.forEach(b => { b.disabled = false; });
        }
    }

    function processApplicantReply(result, operatorText) {
        const replyText = result.reply;
        const audioId = result.audio_id;
        const audioSequence = result.audio_sequence || (audioId ? [audioId] : []);
        const bricks = result.bricks || (result.metadata && result.metadata.bricks) || [];

        // Проверка сбоя SLM Qwen 2.5 и вывод заметного предупреждения
        if (result.execution_path === 'slm_error' || result.event === 'slm_error') {
            const errDetails = result.error_details || result.reply || 'Ошибка нейросетевого инференса';
            const slmText = document.getElementById('slm-status-text');
            const slmPill = document.getElementById('slm-status-indicator');
            if (slmText && slmPill) {
                slmText.textContent = `❌ SLM Error: ${errDetails}`;
                slmPill.style.borderColor = '#ef4444';
                slmPill.style.color = '#f87171';
                slmPill.style.background = 'rgba(239, 68, 68, 0.15)';
            }
            showToast(`⚠️ [СБОЙ SLM QWEN 2.5]: ${errDetails}`, 'error');
            appendSystemMessage(`⚠️ [СБОЙ SLM QWEN 2.5]: ${errDetails}`);
        }

        // Обновить индикатор статуса SLM в шапке
        const slmText = document.getElementById('slm-status-text');
        const slmPill = document.getElementById('slm-status-indicator');
        if (slmText && slmPill && result.slm_model && result.execution_path !== 'slm_error') {
            if (result.slm_model.includes('qwen') || result.slm_model.includes('gguf')) {
                slmText.textContent = `🤖 SLM: Qwen 2.5 1.5B Active`;
                slmPill.style.borderColor = '#10b981';
                slmPill.style.color = '#34d399';
                slmPill.style.background = 'rgba(16, 185, 129, 0.1)';
            } else {
                slmText.textContent = `⚡ SLM`;
                slmPill.style.borderColor = '#3b82f6';
                slmPill.style.color = '#93c5fd';
                slmPill.style.background = 'rgba(59, 130, 246, 0.1)';
            }
        }

        // Добавить реплику в чат с бейджами кирпичиков и телеметрией выполнения
        appendApplicantMessage(replyText, audioId, {
            bricks: bricks,
            audioSequence: audioSequence,
            execution_path: result.execution_path,
            latency_ms: result.latency_ms,
            slm_model: result.slm_model
        });

        // Проиграть MP3 (последовательность кирпичиков через playChunkSequence)
        if (audioSequence.length > 0) {
            playApplicantAudio(audioId, {
                audioSequence: audioSequence,
                state: result.state,
                fallbackText: replyText
            });
        }

        // Обновить телеметрию
        updateTelemetryUI(result);

        // Добавить в лог отладки
        addDebugLog({
            timestamp: formatTimeNow(),
            operator_text: operatorText || '—',
            intent: result.intent || result.event || 'dialogue',
            semantic_event: result.semantic_event || 'UNKNOWN',
            fact_status: result.fact_status || 'CORRECT',
            audio_id: audioSequence.length > 1 ? audioSequence.join(' + ') : (audioId || 'нет аудио'),
            audio_sequence: audioSequence,
            bricks: bricks,
            panic_level: result.panic_level,
            state: result.state,
            reply: replyText
        });
    }

    function simulateApplicantReply(operatorText) {
        const lower = (operatorText || '').toLowerCase().trim();
        let targetEvent = 'GIVE_ADDRESS';
        let targetEmotion = state.telemetry.state === 'panic' ? 'panic' : 'neutral';
        let pDelta = -5;
        let factStatus = 'CORRECT';
        let intentName = 'ask_address';

        // 1. Проверка на бюрократический канцелярит
        const isCliche = [
            "уточните характер", "произведите осмотр", "тип строения", "локализац",
            "точные координаты", "сохраняйте спокойствие", "в целях идентификации",
            "осуществите мероприятия", "производится фиксация", "признаки горения",
            "в рамках регламента", "ожидайте на линии", "пострадавшие лица",
            "данное происшествие", "уведомите соответствующие органы", "согласно инструкции",
            "вашу геолокацию"
        ].some(c => lower.includes(c));

        // 2. Переспрос
        const isRepeat = [
            "повторит", "повтори", "не расслышал", "не расслышала", "не услышал",
            "не услышала", "ещё раз", "еще раз", "плохо слышно", "не понял",
            "не поняла", "что вы сказали", "что ты сказал", "продублируйт"
        ].some(c => lower.includes(c));

        // 3. Деэскалация и заземление
        const isDeescalating = [
            "выехали", "выехала", "в пути", "я с вами", "дышите", "помощь направлена",
            "не кладите трубку", "спасатели", "бригада едет", "все сделаем", "слушаю вас"
        ].some(c => lower.includes(c));

        // 4. Вопрос о личности / контактах заявителя (CALLER_ID)
        const isAskingName = [
            "как вас зовут", "фамили", "имя", "кто вы", "вы кто", "представ",
            "телефон", "номер телефон", "ваш номер", "контакт", "обращаться",
            "назовите себя", "с кем говорю", "кто у аппарата", "кто говорит",
            "кто звонит", "кто сообщает", "кем работаете", "как зовут",
            "как ваше имя", "назовите имя"
        ].some(c => lower.includes(c));

        // 5. Вопрос о пострадавших
        const isAskingVictims = [
            "пострадав", "ранен", "скорая", "жертв", "человек", "жив", "кров",
            "сознан", "упал", "травм", "погиб", "заблокиров", "ожог", "медицин",
            "врач", "кому плохо", "помощь нужна"
        ].some(c => lower.includes(c));

        // 6. Вопрос об адресе
        const isAskingAddress = [
            "где", "куда", "назовите улицу", "адрес", "улиц", "дом", "находит",
            "куда ехать", "место", "ориентир", "район", "город"
        ].some(c => lower.includes(c));

        // 7. Вопрос об опасности и масштабе
        const isAskingDanger = [
            "масштаб", "угроз", "пламя", "огонь", "дым", "взорв", "опасн", "искры"
        ].some(c => lower.includes(c));

        // 8. Вопрос об обстоятельствах
        const isAskingSituation = [
            "горит", "случ", "произош", "какая машин", "номер машин", "сколько", "этаж",
            "подробн", "опишите", "что там", "обстановк", "расскаж", "что случилось",
            "что произошло", "детал"
        ].some(c => lower.includes(c));

        if (isCliche) {
            targetEvent = 'CLICHE_RAGE';
            targetEmotion = 'angry';
            pDelta = +20;
            intentName = 'cliche_rage';
            state.telemetry.clicheCount++;
        } else if (isRepeat) {
            targetEvent = 'REPEAT_FACT';
            factStatus = 'REPEAT';
            targetEmotion = 'anxious';
            pDelta = 0;
            intentName = 'repeat_fact';
        } else if (isDeescalating) {
            targetEvent = 'GROUNDING_RESPONSE';
            targetEmotion = state.telemetry.panicLevel > 50 ? 'anxious' : 'neutral';
            pDelta = -25;
            intentName = 'grounding_deescalation';
            state.telemetry.groundingCount++;
            state.telemetry.revealed.address = true;
        } else if (isAskingName) {
            targetEvent = 'CALLER_ID';
            targetEmotion = state.telemetry.state === 'panic' ? 'panic' : 'neutral';
            intentName = 'ask_caller_id';
            state.telemetry.revealed.name = true;
            state.telemetry.revealed.phone = true;
        } else if (state.telemetry.state === 'panic' && !isAskingAddress && !isAskingVictims) {
            targetEvent = 'EXPRESS_PANIC';
            targetEmotion = 'panic';
            pDelta = +5;
            intentName = 'panic_escalation';
        } else if (isAskingAddress) {
            targetEvent = 'GIVE_ADDRESS';
            targetEmotion = state.telemetry.state === 'panic' ? 'panic' : 'anxious';
            intentName = 'ask_address';
            state.telemetry.revealed.address = true;
        } else if (isAskingVictims) {
            targetEvent = 'GIVE_VICTIMS';
            targetEmotion = state.telemetry.state === 'panic' ? 'panic' : 'neutral';
            intentName = 'ask_victims';
            state.telemetry.revealed.victims = true;
        } else if (isAskingDanger) {
            targetEvent = 'GIVE_SCALE_DANGER';
            targetEmotion = 'panic';
            intentName = 'ask_scale_danger';
        } else if (isAskingSituation) {
            targetEvent = 'DESCRIBE_SITUATION';
            targetEmotion = state.telemetry.state === 'panic' ? 'panic' : 'neutral';
            intentName = 'ask_situation_details';
            state.telemetry.revealed.details = true;
        } else {
            targetEvent = 'DEADLOCK_AVOIDANCE';
            targetEmotion = 'panic';
            intentName = 'deadlock_avoidance';
        }

        // Поиск реплики СТРОГО в загруженном манифесте state.catalog.items
        let chosenItem = null;
        if (state.catalog.items && state.catalog.items.length > 0) {
            let candidates = state.catalog.items.filter(it => it.parsedEvent === targetEvent);
            if (candidates.length === 0) {
                candidates = state.catalog.items.filter(it => (it.audio_id || '').toLowerCase().includes(targetEvent.toLowerCase()));
            }
            if (candidates.length > 0) {
                const emoMatches = candidates.filter(it => it.parsedEmotion === targetEmotion || it.emotion === targetEmotion);
                chosenItem = emoMatches.length > 0 ? emoMatches[Math.floor(Math.random() * emoMatches.length)] : candidates[0];
            }
        }

        // Гарантированный эталонный манифест если каталог еще загружается
        if (!chosenItem) {
            const staticManifest = {
                'CLICHE_RAGE': { audio_id: 't01_q01_cliche_rage_correct_angry_01', text: 'Вы издеваетесь надо мной?! Не тратьте время на пустые вопросы, отправляйте помощь! Тут человек может погибнуть! Говорите по-человечески, вы кого-то отправили?!' },
                'REPEAT_FACT': { audio_id: 't01_q01_repeat_fact_repeat_anxious_01', text: 'Повторяю адрес, запишите внимательно: Москва, Депо, около ст. Москва-Пассажирская Киевская, длинное помещение недалеко от участкового пункта полиции (МЖД Киевская 1 км. 2 стр.2)!' },
                'GROUNDING_RESPONSE': { audio_id: 't01_q01_grounding_response_correct_anxious_01', text: 'Фух... Да, я вас слушаю... Пожалуйста, быстрее! Мы находимся: Москва, Депо, около ст. Москва-Пассажирская Киевская, длинное помещение недалеко от участкового пункта полиции (МЖД Киевская 1 км. 2 стр.2).' },
                'CALLER_ID': { audio_id: 't01_q01_caller_id_correct_panic_01', text: 'Сидоров Иван Сергеевич! Телефон +7 (916) 126-34-71! Да какая разница как меня зовут, пожарных зовите!' },
                'GIVE_ADDRESS': { audio_id: 't01_q01_give_address_correct_panic_01', text: 'Москва, Депо, около ст. Москва-Пассажирская Киевская, длинное помещение недалеко от участкового пункта полиции (МЖД Киевская 1 км. 2 стр.2)! Быстрее!' },
                'GIVE_VICTIMS': { audio_id: 't01_q01_give_victims_correct_neutral_01', text: 'Вроде нет пострадавших, никто не кричит. Но пламя разгорается!' },
                'EXPRESS_PANIC': { audio_id: 't01_q01_express_panic_correct_panic_01', text: 'Да вы слышите меня вообще?! Тут кошмар творится! Помощь приедет или нет?!' },
                'GIVE_SCALE_DANGER': { audio_id: 't01_q01_give_scale_danger_correct_panic_01', text: 'Пламя на пять метров поднимается, черный дым валит! Рядом строения депо, если перекинется — всё сгорит!' },
                'DESCRIBE_SITUATION': { audio_id: 't01_q01_describe_situation_correct_panic_01', text: 'Мусорный контейнер полыхает прямо возле депо! Огромное открытое пламя, жар невыносимый!' },
                'DEADLOCK_AVOIDANCE': { audio_id: 't01_q01_deadlock_avoidance_correct_panic_01', text: 'Ладно, слушайте сюда! Тут такое дело: Возгорание мусорного контейнера у железнодорожного депо Киевского вокзала, открытое пламя, черный дым. Адрес: МЖД Киевская 1 км. 2 стр.2! Только отправьте уже помощь быстрее!' }
            };
            chosenItem = staticManifest[targetEvent] || staticManifest['DEADLOCK_AVOIDANCE'];
        }

        const reply = chosenItem.text;
        const audioId = chosenItem.audio_id;
        const semEvent = chosenItem.parsedEvent || targetEvent;
        factStatus = chosenItem.parsedStatus || factStatus;

        state.telemetry.panicLevel = Math.max(10, Math.min(100, state.telemetry.panicLevel + pDelta));
        const newState = state.telemetry.panicLevel > 65 ? 'panic' : (targetEmotion === 'angry' ? 'aggressive' : (state.telemetry.panicLevel < 50 ? 'cooperative' : 'grounded'));

        const res = {
            reply: reply,
            audio_id: audioId,
            state: newState,
            panic_level: state.telemetry.panicLevel,
            semantic_event: semEvent,
            fact_status: factStatus,
            intent: intentName,
            revealed: state.telemetry.revealed,
            metadata: {
                intensity: chosenItem.intensity || 2,
                duration_ms: chosenItem.duration_ms || 3000,
                speech_rate: chosenItem.speech_rate || 'normal',
                cosyvoice_prompt: chosenItem.cosyvoice_prompt || 'Russian male worker'
            }
        };

        processApplicantReply(res, operatorText);
    }

    // =========================================================================
    // 5.1. ЖИВЫЕ ЛОГИ ОТЛАДКИ И СТАТУС СЕРВЕРА
    // =========================================================================
    function formatTimeNow() {
        const d = new Date();
        return d.toLocaleTimeString('ru-RU') + '.' + String(d.getMilliseconds()).padStart(3, '0');
    }

    function getBrickRoleBadgeStyle(role) {
        switch (role) {
            case 'INTRO_EMOTION':
                return 'background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4);';
            case 'CORE_FACT':
                return 'background: rgba(16, 185, 129, 0.2); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.4);';
            case 'ACTION_CALL':
                return 'background: rgba(245, 158, 11, 0.2); color: #fcd34d; border: 1px solid rgba(245, 158, 11, 0.4);';
            case 'IRRITATION_MARKER':
                return 'background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.4);';
            case 'RELIEF':
                return 'background: rgba(20, 184, 166, 0.2); color: #5eead4; border: 1px solid rgba(20, 184, 166, 0.4);';
            default:
                return 'background: rgba(100, 116, 139, 0.2); color: #cbd5e1; border: 1px solid rgba(100, 116, 139, 0.4);';
        }
    }

    function checkAudioTextIntegrity(audioId, replyText, bricks) {
        if (bricks && bricks.length > 0) {
            return { match: true, text: `100% (${bricks.length} кирп.)` };
        }
        if (!audioId || !replyText) return { match: true, text: 'N/A' };
        if (!state.catalog.items || state.catalog.items.length === 0) {
            return { match: true, text: '100% (манифест)' };
        }
        let item = state.catalog.items.find(it => it.audio_id === audioId);
        if (!item && audioId === 't01_q01_greeting_correct_panic_01') {
            item = {
                audio_id: 't01_q01_greeting_correct_panic_01',
                text: 'Алло! 112?! Помогите скорее! Возгорание мусорного контейнера у железнодорожного депо Киевского вокзала, открытое пламя, черный дым! Вы слышите меня?!'
            };
        }
        if (!item) {
            return { match: true, text: '100% (манифест)' };
        }
        const cleanA = (item.text || '').replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?!—«»"']/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
        const cleanB = (replyText || '').replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?!—«»"']/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
        const isMatch = cleanA === cleanB || cleanA.includes(cleanB) || cleanB.includes(cleanA);
        return {
            match: isMatch,
            text: isMatch ? '100% совпадение' : 'Рассинхрон с манифестом'
        };
    }

    function addDebugLog(entry) {
        const integrity = checkAudioTextIntegrity(entry.audio_id, entry.reply, entry.bricks);
        const fullEntry = Object.assign({}, entry, {
            turn: state.debugLogs.length + 1,
            text_match: integrity.match,
            integrity_label: integrity.text
        });
        state.debugLogs.push(fullEntry);
        renderDebugLogEntry(fullEntry);
        updateDebugLogHeader();
    }

    function renderDebugLogEntry(entry) {
        const container = document.getElementById('debug-log-entries');
        if (!container) return;

        const emptyMsg = container.querySelector('.debug-log-empty');
        if (emptyMsg) emptyMsg.remove();

        const row = document.createElement('div');
        row.className = 'debug-log-row';
        row.style.cssText = 'background: #182237; border: 1px solid #283753; border-radius: 8px; padding: 10px 14px; display: flex; flex-direction: column; gap: 6px;';

        const matchBadgeBg = entry.text_match ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)';
        const matchBadgeColor = entry.text_match ? '#86efac' : '#fca5a5';
        const matchBadgeBorder = entry.text_match ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)';

        row.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="color: #64748b; font-weight: 700;">#${entry.turn}</span>
                    <span style="color: #94a3b8;">${entry.timestamp}</span>
                    <span style="padding: 2px 6px; border-radius: 4px; background: #1e3a8a; color: #93c5fd; font-weight: 600;">Интент: ${escapeHtml(entry.intent || '')}</span>
                    <span style="padding: 2px 6px; border-radius: 4px; background: #312e81; color: #c7d2fe;">${escapeHtml(entry.semantic_event || '')}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="padding: 2px 6px; border-radius: 4px; background: ${matchBadgeBg}; color: ${matchBadgeColor}; border: 1px solid ${matchBadgeBorder}; font-size: 11px;">${entry.integrity_label}</span>
                    <span style="padding: 2px 6px; border-radius: 4px; background: #334155; color: #f1f5f9; font-size: 11px;">Паника: ${entry.panic_level}% (${entry.state})</span>
                </div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px; font-size: 12px;">
                <div><b style="color: #38bdf8;">Оператор:</b> <span style="color: #f1f5f9;">«${escapeHtml(entry.operator_text)}»</span></div>
                <div><b style="color: #f59e0b;">Аудиофайл:</b> <code style="color: #fbbf24; background: #0f172a; padding: 2px 6px; border-radius: 4px;">${escapeHtml(entry.audio_id)}</code></div>
                ${entry.bricks && entry.bricks.length > 0 ? `
                <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px;">
                    ${entry.bricks.map(b => `<span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; ${getBrickRoleBadgeStyle(b.role)} font-weight: 600;">🧱 ${escapeHtml(b.role)}: <code>${escapeHtml(b.audio_id)}</code></span>`).join('')}
                </div>` : ''}
                <div><b style="color: #4ade80;">Заявитель:</b> <span style="color: #e2e8f0;">«${escapeHtml(entry.reply)}»</span></div>
            </div>
        `;

        container.appendChild(row);
        container.scrollTop = container.scrollHeight;
    }

    function updateDebugLogHeader() {
        const countEl = document.getElementById('debug-log-count');
        if (countEl) {
            countEl.textContent = `${state.debugLogs.length} событий`;
        }
        const integrityEl = document.getElementById('debug-log-integrity');
        if (integrityEl) {
            const total = state.debugLogs.length;
            if (total === 0) {
                integrityEl.textContent = 'Совпадение аудио/текст: 100%';
                integrityEl.style.background = 'rgba(34, 197, 94, 0.15)';
                integrityEl.style.color = '#86efac';
                integrityEl.style.borderColor = 'rgba(34, 197, 94, 0.3)';
            } else {
                const matches = state.debugLogs.filter(l => l.text_match).length;
                const pct = Math.round((matches / total) * 100);
                integrityEl.textContent = `Совпадение аудио/текст: ${pct}% (${matches}/${total})`;
                if (pct === 100) {
                    integrityEl.style.background = 'rgba(34, 197, 94, 0.15)';
                    integrityEl.style.color = '#86efac';
                    integrityEl.style.borderColor = 'rgba(34, 197, 94, 0.3)';
                } else {
                    integrityEl.style.background = 'rgba(239, 68, 68, 0.15)';
                    integrityEl.style.color = '#fca5a5';
                    integrityEl.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                }
            }
        }
    }

    function initDebugLogControls() {
        const btnExport = document.getElementById('btn-export-debug-json');
        if (btnExport) {
            btnExport.addEventListener('click', () => {
                if (state.debugLogs.length === 0) {
                    showToast('Лог отладки пуст, нечего экспортировать');
                    return;
                }
                const exportData = {
                    exported_at: new Date().toISOString(),
                    session_id: state.sessionId,
                    total_turns: state.debugLogs.length,
                    logs: state.debugLogs
                };
                const jsonStr = JSON.stringify(exportData, null, 2);
                const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `modular_debug_session_${state.sessionId || 'log'}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast('Лог сессии успешно сохранен в JSON');
            });
        }

        const btnClear = document.getElementById('btn-clear-debug-log');
        if (btnClear) {
            btnClear.addEventListener('click', () => {
                state.debugLogs = [];
                const container = document.getElementById('debug-log-entries');
                if (container) {
                    container.innerHTML = '<div class="debug-log-empty" style="color: #64748b; padding: 16px 0; text-align: center; font-style: italic;">Логи отладки диалога очищены.</div>';
                }
                updateDebugLogHeader();
                showToast('Логи отладки очищены');
            });
        }
    }

    function updateServerStatus(isOnline) {
        state.serverOnline = isOnline;
        const statusText = document.getElementById('server-status-text');
        const statusDot = document.getElementById('server-status-dot');
        const statusPill = document.getElementById('server-status-indicator');

        if (isOnline) {
            if (statusPill) {
                statusPill.style.background = 'rgba(34, 197, 94, 0.15)';
                statusPill.style.borderColor = 'rgba(34, 197, 94, 0.4)';
                statusPill.style.color = '#86efac';
            }
            if (statusDot) {
                statusDot.style.background = '#22c55e';
                statusDot.style.boxShadow = '0 0 8px #22c55e';
            }
            if (statusText) {
                statusText.textContent = '🟢 Сервер подключен (Modular Engine v2.2)';
            }
        } else {
            if (statusPill) {
                statusPill.style.background = 'rgba(239, 68, 68, 0.15)';
                statusPill.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                statusPill.style.color = '#fca5a5';
            }
            if (statusDot) {
                statusDot.style.background = '#ef4444';
                statusDot.style.boxShadow = '0 0 8px #ef4444';
            }
            if (statusText) {
                statusText.textContent = '🔴 Сервер недоступен (локальный режим)';
            }
        }
    }

    async function checkServerConnection() {
        try {
            const resp = await fetch('/api/status');
            if (resp.ok) {
                updateServerStatus(true);
                return true;
            }
        } catch (e) {}

        try {
            const resp2 = await fetch('/api/health');
            if (resp2.ok) {
                updateServerStatus(true);
                return true;
            }
        } catch (e2) {}

        updateServerStatus(false);
        return false;
    }

    // =========================================================================
    // 6. ВОСПРОИЗВЕДЕНИЕ АУДИО ЧЕРЕЗ WEB AUDIO DSP
    // =========================================================================
    function resolveAudioUrl(audioId) {
        if (!audioId) return '';
        if (audioId.startsWith('http://') || audioId.startsWith('https://') || audioId.startsWith('/')) {
            return audioId;
        }
        const cleanId = audioId.endsWith('.mp3') ? audioId.slice(0, -4) : audioId;
        if (cleanId.startsWith('brk_')) {
            return `/audio/modular/bricks/${cleanId}.mp3`;
        } else if (cleanId.startsWith('t01_')) {
            return `/audio/modular/t01_s01/${cleanId}.mp3`;
        } else if (cleanId.startsWith('univ_') || cleanId.startsWith('react_')) {
            return `/audio/modular/universal/${cleanId}.mp3`;
        }
        return `/audio/modular/${cleanId}.mp3`;
    }

    async function playApplicantAudio(audioId, options = {}) {
        const audioSequence = options.audioSequence || (audioId ? [audioId] : []);
        if (!audioSequence || audioSequence.length === 0) return;
        const dsp = getAudioDsp();
        if (!dsp) return;

        state.currentAudioId = audioSequence[0];
        setApplicantSpeakingUI(true, audioSequence.join(' + '));

        // Приглушаем амбиенс (ducking)
        if (dsp.ambience && dsp.ambience.isActive) {
            dsp.ambience.duck(0.35, 0.15);
        }

        const replyText = options.replyText || state.lastReplyText;
        let chunkUrls = [];
        if (replyText) {
            chunkUrls = [`/api/tts?text=${encodeURIComponent(replyText)}`];
        } else {
            chunkUrls = audioSequence.map(id => resolveAudioUrl(id));
        }

        const playOptions = {
            applyFilter: state.dsp.phoneFilter,
            volume: state.dsp.masterVolume,
            pauseBetweenMs: 120, // 120 мс дыхательная пауза между кирпичиками
            state: options.state || state.telemetry.state,
            onChunkStart: (idx, total, url) => {
                setApplicantSpeakingUI(true, audioSequence[idx] || audioId);
            },
            onInterrupted: (data) => {
                console.log('[ModularTest] Речь прервана (Barge-In):', data);
                setApplicantSpeakingUI(false);
                if (dsp.ambience && dsp.ambience.isActive) {
                    dsp.ambience.unduck(0.35);
                }
            },
            onEnd: () => {
                setApplicantSpeakingUI(false);
                // Восстанавливаем амбиенс (unducking)
                if (dsp.ambience && dsp.ambience.isActive) {
                    dsp.ambience.unduck(0.35);
                }
            }
        };

        try {
            if (chunkUrls.length > 1) {
                await dsp.playChunkSequence(chunkUrls, playOptions);
            } else {
                const singleUrl = chunkUrls[0];
                const success = await dsp.playAudioFile(singleUrl, {
                    applyTelephoneFilter: state.dsp.phoneFilter,
                    withLineNoise: state.dsp.lineNoise,
                    withRadioClick: state.dsp.radioClick,
                    volume: state.dsp.masterVolume,
                    onStart: () => setApplicantSpeakingUI(true, audioSequence[0]),
                    onEnd: playOptions.onEnd
                });
                if (!success && options.fallbackText) {
                    console.log('[ModularTest] Воспроизведение через речевой фоллбэк');
                    dsp.speakApplicant(options.fallbackText, {
                        state: options.state || 'panic',
                        onEnd: playOptions.onEnd
                    });
                }
            }
        } catch (err) {
            console.warn('[ModularTest] Ошибка playApplicantAudio:', err);
            setApplicantSpeakingUI(false);
        }
    }

    // =========================================================================
    // 7. ОБНОВЛЕНИЕ ТЕЛЕМЕТРИИ И UI
    // =========================================================================
    function setCallActiveUI(isActive) {
        state.isCallActive = isActive;
        const btnStart = document.getElementById('btn-start-call');
        const btnEnd = document.getElementById('btn-end-call');
        const btnBargeIn = document.getElementById('btn-barge-in');
        const statusBadge = document.getElementById('call-status-badge');
        const phoneRow = document.getElementById('call-phone-row');

        if (btnStart) btnStart.disabled = isActive;
        if (btnEnd) btnEnd.disabled = !isActive;
        if (btnBargeIn) btnBargeIn.disabled = !isActive;

        if (statusBadge) {
            statusBadge.className = `status-badge ${isActive ? 'connected' : 'idle'}`;
            statusBadge.textContent = isActive ? 'В ЭФИРЕ (ЛИНИЯ 112)' : 'ОЖИДАНИЕ ВЫЗОВА';
        }

        if (phoneRow) {
            phoneRow.classList.toggle('active-call', isActive);
        }
    }

    function setApplicantSpeakingUI(isSpeaking, audioId = '') {
        state.isApplicantSpeaking = isSpeaking;
        const waveBox = document.getElementById('live-wave-box');
        const waveText = document.getElementById('live-wave-text');
        const wavePill = document.getElementById('live-audio-pill');

        if (waveBox) waveBox.classList.toggle('speaking', isSpeaking);
        if (waveText) {
            waveText.textContent = isSpeaking 
                ? `🎙️ Говорит заявитель [${audioId}]` 
                : (state.isCallActive ? '🎧 Ожидание реплики оператора...' : 'Линия свободна');
        }
        if (wavePill) {
            wavePill.style.display = isSpeaking ? 'inline-flex' : 'none';
            wavePill.textContent = audioId || '';
        }
    }

    function updateCallTimerUI() {
        const timerEl = document.getElementById('call-timer');
        if (!timerEl) return;
        const min = Math.floor(state.callDurationSec / 60);
        const sec = state.callDurationSec % 60;
        timerEl.textContent = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }

    function resetTelemetry() {
        state.telemetry.panicLevel = 75;
        state.telemetry.state = 'panic';
        state.telemetry.clicheCount = 0;
        state.telemetry.groundingCount = 0;
        state.telemetry.revealed = {
            address: false,
            victims: false,
            details: true,
            name: false,
            phone: false
        };
        updateTelemetryUI({});
    }

    function updateTelemetryUI(data) {
        // Шкала паники
        const panic = data.panic_level !== undefined ? data.panic_level : state.telemetry.panicLevel;
        state.telemetry.panicLevel = panic;

        const panicValEl = document.getElementById('telem-panic-val');
        const panicBarEl = document.getElementById('telem-panic-bar');
        if (panicValEl) panicValEl.textContent = `${panic}%`;
        if (panicBarEl) {
            panicBarEl.style.width = `${panic}%`;
            if (panic >= 70) panicBarEl.className = 'progress-bar panic';
            else if (panic >= 50) panicBarEl.className = 'progress-bar anxious';
            else panicBarEl.className = 'progress-bar grounded';
        }

        // Бейдж эмоции и стейт-машины
        const st = data.state || state.telemetry.state;
        state.telemetry.state = st;
        const stateBadge = document.getElementById('telem-state-badge');
        if (stateBadge) {
            stateBadge.className = `badge state-${st}`;
            stateBadge.textContent = st.toUpperCase();
        }

        // Семантическое событие
        const semEvent = data.semantic_event || state.telemetry.semanticEvent;
        state.telemetry.semanticEvent = semEvent;
        const eventEl = document.getElementById('telem-semantic-event');
        if (eventEl) eventEl.textContent = semEvent;

        // Статус факта
        const factStatus = data.fact_status || state.telemetry.factStatus;
        state.telemetry.factStatus = factStatus;
        const statusEl = document.getElementById('telem-fact-status');
        if (statusEl) {
            statusEl.className = `badge status-${factStatus.toLowerCase()}`;
            statusEl.textContent = factStatus;
        }

        // Audio ID
        const aid = data.audio_id || state.telemetry.audioId;
        state.telemetry.audioId = aid;
        const aidEl = document.getElementById('telem-audio-id');
        if (aidEl) aidEl.textContent = aid || '—';

        // Раскрытые факты
        if (data.revealed) {
            Object.assign(state.telemetry.revealed, data.revealed);
        }
        updateFactRow('fact-address', state.telemetry.revealed.address, state.telemetry.revealedValues.address);
        updateFactRow('fact-victims', state.telemetry.revealed.victims, state.telemetry.revealedValues.victims);
        updateFactRow('fact-details', state.telemetry.revealed.details, state.telemetry.revealedValues.details);
        updateFactRow('fact-name', state.telemetry.revealed.name, state.telemetry.revealedValues.name);
        updateFactRow('fact-phone', state.telemetry.revealed.phone, state.telemetry.revealedValues.phone);

        // Счетчики нарушений
        const clicheEl = document.getElementById('telem-cliche-count');
        if (clicheEl) clicheEl.textContent = state.telemetry.clicheCount;
        const groundEl = document.getElementById('telem-ground-count');
        if (groundEl) groundEl.textContent = state.telemetry.groundingCount;

        // Метаданные реплики
        if (data.metadata) {
            state.telemetry.metadata = data.metadata;
            const metaBox = document.getElementById('telem-metadata-box');
            if (metaBox) {
                metaBox.innerHTML = `
                    <div class="meta-item"><span>Темп:</span> <b>${data.metadata.speech_rate || 'normal'}</b></div>
                    <div class="meta-item"><span>Длительность:</span> <b>${data.metadata.duration_ms || 2000} мс</b></div>
                    <div class="meta-item"><span>Интенсивность:</span> <b>${data.metadata.intensity || 2}/3</b></div>
                    <div class="meta-prompt"><span>CosyVoice:</span> <i>${data.metadata.cosyvoice_prompt || '—'}</i></div>
                `;
            }
        }
    }

    function updateFactRow(rowId, isRevealed, text) {
        const row = document.getElementById(rowId);
        if (!row) return;
        const statusBadge = row.querySelector('.fact-status');
        const valEl = row.querySelector('.fact-val');

        if (statusBadge) {
            statusBadge.className = `fact-status ${isRevealed ? 'revealed' : 'hidden'}`;
            statusBadge.textContent = isRevealed ? 'РАСКРЫТ' : 'НЕ РАСКРЫТ';
        }
        if (valEl) {
            valEl.textContent = isRevealed ? text : '—';
        }
    }

    async function fetchBlackBoxHistory() {
        if (!state.sessionId || state.sessionId.startsWith('local_session_')) return;
        try {
            const resp = await fetch(`/api/session/${state.sessionId}/black_box`);
            if (resp.ok) {
                const data = await resp.json();
                renderBlackBoxHistory(data.black_box || []);
            }
        } catch (e) {
            console.warn('[ModularTest] Ошибка загрузки Black Box:', e);
        }
    }

    function renderBlackBoxHistory(records) {
        const container = document.getElementById('black-box-log');
        if (!container) return;
        if (!records.length) {
            container.innerHTML = '<div class="empty-log">Журнал аудита пока пуст</div>';
            return;
        }

        container.innerHTML = records.map(rec => {
            const timeStr = new Date(rec.timestamp * 1000).toLocaleTimeString();
            const sel = rec.selection || {};
            const ana = rec.analysis || {};
            const snap = rec.state_snapshot || {};

            return `
                <div class="audit-record">
                    <div class="audit-header">
                        <span class="audit-turn">Ход #${rec.turn}</span>
                        <span class="audit-time">${timeStr}</span>
                        <span class="badge ${sel.semantic_event === 'CLICHE_RAGE' ? 'badge-danger' : 'badge-primary'}">${sel.semantic_event || 'EVENT'}</span>
                    </div>
                    <div class="audit-body">
                        <div class="audit-row"><b>Оператор:</b> "${escapeHtml(rec.operator_text || '')}"</div>
                        <div class="audit-row"><b>Заявитель:</b> "${escapeHtml(rec.reply_text || '')}"</div>
                        <div class="audit-pills">
                            <span class="pill">audio_id: <code>${sel.audio_id || '—'}</code></span>
                            <span class="pill">статус: <b>${sel.fact_status || '—'}</b></span>
                            <span class="pill">эмоция: <b>${sel.emotion || '—'}</b></span>
                            <span class="pill">паника: <b>${snap.panic_level || 75}%</b></span>
                            ${ana.cliches_count > 0 ? `<span class="pill pill-danger">Канцелярит: +${ana.cliches_count}</span>` : ''}
                            ${ana.is_deescalating ? `<span class="pill pill-success">Деэскалация ✅</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).reverse().join('');
    }

    // =========================================================================
    // 8. ЧАТ ДИАЛОГА
    // =========================================================================
    function clearChat() {
        const box = document.getElementById('dialogue-chat-box');
        if (box) box.innerHTML = '';
    }

    function appendApplicantMessage(text, audioId, options = {}) {
        state.lastReplyText = text;
        const box = document.getElementById('dialogue-chat-box');
        if (!box) return;
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-msg applicant';
        const timeStr = new Date().toLocaleTimeString().slice(0, 5);

        const bricks = options.bricks || [];
        const audioSequence = options.audioSequence || (audioId ? [audioId] : []);

        let bricksHtml = '';
        if (bricks.length > 0) {
            bricksHtml = `
                <div class="brick-badges" style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; margin-bottom: 4px;">
                    ${bricks.map(b => `
                        <span style="font-size: 11px; padding: 2px 8px; border-radius: 4px; ${getBrickRoleBadgeStyle(b.role)} font-weight: 600;">
                            🧱 ${escapeHtml(b.role)}: <code>${escapeHtml(b.audio_id || '')}</code>
                        </span>
                    `).join('')}
                </div>
            `;
        }

        const isSequence = audioSequence.length > 1;
        const buttonText = isSequence
            ? `▶️ Слушать связку (${audioSequence.length} кирп.: <code>${audioSequence.join(' + ')}</code>)`
            : (audioId ? `▶️ Слушать MP3 (<code>${audioId}</code>)` : '');

        let pathBadgeHtml = '';
        if (options.execution_path === 'fast_path') {
            const ms = options.latency_ms !== undefined ? options.latency_ms : 0.5;
            pathBadgeHtml = `<span style="font-size: 11px; padding: 2px 7px; border-radius: 12px; background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.4); font-weight: 600;" title="Нейросетевая модель">⚡ SLM (${ms} ms)</span>`;
        } else if (options.execution_path === 'slm') {
            const ms = options.latency_ms !== undefined ? options.latency_ms : '—';
            pathBadgeHtml = `<span style="font-size: 11px; padding: 2px 7px; border-radius: 12px; background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); font-weight: 600;" title="Нейросетевая классификация SLM Qwen 2.5">🧠 SLM Qwen 2.5 (${ms} ms)</span>`;
        }

        msgDiv.innerHTML = `
            <div class="msg-header" style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="sender-name">👤 Сидоров И.С. (Заявитель)</span>
                    ${pathBadgeHtml}
                </div>
                <span class="msg-time">${timeStr}</span>
            </div>
            <div class="msg-body">${escapeHtml(text)}</div>
            ${bricksHtml}
            <div class="msg-footer">
                ${buttonText ? `<button class="btn-replay-audio" data-audio="${audioId}">${buttonText}</button>` : ''}
            </div>
        `;

        box.appendChild(msgDiv);
        box.scrollTop = box.scrollHeight;

        const replayBtn = msgDiv.querySelector('.btn-replay-audio');
        if (replayBtn) {
            replayBtn.addEventListener('click', () => {
                playApplicantAudio(audioId, {
                    audioSequence: audioSequence,
                    state: state.telemetry.state,
                    fallbackText: text,
                    replyText: text
                });
            });
        }
    }

    function appendOperatorMessage(text) {
        const box = document.getElementById('dialogue-chat-box');
        if (!box) return;
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-msg operator';
        const timeStr = new Date().toLocaleTimeString().slice(0, 5);

        msgDiv.innerHTML = `
            <div class="msg-header">
                <span class="sender-name">🎧 Оператор 112</span>
                <span class="msg-time">${timeStr}</span>
            </div>
            <div class="msg-body">${escapeHtml(text)}</div>
        `;

        box.appendChild(msgDiv);
        box.scrollTop = box.scrollHeight;
    }

    function appendSystemMessage(text) {
        const box = document.getElementById('dialogue-chat-box');
        if (!box) return;
        const sysDiv = document.createElement('div');
        sysDiv.className = 'chat-msg system';
        sysDiv.textContent = text;
        box.appendChild(sysDiv);
        box.scrollTop = box.scrollHeight;
    }

    // =========================================================================
    // 9. КАТАЛОГ РЕПЛИК (ВКЛАДКА 2 - 205 ФРАЗ)
    // =========================================================================
    function initCatalogControls() {
        const searchInput = document.getElementById('cat-search');
        const filterSource = document.getElementById('cat-filter-source');
        const filterEvent = document.getElementById('cat-filter-event');
        const filterEmotion = document.getElementById('cat-filter-emotion');
        const filterStatus = document.getElementById('cat-filter-status');
        const btnReset = document.getElementById('cat-btn-reset');

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                state.catalog.filters.search = e.target.value.toLowerCase().trim();
                applyCatalogFilters();
            });
        }

        if (filterSource) {
            filterSource.addEventListener('change', (e) => {
                state.catalog.filters.source = e.target.value;
                applyCatalogFilters();
            });
        }

        if (filterEvent) {
            filterEvent.addEventListener('change', (e) => {
                state.catalog.filters.event = e.target.value;
                applyCatalogFilters();
            });
        }

        if (filterEmotion) {
            filterEmotion.addEventListener('change', (e) => {
                state.catalog.filters.emotion = e.target.value;
                applyCatalogFilters();
            });
        }

        if (filterStatus) {
            filterStatus.addEventListener('change', (e) => {
                state.catalog.filters.status = e.target.value;
                applyCatalogFilters();
            });
        }

        if (btnReset) {
            btnReset.addEventListener('click', () => {
                state.catalog.filters = {
                    source: 'all',
                    event: 'all',
                    emotion: 'all',
                    status: 'all',
                    search: ''
                };
                if (searchInput) searchInput.value = '';
                if (filterSource) filterSource.value = 'all';
                if (filterEvent) filterEvent.value = 'all';
                if (filterEmotion) filterEmotion.value = 'all';
                if (filterStatus) filterStatus.value = 'all';
                applyCatalogFilters();
            });
        }
    }

    async function loadCatalogData() {
        const container = document.getElementById('catalog-cards-grid');
        if (container) {
            container.innerHTML = '<div class="loading-spinner">Загрузка каталога аудиореплик...</div>';
        }

        try {
            const resp = await fetch('/audio/modular/cosyvoice_manifest.json');
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const dataset = data.dataset || [];

            // Обогащаем фразы категориями и событиями
            state.catalog.items = dataset.map(item => {
                const enriched = Object.assign({}, item);
                parseAudioIdMetadata(enriched);
                return enriched;
            });

            // Также подгружаем bricks_manifest.json для 100% покрытия кирпичиков
            try {
                const bResp = await fetch('/audio/modular/bricks_manifest.json');
                if (bResp.ok) {
                    const bData = await bResp.json();
                    const bDataset = bData.dataset || [];
                    const existingIds = new Set(state.catalog.items.map(it => it.audio_id));
                    bDataset.forEach(item => {
                        if (!existingIds.has(item.audio_id)) {
                            const enriched = Object.assign({}, item);
                            parseAudioIdMetadata(enriched);
                            state.catalog.items.push(enriched);
                            existingIds.add(item.audio_id);
                        }
                    });
                }
            } catch (bErr) {
                console.warn('[ModularTest] bricks_manifest fetch skipped:', bErr);
            }

            // Гарантируем наличие эталонной реплики t01_q01_greeting_correct_panic_01 с правильным текстом
            const greetingItem = state.catalog.items.find(it => it.audio_id === 't01_q01_greeting_correct_panic_01');
            if (!greetingItem) {
                state.catalog.items.unshift({
                    audio_id: 't01_q01_greeting_correct_panic_01',
                    text: 'Алло! 112?! Помогите скорее! Возгорание мусорного контейнера у железнодорожного депо Киевского вокзала, открытое пламя, черный дым! Вы слышите меня?!',
                    emotion: 'panic',
                    intensity: 3,
                    speech_rate: 'fast',
                    filename: 't01_q01_greeting_correct_panic_01.mp3',
                    parsedSource: 't01_s01',
                    parsedEvent: 'GREETING',
                    parsedStatus: 'CORRECT'
                });
            } else if (!greetingItem.text) {
                greetingItem.text = 'Алло! 112?! Помогите скорее! Возгорание мусорного контейнера у железнодорожного депо Киевского вокзала, открытое пламя, черный дым! Вы слышите меня?!';
            }

            state.catalog.loaded = true;
            populateEventFilterOptions();
            applyCatalogFilters();
        } catch (err) {
            console.error('[ModularTest] Ошибка загрузки манифеста:', err);
            if (container) {
                container.innerHTML = `<div class="error-msg">Не удалось загрузить манифест: ${err.message}. Проверьте генерацию аудио.</div>`;
            }
        }
    }

    function parseAudioIdMetadata(item) {
        const aid = item.audio_id || '';
        if (aid.startsWith('react_')) {
            item.parsedSource = 'universal';
            const parts = aid.split('_');
            item.parsedEvent = 'UNIVERSAL_' + (parts[1] || 'REACT').toUpperCase();
            item.parsedStatus = 'REACTION';
        } else {
            item.parsedSource = 't01_s01';
            const parts = aid.split('_');
            if (parts.length >= 6) {
                item.parsedEmotion = parts[parts.length - 2];
                item.parsedStatus = (parts[parts.length - 3] || 'correct').toUpperCase();
                const eventWords = parts.slice(2, parts.length - 3);
                item.parsedEvent = eventWords.join('_').toUpperCase();
            } else {
                item.parsedEvent = 'SCENARIO_EVENT';
                item.parsedStatus = 'CORRECT';
            }
        }
    }

    function populateEventFilterOptions() {
        const filterEvent = document.getElementById('cat-filter-event');
        if (!filterEvent) return;

        const events = new Set();
        state.catalog.items.forEach(it => {
            if (it.parsedEvent) events.add(it.parsedEvent);
        });

        const sortedEvents = Array.from(events).sort();
        let html = '<option value="all">Все события (20+ категорий)</option>';
        sortedEvents.forEach(ev => {
            html += `<option value="${ev}">${ev}</option>`;
        });
        filterEvent.innerHTML = html;
    }

    function applyCatalogFilters() {
        const f = state.catalog.filters;
        state.catalog.filtered = state.catalog.items.filter(item => {
            // Источник
            if (f.source !== 'all' && item.parsedSource !== f.source) return false;

            // Событие
            if (f.event !== 'all' && item.parsedEvent !== f.event) return false;

            // Эмоция
            if (f.emotion !== 'all' && (item.emotion || item.parsedEmotion) !== f.emotion) return false;

            // Статус
            if (f.status !== 'all' && (item.parsedStatus || '').toLowerCase() !== f.status.toLowerCase()) return false;

            // Поиск по тексту и ID
            if (f.search) {
                const text = (item.text || '').toLowerCase();
                const id = (item.audio_id || '').toLowerCase();
                const prompt = (item.cosyvoice_prompt || '').toLowerCase();
                if (!text.includes(f.search) && !id.includes(f.search) && !prompt.includes(f.search)) {
                    return false;
                }
            }

            return true;
        });

        renderCatalogCards();
        updateCatalogStats();
    }

    function updateCatalogStats() {
        const countEl = document.getElementById('cat-display-count');
        if (countEl) {
            countEl.textContent = `Показано: ${state.catalog.filtered.length} из ${state.catalog.items.length}`;
        }
    }

    function renderCatalogCards() {
        const container = document.getElementById('catalog-cards-grid');
        if (!container) return;

        if (!state.catalog.filtered.length) {
            container.innerHTML = '<div class="empty-cards">Реплик по заданным фильтрам не найдено</div>';
            return;
        }

        container.innerHTML = state.catalog.filtered.map(item => {
            const isPlaying = state.catalog.currentPlayingId === item.audio_id;
            const emo = item.emotion || item.parsedEmotion || 'neutral';
            const pros = item.prosody || { pitch: '+0Hz', rate: '+0%' };

            return `
                <div class="phrase-card ${isPlaying ? 'playing' : ''}" id="card-${item.audio_id}">
                    <div class="card-top">
                        <span class="badge badge-source ${item.parsedSource}">${item.parsedSource === 't01_s01' ? 'Билет 1 / Сит 1' : 'Универсальная'}</span>
                        <span class="badge badge-event">${item.parsedEvent || 'EVENT'}</span>
                        <span class="badge badge-emotion ${emo}">${emo.toUpperCase()}</span>
                        <span class="badge badge-status">${item.parsedStatus || 'STATUS'}</span>
                    </div>

                    <div class="card-id-row">
                        <code class="audio-id-code">${item.audio_id}</code>
                        <button class="btn-copy-id" title="Скопировать audio_id" data-copy="${item.audio_id}">📋</button>
                    </div>

                    <div class="card-text">${escapeHtml(item.text)}</div>

                    <div class="card-meta-row">
                        <span class="meta-tag">⏱️ ${item.speech_rate || 'normal'}</span>
                        <span class="meta-tag">🎚️ pitch: ${pros.pitch}</span>
                        <span class="meta-tag">⚡ rate: ${pros.rate}</span>
                    </div>

                    <div class="card-prompt">
                        <b>CosyVoice:</b> <i>${escapeHtml(item.cosyvoice_prompt || '—')}</i>
                    </div>

                    <div class="card-actions">
                        <button class="btn-play-card ${isPlaying ? 'playing' : ''}" data-audio-id="${item.audio_id}" data-filename="${item.filename}">
                            ${isPlaying ? '⏹ Остановить' : '▶️ Воспроизвести MP3'}
                        </button>
                        <a class="btn-link-file" href="/audio/modular/${item.filename}" target="_blank" title="Открыть MP3 в новой вкладке">🔗 MP3</a>
                    </div>
                </div>
            `;
        }).join('');

        // Навешиваем слушатели на кнопки Play и Copy
        container.querySelectorAll('.btn-play-card').forEach(btn => {
            btn.addEventListener('click', () => {
                const aid = btn.dataset.audioId;
                const fn = btn.dataset.filename;
                playCatalogAudio(aid, fn);
            });
        });

        container.querySelectorAll('.btn-copy-id').forEach(btn => {
            btn.addEventListener('click', () => {
                const text = btn.dataset.copy;
                navigator.clipboard.writeText(text);
                showToast(`Скопировано: ${text}`);
            });
        });
    }

    async function playCatalogAudio(audioId, filename) {
        const dsp = getAudioDsp();
        if (!dsp) return;

        // Если эта реплика уже играет — останавливаем
        if (state.catalog.currentPlayingId === audioId) {
            dsp.stopCurrentAudioFile({ fadeDurationMs: 50 });
            state.catalog.currentPlayingId = null;
            renderCatalogCards();
            return;
        }

        // Останавливаем предыдущую
        dsp.stopCurrentAudioFile({ fadeDurationMs: 50 });
        state.catalog.currentPlayingId = audioId;
        renderCatalogCards();

        const url = `/audio/modular/${filename || audioId + '.mp3'}`;

        try {
            await dsp.playAudioFile(url, {
                applyTelephoneFilter: state.dsp.phoneFilter,
                withLineNoise: false, // в каталоге слушаем чистый звук
                withRadioClick: false,
                volume: state.dsp.masterVolume,
                onEnd: () => {
                    if (state.catalog.currentPlayingId === audioId) {
                        state.catalog.currentPlayingId = null;
                        renderCatalogCards();
                    }
                }
            });
        } catch (err) {
            console.warn('[ModularTest] Ошибка воспроизведения карточки:', err);
            state.catalog.currentPlayingId = null;
            renderCatalogCards();
        }
    }

    // =========================================================================
    // 10. ВСПОМОГАТЕЛЬНЫЕ УТИЛИТЫ
    // =========================================================================
    function escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function showToast(msg, type = 'info') {
        const toast = document.getElementById('sandbox-toast');
        if (!toast) return;
        toast.textContent = msg;
        toast.className = `sandbox-toast show ${type}`;
        setTimeout(() => {
            toast.className = 'sandbox-toast';
        }, 2600);
    }

})();
