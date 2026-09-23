/**
 * audio_dsp.js - Web Audio API Телефонный DSP-тракт и аудио-эффекты Системы-112
 * 
 * Включает:
 * 1. Телефонный полосовой фильтр 300–3400 Гц (Bandpass Filter, Q=1.5 + Highpass/Lowpass)
 * 2. Легкую телефонную сатурацию (WaveShaper/distortion)
 * 3. Фоновый шум телефонной линии / шипение (Line noise/hiss)
 * 4. Телефонные гудки вызова (Ringtone 425 Гц, 1 сек гудок / 4 сек пауза, ГОСТ 28384-89)
 * 5. Двухтональный зуммер тревоги нарушения 30s SLA (850 Гц / 1100 Гц)
 * 6. Радио-клик и транковый бип (Roger beep / squelch) завершения реплик
 * 7. Голосовой синтез реплик заявителя через Web Speech API с наложением телефонных эффектов и аудио-фоллбэком
 */

/**
 * AmbienceEngine - 2-дорожечный звуковой узел фонового шума происшествия (пожар/депо/улица).
 * Обеспечивает:
 * 1. Процедурный синтез шума огня, треска и железнодорожного депо (100% Air-Gap автономность без внешних mp3).
 * 2. Воспроизведение внешнего аудиофайла (при наличии).
 * 3. Плавный fade-in и fade-out.
 * 4. Ducking (приглушение) во время речи и unducking при паузе/завершении реплики.
 * 5. Полную изоляцию от Barge-In (при перебивании оператором глушится только голос).
 */
class AmbienceEngine {
    constructor(ctx, destinationNode) {
        this.ctx = ctx;
        this.destination = destinationNode;
        this.masterGain = null;
        this.duckingGain = null;
        this.isActive = false;
        this.currentType = null;

        // Procedural audio nodes
        this.noiseSource = null;
        this.fireFilter = null;
        this.humOsc = null;
        this.crackleInterval = null;
        this.lfoGain = null;
        this.lfoOsc = null;

        // Audio element for optional external file
        this.audioElement = null;
        this.mediaSource = null;

        this._targetGain = 0.3;
    }

    _ensureGainNodes() {
        if (!this.ctx) return;
        if (!this.masterGain) {
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);

            this.duckingGain = this.ctx.createGain();
            this.duckingGain.gain.setValueAtTime(1.0, this.ctx.currentTime);

            this.masterGain.connect(this.duckingGain);
            this.duckingGain.connect(this.destination || this.ctx.destination);
        }
    }

    start(options = {}) {
        if (!this.ctx) return false;
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        this._ensureGainNodes();

        const type = options.type || 'fire_depot';
        const volume = options.volume !== undefined ? options.volume : 0.3;
        const fadeInSec = options.fadeInSec !== undefined ? options.fadeInSec : 1.5;
        this._targetGain = Math.max(0.0001, Math.min(1.0, volume));
        this.currentType = type;

        if (this.isActive) {
            const now = this.ctx.currentTime;
            this.masterGain.gain.cancelScheduledValues(now);
            this.masterGain.gain.linearRampToValueAtTime(this._targetGain, now + fadeInSec);
            return true;
        }

        this.isActive = true;

        if (options.fileUrl) {
            this._startAudioFile(options.fileUrl, options);
        } else {
            this._startProceduralAmbience(type, options);
        }

        const now = this.ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(0.0001, now);
        this.masterGain.gain.linearRampToValueAtTime(this._targetGain, now + fadeInSec);
        console.log(`[AmbienceEngine] 🔥 Запущен фоновый амбиенс (${type}), громкость: ${this._targetGain}`);
        return true;
    }

    _startProceduralAmbience(type, options = {}) {
        if (!this.ctx) return;

        // 1. Слой непрерывного розово-коричневого шума пламени и ветра
        const bufferSize = this.ctx.sampleRate * 4;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
            b6 = white * 0.115926;
        }

        this.noiseSource = this.ctx.createBufferSource();
        this.noiseSource.buffer = noiseBuffer;
        this.noiseSource.loop = true;

        this.fireFilter = this.ctx.createBiquadFilter();
        this.fireFilter.type = 'lowpass';
        this.fireFilter.frequency.setValueAtTime(650, this.ctx.currentTime);
        this.fireFilter.Q.setValueAtTime(2.0, this.ctx.currentTime);

        this.lfoOsc = this.ctx.createOscillator();
        this.lfoGain = this.ctx.createGain();
        this.lfoOsc.frequency.setValueAtTime(0.6, this.ctx.currentTime);
        this.lfoGain.gain.setValueAtTime(150, this.ctx.currentTime);
        this.lfoOsc.connect(this.fireFilter.frequency);
        this.lfoOsc.start();

        this.noiseSource.connect(this.fireFilter);
        this.fireFilter.connect(this.masterGain);
        this.noiseSource.start();

        // 2. Слой низкочастотного гула депо / тяговой подстанции
        this.humOsc = this.ctx.createOscillator();
        const humGain = this.ctx.createGain();
        this.humOsc.type = 'sine';
        this.humOsc.frequency.setValueAtTime(55, this.ctx.currentTime);
        humGain.gain.setValueAtTime(0.12, this.ctx.currentTime);
        this.humOsc.connect(humGain);
        humGain.connect(this.masterGain);
        this.humOsc.start();

        // 3. Слой нерегулярных потрескиваний огня
        this._startCrackles();
    }

    _startCrackles() {
        if (this.crackleInterval) clearInterval(this.crackleInterval);
        this.crackleInterval = setInterval(() => {
            if (!this.isActive || !this.ctx || this.ctx.state !== 'running') return;
            if (Math.random() < 0.65) {
                this._triggerSingleCrackle();
            }
        }, 180);
    }

    _triggerSingleCrackle() {
        if (!this.ctx || !this.masterGain) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1200 + Math.random() * 2400, now);
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(1800, now);

        const crackleDuration = 0.008 + Math.random() * 0.015;
        const crackleAmp = 0.08 + Math.random() * 0.12;

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(crackleAmp, now + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + crackleDuration);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + crackleDuration + 0.01);
    }

    _startAudioFile(url, options) {
        try {
            this.audioElement = new Audio(url);
            this.audioElement.loop = true;
            this.mediaSource = this.ctx.createMediaElementSource(this.audioElement);
            this.mediaSource.connect(this.masterGain);
            this.audioElement.play().catch(e => {
                console.warn('[AmbienceEngine] Файл амбиенса недоступен, fallback на процедурный синтез:', e);
                this._startProceduralAmbience(options.type || 'fire_depot', options);
            });
        } catch (err) {
            console.warn('[AmbienceEngine] Ошибка воспроизведения файла амбиенса:', err);
            this._startProceduralAmbience(options.type || 'fire_depot', options);
        }
    }

    duck(duckFactor = 0.35, rampSec = 0.2) {
        if (!this.duckingGain || !this.ctx) return;
        const now = this.ctx.currentTime;
        this.duckingGain.gain.cancelScheduledValues(now);
        this.duckingGain.gain.linearRampToValueAtTime(Math.max(0.05, duckFactor), now + rampSec);
    }

    unduck(rampSec = 0.4) {
        if (!this.duckingGain || !this.ctx) return;
        const now = this.ctx.currentTime;
        this.duckingGain.gain.cancelScheduledValues(now);
        this.duckingGain.gain.linearRampToValueAtTime(1.0, now + rampSec);
    }

    /**
     * Акустическая маскировка Zero-Vacuum и ducking фонового амбиенса при репликах оператора:
     * - isSpeaking == true: оператор говорит в микрофон -> ducking фонового амбиенса до уровня 0.20-0.25 (чтобы не заглушать голос курсанта)
     * - isSpeaking == false: оператор закончил фразу и ожидает ответа -> плавный unducking амбиенса ЧС до уровня 0.40-0.45 за 150-200 мс (Zero-Vacuum)
     * @param {boolean} isSpeaking - признак активности речи/микрофона оператора
     */
    triggerOperatorSpeakingState(isSpeaking) {
        if (!this.ctx) return;
        this._ensureGainNodes();
        if (!this.isActive) {
            this.start({ volume: 0.42, fadeInSec: 0.15 });
        }

        const now = this.ctx.currentTime;
        if (!this.duckingGain) return;

        const currentVal = this.duckingGain.gain.value;
        this.duckingGain.gain.cancelScheduledValues(now);
        this.duckingGain.gain.setValueAtTime(currentVal, now);

        if (isSpeaking) {
            // Ducking фонового амбиенса до уровня 0.20-0.25 (чтобы не заглушать голос курсанта)
            this.duckingGain.gain.linearRampToValueAtTime(0.22, now + 0.15);
        } else {
            // Плавный unducking амбиенса ЧС до уровня 0.40-0.45 за 150-200 мс (Zero-Vacuum)
            this.duckingGain.gain.linearRampToValueAtTime(0.42, now + 0.18);
        }
    }

    stop(options = {}) {
        if (!this.isActive || !this.ctx) return;
        const fadeOutSec = options.fadeOutSec !== undefined ? options.fadeOutSec : 1.2;
        const now = this.ctx.currentTime;

        if (this.masterGain) {
            this.masterGain.gain.cancelScheduledValues(now);
            this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
            this.masterGain.gain.linearRampToValueAtTime(0.0001, now + fadeOutSec);
        }

        setTimeout(() => {
            this._cleanup();
            this.isActive = false;
            console.log('[AmbienceEngine] Фоновый амбиенс остановлен');
        }, Math.floor(fadeOutSec * 1000) + 100);
    }

    _cleanup() {
        if (this.crackleInterval) {
            clearInterval(this.crackleInterval);
            this.crackleInterval = null;
        }
        if (this.noiseSource) {
            try { this.noiseSource.stop(); this.noiseSource.disconnect(); } catch(e) {}
            this.noiseSource = null;
        }
        if (this.humOsc) {
            try { this.humOsc.stop(); this.humOsc.disconnect(); } catch(e) {}
            this.humOsc = null;
        }
        if (this.lfoOsc) {
            try { this.lfoOsc.stop(); this.lfoOsc.disconnect(); } catch(e) {}
            this.lfoOsc = null;
        }
        if (this.audioElement) {
            try { this.audioElement.pause(); this.audioElement.src = ''; } catch(e) {}
            this.audioElement = null;
        }
    }
}

class AudioDSP {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.phoneInput = null;
        this.phoneOutput = null;

        // 2-track ambience engine
        this.ambience = null;

        // DSP Nodes
        this.highpassFilter = null;
        this.lowpassFilter = null;
        this.bandpassFilter = null;
        this.waveShaperNode = null;
        this.saturationGain = null;

        // Noise state
        this.noiseBuffer = null;
        this.noiseSource = null;
        this.noiseGain = null;
        this.isNoiseActive = false;

        // Ringtone state
        this.ringtoneTimer = null;
        this.isRingtoneActive = false;

        // SLA Alarm state
        this.slaInterval = null;
        this.isSlaAlarmActive = false;

        // Speech synthesis state
        this.speechSynth = typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis : null;
        this.currentUtterance = null;
        this.selectedVoice = null;

        // Audio file playback state
        this.currentAudioSource = null;
        this.currentAudioGain = null;
        this.currentHtmlAudio = null;
        this._currentAudioStartTime = null;
        this._currentAudioDuration = null;
        this._audioBufferCache = new Map();
        this._interruptedCallbackFired = false;

        // Track user interaction initialization
        this.isInitialized = false;
        this._initVoices();
    }

    /**
     * Инициализация AudioContext по первому действию пользователя
     */
    initContext() {
        if (this.isInitialized && this.ctx) {
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
            return this.ctx;
        }

        const AudioContextClass = typeof window !== 'undefined' ? 
            (window.AudioContext || window.webkitAudioContext) : null;

        if (!AudioContextClass) {
            console.warn('[AudioDSP] Web Audio API не поддерживается в данной среде');
            return null;
        }

        this.ctx = new AudioContextClass();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(0.9, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);

        // Построение телефонного DSP-тракта
        this._buildTelephonePipeline();

        // Предварительная генерация шума линии
        this._initLineNoiseNode();

        // 2-дорожечный звуковой узел амбиенса (пожар/депо/улица)
        if (!this.ambience) {
            this.ambience = new AmbienceEngine(this.ctx, this.masterGain);
        }

        this.isInitialized = true;
        console.log('[AudioDSP] Web Audio API телефонный тракт и 2-дорожечный амбиенс инициализированы');
        return this.ctx;
    }

    /**
     * Запуск фонового амбиенса происшествия (пожар/депо)
     */
    startAmbience(options = {}) {
        this.initContext();
        if (this.ambience) {
            return this.ambience.start(options);
        }
        return false;
    }

    /**
     * Остановка фонового амбиенса
     */
    stopAmbience(options = {}) {
        if (this.ambience) {
            return this.ambience.stop(options);
        }
        return false;
    }

    /**
     * Ducking фонового амбиенса при начале речи
     */
    duckAmbience(duckFactor = 0.35, rampSec = 0.2) {
        if (this.ambience) {
            this.ambience.duck(duckFactor, rampSec);
        }
    }

    /**
     * Unducking фонового амбиенса после завершения речи
     */
    unduckAmbience(rampSec = 0.4) {
        if (this.ambience) {
            this.ambience.unduck(rampSec);
        }
    }

    /**
     * Акустическая маскировка Zero-Vacuum / ducking амбиенса при репликах оператора
     * @param {boolean} isSpeaking - признак активности речи/микрофона оператора
     */
    triggerOperatorSpeakingState(isSpeaking) {
        if (this.ambienceEngine) {
            this.ambienceEngine.triggerOperatorSpeakingState(isSpeaking);
        }
    }

    get ambienceEngine() {
        if (!this.ambience && this.ctx) {
            this.ambience = new AmbienceEngine(this.ctx, this.masterGain);
        }
        return this.ambience;
    }

    set ambienceEngine(val) {
        this.ambience = val;
    }

    /**
     * Создание цепочки телефонного кодека:
     * Input -> Highpass(300Hz) -> Bandpass(1850Hz, Q=1.5) -> Lowpass(3400Hz) -> WaveShaper(Soft Saturation) -> Master
     */
    _buildTelephonePipeline() {
        if (!this.ctx) return;

        // Входной узел телефонного тракта
        this.phoneInput = this.ctx.createGain();
        this.phoneInput.gain.setValueAtTime(1.0, this.ctx.currentTime);

        // 1. Полосовой фильтр частот 300–3400 Гц (Bandpass Filter, Q=1.5)
        this.bandpassFilter = this.ctx.createBiquadFilter();
        this.bandpassFilter.type = 'bandpass';
        // Центр телефонного диапазона 300-3400 Гц
        this.bandpassFilter.frequency.setValueAtTime(1850, this.ctx.currentTime);
        this.bandpassFilter.Q.setValueAtTime(1.5, this.ctx.currentTime);

        // Дополнительные краевые фильтры среза G.711 (300 Гц и 3400 Гц)
        this.highpassFilter = this.ctx.createBiquadFilter();
        this.highpassFilter.type = 'highpass';
        this.highpassFilter.frequency.setValueAtTime(300, this.ctx.currentTime);
        this.highpassFilter.Q.setValueAtTime(0.707, this.ctx.currentTime);

        this.lowpassFilter = this.ctx.createBiquadFilter();
        this.lowpassFilter.type = 'lowpass';
        this.lowpassFilter.frequency.setValueAtTime(3400, this.ctx.currentTime);
        this.lowpassFilter.Q.setValueAtTime(0.707, this.ctx.currentTime);

        // 2. Легкий эффект телефонной сатурации (WaveShaper/distortion)
        this.waveShaperNode = this.ctx.createWaveShaper();
        this.waveShaperNode.curve = this._createSaturationCurve(15, 2048);
        this.waveShaperNode.oversample = '2x';

        // Компенсационный гейн после сатурации
        this.saturationGain = this.ctx.createGain();
        this.saturationGain.gain.setValueAtTime(0.8, this.ctx.currentTime);

        // Выходной узел телефонного тракта
        this.phoneOutput = this.ctx.createGain();
        this.phoneOutput.gain.setValueAtTime(0.9, this.ctx.currentTime);

        // Соединение: phoneInput -> highpass -> bandpass -> lowpass -> waveShaper -> saturationGain -> phoneOutput -> masterGain
        this.phoneInput.connect(this.highpassFilter);
        this.highpassFilter.connect(this.bandpassFilter);
        this.bandpassFilter.connect(this.lowpassFilter);
        this.lowpassFilter.connect(this.waveShaperNode);
        this.waveShaperNode.connect(this.saturationGain);
        this.saturationGain.connect(this.phoneOutput);
        this.phoneOutput.connect(this.masterGain);
    }

    /**
     * Создание мягкой кривой сатурации (гармоническое насыщение микрофона)
     */
    _createSaturationCurve(amount = 15, samples = 2048) {
        const curve = new Float32Array(samples);
        const k = typeof amount === 'number' ? amount : 15;
        for (let i = 0; i < samples; ++i) {
            const x = (i * 2) / samples - 1;
            // Мягкая аналоговая телефонная компрессия/сатурация на базе гиперболического тангенса
            curve[i] = Math.tanh((1.0 + k * 0.15) * x);
        }
        return curve;
    }

    /**
     * Инициализация фонового шума линии (PSTN line hiss / thermal noise)
     */
    _initLineNoiseNode() {
        if (!this.ctx) return;

        const bufferSize = this.ctx.sampleRate * 2; // 2 секунды шума
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);

        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
            // Розовый/телефонный шум (1/f спад для естественности)
            const white = Math.random() * 2 - 1;
            output[i] = (lastOut * 0.92) + (white * 0.08);
            lastOut = output[i];
        }

        this.noiseBuffer = noiseBuffer;
        this.noiseGain = this.ctx.createGain();
        this.noiseGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

        // Фильтр для шума линии: полосовой 300 - 3000 Гц
        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(1500, this.ctx.currentTime);
        noiseFilter.Q.setValueAtTime(1.0, this.ctx.currentTime);

        this.noiseGain.connect(noiseFilter);
        noiseFilter.connect(this.phoneOutput || this.masterGain);
    }

    /**
     * Включение фонового шума линии / шипения
     */
    startLineNoise(volume = 0.02) {
        this.initContext();
        if (!this.ctx || this.isNoiseActive) return;

        try {
            this.noiseSource = this.ctx.createBufferSource();
            this.noiseSource.buffer = this.noiseBuffer;
            this.noiseSource.loop = true;
            this.noiseSource.connect(this.noiseGain);

            const now = this.ctx.currentTime;
            this.noiseGain.gain.cancelScheduledValues(now);
            this.noiseGain.gain.setValueAtTime(0.0001, now);
            this.noiseGain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), now + 0.3);

            this.noiseSource.start(0);
            this.isNoiseActive = true;
            console.log('[AudioDSP] Фоновый шум линии включен');
        } catch (e) {
            console.warn('[AudioDSP] Ошибка запуска шума линии:', e);
        }
    }

    /**
     * Выключение фонового шума линии
     */
    stopLineNoise() {
        if (!this.ctx || !this.isNoiseActive || !this.noiseSource) return;

        this.isNoiseActive = false;
        try {
            const now = this.ctx.currentTime;
            this.noiseGain.gain.cancelScheduledValues(now);
            this.noiseGain.gain.setValueAtTime(this.noiseGain.gain.value, now);
            this.noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

            const src = this.noiseSource;
            this.noiseSource = null;
            setTimeout(() => {
                if (src) {
                    try { src.stop(); } catch (_) {}
                    src.disconnect();
                }
            }, 250);
        } catch (e) {
            console.warn('[AudioDSP] Ошибка остановки шума:', e);
        }
    }

    /**
     * Генератор телефонных гудков вызова
     * Стандарт РФ: 425 Гц ± 3 Гц, цикл 1.0 сек гудок / 4.0 сек пауза
     */
    startRingtone() {
        this.initContext();
        if (!this.ctx || this.isRingtoneActive) return;

        this.isRingtoneActive = true;

        const playTonePulse = () => {
            if (!this.isRingtoneActive || !this.ctx) return;

            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(425, now);

            // Плавное нарастание и затухание для отсутствия щелчков (атака/релиз по 25 мс)
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(0.22, now + 0.025);
            gain.gain.setValueAtTime(0.22, now + 0.975);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);

            osc.connect(gain);
            gain.connect(this.masterGain);

            osc.start(now);
            osc.stop(now + 1.05);

            // Цикл: 1 сек гудок + 4 сек пауза = 5 сек
            this.ringtoneTimer = setTimeout(() => {
                if (this.isRingtoneActive) {
                    playTonePulse();
                }
            }, 5000);
        };

        playTonePulse();
        console.log('[AudioDSP] Телефонные гудки вызова (425 Гц, 1с/4с) запущены');
    }

    /**
     * Остановка телефонных гудков вызова
     */
    stopRingtone() {
        this.isRingtoneActive = false;
        if (this.ringtoneTimer) {
            clearTimeout(this.ringtoneTimer);
            this.ringtoneTimer = null;
        }
        console.log('[AudioDSP] Гудки вызова остановлены');
    }

    /**
     * Звуковой сигнал тревоги нарушения 30s SLA (двухтональный зуммер)
     * Чередующиеся тона: 850 Гц и 1100 Гц с резкой тревогой
     */
    playSlaAlarm() {
        this.initContext();
        if (!this.ctx || this.isSlaAlarmActive) return;

        this.isSlaAlarmActive = true;
        let step = 0;

        const pulseAlarm = () => {
            if (!this.isSlaAlarmActive || !this.ctx) return;

            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sawtooth';
            // Двухтональный зуммер: шаг 0 = 850 Гц, шаг 1 = 1100 Гц
            const freq = (step % 2 === 0) ? 850 : 1100;
            step++;

            osc.frequency.setValueAtTime(freq, now);

            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.linearRampToValueAtTime(0.18, now + 0.015);
            gain.gain.setValueAtTime(0.18, now + 0.09);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

            osc.connect(gain);
            gain.connect(this.masterGain);

            osc.start(now);
            osc.stop(now + 0.13);
        };

        pulseAlarm();
        this.slaInterval = setInterval(pulseAlarm, 150);
        console.log('[AudioDSP] Звуковой сигнал тревоги нарушения 30s SLA активен');
    }

    /**
     * Остановка сигнала тревоги SLA
     */
    stopSlaAlarm() {
        this.isSlaAlarmActive = false;
        if (this.slaInterval) {
            clearInterval(this.slaInterval);
            this.slaInterval = null;
        }
        console.log('[AudioDSP] Сигнал тревоги SLA выключен');
    }

    /**
     * Радио-клик / транковый бип рации при начале или завершении реплик
     * Имитирует PTT отжатие (squelch burst) и характерный тональный сигнал TETRA/рации
     */
    playRadioClick(options = {}) {
        this.initContext();
        if (!this.ctx) return;

        const isOpening = options.isOpening || false;
        const now = this.ctx.currentTime;

        // 1. Короткий шумовой импульс (PTT Squelch) 35 мс
        const noiseLen = 0.035;
        const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * noiseLen), this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.4));
        }

        const noiseSrc = this.ctx.createBufferSource();
        noiseSrc.buffer = buffer;

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.08, now);

        const bandpass = this.ctx.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.setValueAtTime(2200, now);
        bandpass.Q.setValueAtTime(2.0, now);

        noiseSrc.connect(noiseGain);
        noiseGain.connect(bandpass);
        bandpass.connect(this.masterGain);

        noiseSrc.start(now);
        noiseSrc.stop(now + noiseLen);

        // 2. Транковый тональный бип (Roger Beep) 1050 Гц / 1300 Гц
        const toneOsc = this.ctx.createOscillator();
        const toneGain = this.ctx.createGain();

        toneOsc.type = 'sine';
        if (isOpening) {
            // При открытии канала: короткий восходящий пик
            toneOsc.frequency.setValueAtTime(800, now);
            toneOsc.frequency.exponentialRampToValueAtTime(1200, now + 0.04);
        } else {
            // При закрытии канала: классический транковый Roger Beep
            toneOsc.frequency.setValueAtTime(1046, now); // C6 note
            toneOsc.frequency.setValueAtTime(880, now + 0.03);  // A5 note
        }

        toneGain.gain.setValueAtTime(0.0001, now);
        toneGain.gain.linearRampToValueAtTime(0.12, now + 0.005);
        toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);

        toneOsc.connect(toneGain);
        toneGain.connect(this.masterGain);

        toneOsc.start(now);
        toneOsc.stop(now + 0.08);
    }

    /**
     * Поиск подходящего русского голоса в системе
     */
    _initVoices() {
        if (!this.speechSynth) return;

        const updateVoices = () => {
            const voices = this.speechSynth.getVoices();
            if (!voices || voices.length === 0) return;

            // Предпочитаем русский голос
            const ruVoice = voices.find(v => v.lang.includes('ru') || v.lang.includes('RU')) ||
                            voices.find(v => v.name.toLowerCase().includes('russian') || v.name.toLowerCase().includes('milena') || v.name.toLowerCase().includes('yuri'));
            this.selectedVoice = ruVoice || voices[0];
        };

        updateVoices();
        if (this.speechSynth.onvoiceschanged !== undefined) {
            this.speechSynth.onvoiceschanged = updateVoices;
        }
    }

    /**
     * Голосовой синтез реплик заявителя через Web Speech API
     * С наложением телефонных параметров (высота, скорость, радио-клики)
     * и фоллбэком на аппаратную генерацию при отсутствии TTS
     */
    async speakApplicant(text, options = {}) {
        this.initContext();
        if (!this.ctx) return false;

        const onStart = options.onStart || (() => {});
        const onEnd = options.onEnd || (() => {});
        const state = options.state || 'panic';
        
        // Pick speaker based on panic state for variety, or just keep 'aidar'
        const speaker = (state === 'grounded' || state === 'cooperative') ? 'xenia' : 'aidar';

        this.playRadioClick({ isOpening: true });

        try {
            // Fetch TTS from local Silero endpoint
            const res = await fetch(`/api/tts?text=${encodeURIComponent(text)}&speaker=${speaker}`);
            if (!res.ok) throw new Error("TTS fetch failed");
            
            const arrayBuffer = await res.arrayBuffer();
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            
            this.startLineNoise(0.015);
            onStart();
            
            const source = this.ctx.createBufferSource();
            source.buffer = audioBuffer;
            
            // Route through the telephone DSP filter!
            source.connect(this.phoneInput || this.masterGain);
            
            source.onended = () => {
                this.playRadioClick({ isOpening: false });
                onEnd();
            };
            
            source.start(0);
            return true;
            
        } catch (err) {
            console.warn('[AudioDSP] Ошибка Silero TTS, запуск фоллбэка:', err);
            this.playFallbackSpeechAudio(text, options);
            return false;
        }
    }

    /**
     * Акустический фоллбэк телефонной речи через Web Audio API
     * Генерирует серию формантных импульсов речи через DSP полосовой фильтр и сатурацию
     */
    playFallbackSpeechAudio(text, options = {}) {
        this.initContext();
        if (!this.ctx) {
            if (options.onEnd) options.onEnd();
            return;
        }

        const state = options.state || 'panic';
        const syllables = Math.min(30, Math.max(4, Math.floor(text.length / 3.5)));
        const syllableDuration = state === 'panic' ? 0.08 : 0.11;
        const totalDuration = syllables * syllableDuration;

        if (options.onStart) options.onStart();
        this.startLineNoise(0.018);

        const now = this.ctx.currentTime;
        let t = now + 0.05;

        for (let i = 0; i < syllables; i++) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            // Формантные частоты мужского/женского голоса в телефонном спектре (400-2400 Гц)
            const baseFreq = state === 'panic' ? (280 + Math.random() * 160) : (180 + Math.random() * 120);
            osc.type = i % 2 === 0 ? 'triangle' : 'sawtooth';
            osc.frequency.setValueAtTime(baseFreq, t);
            osc.frequency.exponentialRampToValueAtTime(baseFreq * (0.9 + Math.random() * 0.3), t + syllableDuration * 0.8);

            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.linearRampToValueAtTime(0.12, t + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + syllableDuration - 0.01);

            // Пропускаем через телефонный DSP тракт (Bandpass 300-3400 Гц + Saturation)
            osc.connect(gain);
            gain.connect(this.phoneInput || this.masterGain);

            osc.start(t);
            osc.stop(t + syllableDuration);

            t += syllableDuration;
        }

        setTimeout(() => {
            this.playRadioClick({ isOpening: false });
            if (options.onEnd) options.onEnd();
        }, Math.floor((totalDuration + 0.1) * 1000));
    }

    /**
     * Воспроизведение реального аудиофайла (MP3/WAV) через Web Audio API
     * с пропусканием через телефонный фильтр (300-3400 Гц + WaveShaper)
     * и возможностью наложения фонового шума линии и радио-кликов.
     * 
     * @param {string} url - Путь к аудиофайлу
     * @param {Object} options - Опции воспроизведения:
     *   - onStart: callback при начале воспроизведения
     *   - onEnd: callback при завершении воспроизведения
     *   - applyTelephoneFilter: boolean (по умолчанию true)
     *   - withLineNoise: boolean (по умолчанию true)
     *   - withRadioClick: boolean (по умолчанию true)
     *   - volume: number (0.0 - 1.0, по умолчанию 1.0)
     *   - cancelPrevious: boolean (по умолчанию true)
     * @returns {Promise<boolean>}
     */
    async playAudioFile(url, options = {}) {
        this.initContext();
        if (!this.ctx) {
            return this._playAudioElementFallback(url, options);
        }

        const applyFilter = (options.applyTelephoneFilter !== undefined ? options.applyTelephoneFilter : options.applyFilter) !== false;
        const withNoise = (options.withLineNoise !== undefined ? options.withLineNoise : options.withNoise) !== false;
        const withClick = (options.withRadioClick !== undefined ? options.withRadioClick : options.withClick) !== false;
        const volume = options.volume !== undefined ? Math.max(0, Math.min(1.0, options.volume)) : 1.0;
        const onStart = options.onStart || (() => {});
        const onEnd = options.onEnd || (() => {});

        if (options.cancelPrevious !== false) {
            this.stopCurrentAudioFile({ immediate: true });
            this.cancelSpeech();
        }

        if (withClick) {
            this.playRadioClick({ isOpening: true });
        }

        if (typeof window === 'undefined' || !window.location) {
            return this._playAudioElementFallback(url, options);
        }

        try {
            if (!this._audioBufferCache) {
                this._audioBufferCache = new Map();
            }

            let audioBuffer = this._audioBufferCache.get(url);
            if (!audioBuffer) {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status} loading ${url}`);
                }
                const arrayBuffer = await response.arrayBuffer();
                audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
                this._audioBufferCache.set(url, audioBuffer);
            }

            const source = this.ctx.createBufferSource();
            source.buffer = audioBuffer;

            const fileGain = this.ctx.createGain();
            fileGain.gain.setValueAtTime(volume, this.ctx.currentTime);

            source.connect(fileGain);

            if (applyFilter) {
                // Пропускаем через телефонный DSP-тракт (300-3400 Гц + WaveShaper)
                fileGain.connect(this.phoneInput || this.masterGain);
            } else {
                fileGain.connect(this.masterGain);
            }

            if (withNoise) {
                this.startLineNoise(0.015);
            }

            this.currentAudioSource = source;
            this.currentAudioGain = fileGain;

            return new Promise((resolve) => {
                source.onended = () => {
                    if (this.currentAudioSource === source) {
                        this.currentAudioSource = null;
                        this.currentAudioGain = null;
                    }
                    this._currentAudioStartTime = null;
                    this._currentAudioDuration = null;
                    if (withNoise) {
                        this.stopLineNoise();
                    }
                    if (withClick) {
                        this.playRadioClick({ isOpening: false });
                    }
                    onEnd();
                    resolve(true);
                };

                source.start(0);
                this._currentAudioStartTime = this.ctx.currentTime;
                this._currentAudioDuration = audioBuffer.duration;
                onStart();
            });

        } catch (err) {
            console.warn('[AudioDSP] Ошибка Web Audio API при воспроизведении ' + url + ', переход на HTML5 Audio fallback:', err);
            return this._playAudioElementFallback(url, options);
        }
    }

    /**
     * Получить оставшееся время звучания текущего чанка/аудиофайла (в секундах)
     */
    getRemainingAudioDuration() {
        if (this.currentAudioSource && this.ctx && this._currentAudioStartTime && this._currentAudioDuration) {
            const elapsed = Math.max(0, this.ctx.currentTime - this._currentAudioStartTime);
            return Math.max(0, this._currentAudioDuration - elapsed);
        }
        if (this.currentHtmlAudio && !isNaN(this.currentHtmlAudio.duration)) {
            return Math.max(0, this.currentHtmlAudio.duration - this.currentHtmlAudio.currentTime);
        }
        return 0;
    }

    /**
     * Остановка текущего воспроизводимого аудиофайла
     * Поддерживает:
     * - Мягкое экспоненциальное/линейное затухание (fade-out ramp) 80-120 мс
     *   через gainNode.gain.linearRampToValueAtTime для устранения щелчков
     * - Если до конца чанка осталось менее 150-200 мс, позволяет текущему слогу
     *   дозвучать перед затуханием
     * 
     * @param {Object} options
     *   - fadeDurationMs: длительность затухания (80-120 мс, по умолчанию 100 мс)
     *   - remainingThresholdMs: порог дозвучивания слога (150-200 мс, по умолчанию 180 мс)
     *   - allowFinishSyllable: разрешить дозвучать слогу при < remainingThresholdMs (default true)
     *   - immediate: мгновенный обрыв (default false)
     */
    stopCurrentAudioFile(options = {}) {
        const fadeMs = options.fadeDurationMs !== undefined ? options.fadeDurationMs : 100;
        const fadeSec = Math.max(0.08, Math.min(0.12, fadeMs / 1000)); // 80-120 мс
        const remainingThresholdSec = (options.remainingThresholdMs !== undefined ? options.remainingThresholdMs : 180) / 1000; // 150-200 мс
        const allowFinishSyllable = options.allowFinishSyllable !== false;
        const immediate = options.immediate || false;

        const source = this.currentAudioSource;
        const gainNode = this.currentAudioGain;
        const htmlAudio = this.currentHtmlAudio;

        this.currentAudioSource = null;
        this.currentAudioGain = null;
        this.currentHtmlAudio = null;

        if (source && this.ctx) {
            const now = this.ctx.currentTime;
            let delayBeforeFade = 0;

            if (allowFinishSyllable && this._currentAudioStartTime != null && this._currentAudioDuration) {
                const elapsed = Math.max(0, now - this._currentAudioStartTime);
                const remaining = this._currentAudioDuration - elapsed;

                // Если до конца текущего чанка осталось менее 150-200 мс,
                // позволяем текущему слогу дозвучать, прежде чем затухать
                if (remaining > 0 && remaining <= remainingThresholdSec) {
                    delayBeforeFade = Math.max(0, remaining - 0.03);
                }
            }

            try {
                if (gainNode && !immediate) {
                    const fadeStart = now + delayBeforeFade;
                    const fadeEnd = fadeStart + fadeSec;
                    const currentGain = Math.max(0.0001, (gainNode.gain && typeof gainNode.gain.value === 'number') ? gainNode.gain.value : 1.0);

                    gainNode.gain.cancelScheduledValues(now);
                    if (delayBeforeFade > 0) {
                        gainNode.gain.setValueAtTime(currentGain, now);
                        gainNode.gain.setValueAtTime(currentGain, fadeStart);
                    } else {
                        gainNode.gain.setValueAtTime(currentGain, now);
                    }

                    // Мягкое экспоненциальное/линейное затухание (fade-out ramp) 80-120 мс
                    // через gainNode.gain.linearRampToValueAtTime для устранения щелчков в наушниках
                    gainNode.gain.linearRampToValueAtTime(0.0001, fadeEnd);

                    const stopTime = fadeEnd + 0.01;
                    source.stop(stopTime);

                    setTimeout(() => {
                        try { source.disconnect(); } catch (_) {}
                        try { gainNode.disconnect(); } catch (_) {}
                    }, Math.ceil((stopTime - now + 0.05) * 1000));
                } else {
                    source.stop();
                    source.disconnect();
                }
            } catch (e) {
                try { source.stop(); } catch (_) {}
                try { source.disconnect(); } catch (_) {}
            }
        }

        if (htmlAudio) {
            try {
                if (!immediate && htmlAudio.volume > 0.05) {
                    const stepMs = 20;
                    const steps = Math.floor(fadeMs / stepMs);
                    const volStep = htmlAudio.volume / Math.max(1, steps);
                    const fadeTimer = setInterval(() => {
                        try {
                            if (htmlAudio.volume > volStep) {
                                htmlAudio.volume = Math.max(0, htmlAudio.volume - volStep);
                            } else {
                                clearInterval(fadeTimer);
                                htmlAudio.pause();
                                htmlAudio.currentTime = 0;
                            }
                        } catch (_) {
                            clearInterval(fadeTimer);
                        }
                    }, stepMs);
                } else {
                    htmlAudio.pause();
                    htmlAudio.currentTime = 0;
                }
            } catch (_) {}
        }
    }

    /**
     * Фоллбэк воспроизведения через элемент HTML5 Audio
     */
    _playAudioElementFallback(url, options = {}) {
        if (typeof Audio === 'undefined') {
            const onStart = options.onStart || (() => {});
            const onEnd = options.onEnd || (() => {});
            onStart();
            onEnd();
            return Promise.resolve(false);
        }

        return new Promise((resolve) => {
            const onStart = options.onStart || (() => {});
            const onEnd = options.onEnd || (() => {});
            const audio = new Audio(url);
            audio.volume = options.volume !== undefined ? options.volume : 1.0;
            this.currentHtmlAudio = audio;

            audio.onplay = () => onStart();
            audio.onended = () => {
                this.currentHtmlAudio = null;
                onEnd();
                resolve(true);
            };
            audio.onerror = (e) => {
                console.warn('[AudioDSP] Ошибка воспроизведения HTML5 Audio:', e);
                this.currentHtmlAudio = null;
                onEnd();
                resolve(false);
            };

            audio.play().catch((err) => {
                console.warn('[AudioDSP] Воспроизведение заблокировано браузером:', err);
                onEnd();
                resolve(false);
            });
        });
    }

    /**
     * Прерывание текущего воспроизведения речи и аудио
     */
    cancelSpeech() {
        if (this.speechSynth) {
            this.speechSynth.cancel();
        }
        this.currentUtterance = null;
        this.stopCurrentAudioFile();
    }

    /**
     * Установка общей громкости (0.0 - 1.0)
     */
    setMasterVolume(vol) {
        if (this.masterGain && this.ctx) {
            const clamped = Math.max(0, Math.min(1.0, vol));
            this.masterGain.gain.setValueAtTime(clamped, this.ctx.currentTime);
        }
    }

    /**
     * Воспроизведение последовательности предложений-чанков с поддержкой перебивания (Barge-In)
     * @param {Array<string>} chunkUrls - массив URL аудиофайлов предложений
     * @param {Object} options - опции:
     *    - initialBreathPauseMs: входная дыхательная пауза перед началом речи (по умолчанию 120 мс)
     *    - pauseBetweenMs: пауза между предложениями (по умолчанию 120 мс)
     *    - onChunkStart: callback(chunkIndex, totalChunks, url)
     *    - onChunkEnd: callback(chunkIndex, totalChunks, url)
     *    - onInterrupted: callback({ chunkIndex, totalChunks, url, reason })
     *    - onEnd: callback()
     * @deprecated Use playAudioUrl() instead. This method is kept for modular_test.js compatibility.
     */
    async playChunkSequence(chunkUrls, options = {}) {
        this.stopCurrentAudioFile({ immediate: true });
        this.cancelSpeech();

        if (!chunkUrls || chunkUrls.length === 0) {
            if (options.onEnd) options.onEnd();
            return;
        }

        this._isSequencePlaying = true;
        this._interrupted = false;
        this._interruptedCallbackFired = false;
        this._currentSequenceOptions = options;

        const initialBreathPauseMs = options.initialBreathPauseMs !== undefined
            ? options.initialBreathPauseMs
            : 120; // 120 мс по умолчанию (естественная дыхательная пауза вдоха)
        const pauseMs = options.pauseBetweenMs !== undefined ? options.pauseBetweenMs : 120; // 120 мс (дыхательная пауза)
        const total = chunkUrls.length;

        // Входная естественная микропауза вдоха перед первым аудио-чанком (120-180 мс),
        // во время которой звучит амбиенс происшествия (Zero-Vacuum)
        if (initialBreathPauseMs > 0) {
            await new Promise(resolve => {
                const timer = setTimeout(resolve, initialBreathPauseMs);
                this._initialPauseTimer = timer;
            });
            this._initialPauseTimer = null;

            if (!this._isSequencePlaying || this._interrupted) {
                if (options.onInterrupted && !this._interruptedCallbackFired) {
                    this._interruptedCallbackFired = true;
                    options.onInterrupted({
                        chunkIndex: -1,
                        totalChunks: total,
                        url: chunkUrls[0] || null,
                        reason: this._interruptionReason || 'operator_interrupted',
                        interjection: this.getInterruptionInterjection(options.state || 'grounded')
                    });
                }
                return;
            }
        }

        for (let i = 0; i < total; i++) {
            if (!this._isSequencePlaying || this._interrupted) {
                break;
            }

            const url = chunkUrls[i];
            if (options.onChunkStart) {
                options.onChunkStart(i, total, url);
            }

            // Воспроизводим отдельное предложение
            await this.playAudioFile(url, {
                applyFilter: options.applyFilter !== undefined ? options.applyFilter : true,
                withNoise: false,
                withClick: false,
                volume: options.volume || 1.0,
                cancelPrevious: false
            });

            if (!this._isSequencePlaying || this._interrupted) {
                if (options.onInterrupted && !this._interruptedCallbackFired) {
                    this._interruptedCallbackFired = true;
                    options.onInterrupted({
                        chunkIndex: i,
                        totalChunks: total,
                        url: url,
                        reason: this._interruptionReason || 'operator_interrupted',
                        interjection: this.getInterruptionInterjection(options.state || 'grounded')
                    });
                }
                return;
            }

            if (options.onChunkEnd) {
                options.onChunkEnd(i, total, url);
            }

            // Микропауза между предложениями
            if (i < total - 1 && pauseMs > 0) {
                await new Promise(r => setTimeout(r, pauseMs));
            }
        }

        this._isSequencePlaying = false;
        if (options.onEnd) {
            options.onEnd();
        }
    }

    /**
     * Получить краткое эмоциональное междометие заявителя при прерывании
     * @param {string} state - 'panic' | 'aggressive' | 'grounded' | 'cooperative'
     */
    getInterruptionInterjection(state = 'grounded') {
        switch (state) {
            case 'panic':
                return 'Что-что?!';
            case 'aggressive':
                return 'Что-что?! Говорите!..';
            case 'grounded':
                return 'Да, слушаю...';
            case 'cooperative':
                return 'Да, слушаю...';
            default:
                return 'Да, слушаю...';
        }
    }

    /**
     * Легкий маркер прерывания (Barge-In marker):
     * 1. Тихий мягкий щелчок радиостанции (PTT squelch tap, 22 мс)
     * 2. Опциональное краткое голосовое междометие заявителя («Да, слушаю...» / «Что-что?..»)
     */
    playInterruptionMarker(options = {}) {
        this.initContext();
        const state = options.state || 'grounded';
        const interjection = options.interjection || this.getInterruptionInterjection(state);

        // 1. Тихий щелчок радиостанции (PTT squelch tap, 22 мс)
        if (this.ctx && options.withClick !== false) {
            try {
                const now = this.ctx.currentTime;
                const noiseLen = 0.022;
                const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * noiseLen), this.ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < data.length; i++) {
                    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.45));
                }

                const noiseSrc = this.ctx.createBufferSource();
                noiseSrc.buffer = buffer;

                const noiseGain = this.ctx.createGain();
                noiseGain.gain.setValueAtTime(0.035, now);
                noiseGain.gain.linearRampToValueAtTime(0.0001, now + noiseLen);

                const bandpass = this.ctx.createBiquadFilter();
                bandpass.type = 'bandpass';
                bandpass.frequency.setValueAtTime(2200, now);
                bandpass.Q.setValueAtTime(2.5, now);

                noiseSrc.connect(noiseGain);
                noiseGain.connect(bandpass);
                bandpass.connect(this.masterGain);

                noiseSrc.start(now);
                noiseSrc.stop(now + noiseLen);
            } catch (e) {
                console.warn('[AudioDSP] Ошибка воспроизведения клика маркера перебивания:', e);
            }
        }

        // 2. Краткое голосовое междометие заявителя (при активном сэмплере/TTS)
        if (options.withVoice && interjection) {
            setTimeout(() => {
                this.speakApplicant(interjection, {
                    state: state,
                    panicLevel: options.panicLevel,
                    isInterjection: true
                });
            }, 50);
        }

        return interjection;
    }

    /**
     * Прервать речь собеседника (Barge-In / перебивание оператором)
     * С мягким затуханием 80-120 мс, защитой от обрыва слогов (<150-200 мс)
     * и маркером прерывания (тихий щелчок радиостанции / краткое междометие).
     */
    interruptApplicant(reason = 'operator_interrupted', options = {}) {
        if (this._initialPauseTimer) {
            clearTimeout(this._initialPauseTimer);
            this._initialPauseTimer = null;
        }
        if (!this._isSequencePlaying && !this.currentAudioSource && !this.currentUtterance) {
            return false;
        }
        console.log(`[AudioDSP] ⚡ Собеседник перебит оператором (${reason})! Мягкое затухание (Barge-In).`);
        this._interrupted = true;
        this._interruptionReason = reason;
        this._isSequencePlaying = false;

        const state = options.state || 'grounded';
        const panicLevel = options.panicLevel !== undefined ? options.panicLevel : 70;

        // 1. Мягкое затухание звука 80-120 мс с дозвучиванием слога если осталось < 150-200 мс
        this.stopCurrentAudioFile({
            fadeDurationMs: options.fadeDurationMs || 100, // 80-120 мс
            remainingThresholdMs: options.remainingThresholdMs || 180, // 150-200 мс
            allowFinishSyllable: options.allowFinishSyllable !== false
        });
        this.cancelSpeech();
        this.stopLineNoise();

        // 2. Легкий маркер прерывания (тихий щелчок радиостанции + междометие)
        let interjection = null;
        if (options.withMarker !== false) {
            interjection = this.playInterruptionMarker({
                state: state,
                panicLevel: panicLevel,
                withClick: options.withClick !== false,
                withVoice: options.withVoice === true
            });
        }

        if (this._currentSequenceOptions && this._currentSequenceOptions.onInterrupted && !this._interruptedCallbackFired) {
            this._interruptedCallbackFired = true;
            this._currentSequenceOptions.onInterrupted({
                interrupted: true,
                reason: reason,
                interjection: interjection,
                state: state
            });
        }

        // Фоновый амбиенс происшествия (пожар/депо) продолжает звучать!
        // Восстанавливаем полную громкость амбиенса после прерывания речи
        this.unduckAmbience(0.25);

        return true;
    }
}

// Экспорт для модулей и глобального браузерного объекта
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AudioDSP, AmbienceEngine };
}
if (typeof window !== 'undefined') {
    window.AudioDSP = AudioDSP;
    window.AmbienceEngine = AmbienceEngine;
    window.audioDsp = new AudioDSP();
    window.audioDSP = window.audioDsp;
}
