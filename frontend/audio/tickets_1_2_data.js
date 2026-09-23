window.AUDIO_PHRASE_BANK_TICKETS_1_2 = {
  "1": {
    "1": {
      "persona": {
        "caller_name": "Сидоров Иван Сергеевич",
        "gender": "male",
        "age_group": "mature 46-60",
        "voice_timbre": "хрипловатый баритон, резкие фразы, волнение",
        "personality": "Рабочий, очевидец возгорания мусора у депо, встревожен быстрым распространением огня к постройкам.",
        "category": "Пожары и задымления",
        "panic_level": 75,
        "has_victims": false,
        "cosyvoice_persona_prompt": "Russian male 50yo worker, stern, commanding, eyewitness at railroad depot fire, urgent",
        "hf_search_keywords": [
          "russian male",
          "mature",
          "fire emergency",
          "urgent"
        ]
      },
      "phrases_count": 36,
      "phrases": {
        "greeting_01": {
          "audio_id": "t01_q01_greeting_01",
          "intent": "greeting",
          "emotion": "panic",
          "prosody": {
            "speed": 1.25,
            "pitch": "+15%",
            "energy": "shouting",
            "breath": "gasping"
          },
          "text": "Алло! Девушка, здравствуйте! Срочно пожарных пришлите! Тут возле Киевского вокзала полыхает страшный огонь, помогите!",
          "context_note": "Первичный звонок в панике, рабочий кричит сквозь шум пламени",
          "cosyvoice_prompt": "Urgent, screaming in panic, rapid tempo, male voice"
        },
        "greeting_02": {
          "audio_id": "t01_q01_greeting_02",
          "intent": "greeting",
          "emotion": "panic",
          "prosody": {
            "speed": 1.2,
            "pitch": "+10%",
            "energy": "loud",
            "breath": "heavy"
          },
          "text": "Оператор, примите вызов скорее! Около Киевского вокзала открытый огонь, дым черный валит столбом! Тушить надо немедленно!",
          "context_note": "Взволнованный очевидец, кричит о распространении пожара",
          "cosyvoice_prompt": "Agitated eyewitness, high volume, stressed male"
        },
        "greeting_03": {
          "audio_id": "t01_q01_greeting_03",
          "intent": "greeting",
          "emotion": "terror",
          "prosody": {
            "speed": 1.25,
            "pitch": "+15%",
            "energy": "screaming",
            "breath": "trembling"
          },
          "text": "112?! Срочно расчет сюда! В районе Киевского вокзала полыхает пламя, искры летят во все стороны, помогите!",
          "context_note": "Острый стресс, крик о помощи у железнодорожных путей",
          "cosyvoice_prompt": "Terror, rapid shouting, urgent male"
        },
        "address_01": {
          "audio_id": "t01_q01_address_01",
          "intent": "address",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.05,
            "pitch": "+5%",
            "energy": "firm",
            "breath": "normal"
          },
          "text": "Записывайте адрес: станция Москва-Пассажирская Киевская, территория депо. Длинное здание, строение два, около опорного пункта полиции.",
          "context_note": "Четко диктует адрес и ориентиры депо",
          "cosyvoice_prompt": "Direct dictation of address, assertive, clear Russian speech"
        },
        "address_02": {
          "audio_id": "t01_q01_address_02",
          "intent": "address",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.1,
            "pitch": "+5%",
            "energy": "insistent",
            "breath": "normal"
          },
          "text": "Ориентир — депо Киевского вокзала, МЖД Киевская, один километр два, строение два. Ворота открыты со стороны путей.",
          "context_note": "Указывает точный заезд для пожарной машины",
          "cosyvoice_prompt": "Insistent, explaining location with railroad landmarks"
        },
        "address_03": {
          "audio_id": "t01_q01_address_03",
          "intent": "address",
          "emotion": "aggressive",
          "prosody": {
            "speed": 1.2,
            "pitch": "+15%",
            "energy": "shouting",
            "breath": "irritated"
          },
          "text": "Станция Киевская-Пассажирская, дом два, строение два. Длинное кирпичное здание прямо возле участкового пункта полиции.",
          "context_note": "Повторение адреса без лишних фактов",
          "cosyvoice_prompt": "Frustrated, shouting address second time, annoyed"
        },
        "address_04": {
          "audio_id": "t01_q01_address_04",
          "intent": "address",
          "emotion": "panic",
          "prosody": {
            "speed": 1.15,
            "pitch": "+10%",
            "energy": "urgent",
            "breath": "rapid"
          },
          "text": "Возле депо Киевского вокзала, МЖД Киевская, строение два. Я у въезда стою, буду встречать пожарную машину.",
          "context_note": "Обещает встретить расчет у въезда",
          "cosyvoice_prompt": "Navigating driver, urgent directions, breathless"
        },
        "victims_01": {
          "audio_id": "t01_q01_victims_01",
          "intent": "victims",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.05,
            "pitch": "0%",
            "energy": "firm",
            "breath": "sighing"
          },
          "text": "Пострадавших нет, слава богу! Людей рядом нет, все вовремя отошли на безопасное расстояние.",
          "context_note": "Констатация отсутствия жертв",
          "cosyvoice_prompt": "Relieved about no casualties"
        },
        "victims_02": {
          "audio_id": "t01_q01_victims_02",
          "intent": "victims",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.05,
            "pitch": "+5%",
            "energy": "clear",
            "breath": "normal"
          },
          "text": "Раненых нет, никто не пострадал. Скорая помощь не требуется, только пожарные.",
          "context_note": "Подтверждает безопасность людей",
          "cosyvoice_prompt": "Confirming zero victims, no medical needed"
        },
        "victims_03": {
          "audio_id": "t01_q01_victims_03",
          "intent": "victims",
          "emotion": "panic",
          "prosody": {
            "speed": 1.15,
            "pitch": "+10%",
            "energy": "insistent",
            "breath": "rapid"
          },
          "text": "Людей в опасной зоне нет, никто не заблокирован. Медицинская помощь никому не нужна.",
          "context_note": "Подтверждение отсутствия заблокированных людей",
          "cosyvoice_prompt": "Confirming no people trapped"
        },
        "victims_04": {
          "audio_id": "t01_q01_victims_04",
          "intent": "victims",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.0,
            "pitch": "0%",
            "energy": "firm",
            "breath": "calm"
          },
          "text": "Травм ни у кого нет, все целы. Опасности для жизни людей на данный момент нет.",
          "context_note": "Отказ от скорой помощи, отсутствие травм",
          "cosyvoice_prompt": "Objective refusal of medical crew"
        },
        "details_01": {
          "audio_id": "t01_q01_details_01",
          "intent": "details",
          "emotion": "panic",
          "prosody": {
            "speed": 1.15,
            "pitch": "+10%",
            "energy": "loud",
            "breath": "heavy"
          },
          "text": "Мусорный контейнер полыхает открытым пламенем! Огонь уже метра на четыре вверх поднимается!",
          "context_note": "Описание источника пламени и высоты огня",
          "cosyvoice_prompt": "Narrating fire details, descriptive, tense atmosphere"
        },
        "details_02": {
          "audio_id": "t01_q01_details_02",
          "intent": "details",
          "emotion": "panic",
          "prosody": {
            "speed": 1.2,
            "pitch": "+10%",
            "energy": "gasping",
            "breath": "rapid"
          },
          "text": "Черный едкий дым столбом валит, ветром прямо на железнодорожные пути сносит.",
          "context_note": "Описание плотности и направления дыма",
          "cosyvoice_prompt": "Rapid worsening of smoke, breathless narration"
        },
        "details_03": {
          "audio_id": "t01_q01_details_03",
          "intent": "details",
          "emotion": "fear",
          "prosody": {
            "speed": 1.15,
            "pitch": "+10%",
            "energy": "firm",
            "breath": "tense"
          },
          "text": "Жар стоит очень сильный, ближе двадцати метров подойти невозможно.",
          "context_note": "Описание нестерпимого жара",
          "cosyvoice_prompt": "Warning about intense heat"
        },
        "details_04": {
          "audio_id": "t01_q01_details_04",
          "intent": "details",
          "emotion": "panic",
          "prosody": {
            "speed": 1.15,
            "pitch": "+10%",
            "energy": "shouting",
            "breath": "urgent"
          },
          "text": "Искры во все стороны летят, на соседние сухие ящики и деревянную обшивку.",
          "context_note": "Разлет искр в сторону горючих материалов",
          "cosyvoice_prompt": "Explaining spark spread hazard"
        },
        "details_05": {
          "audio_id": "t01_q01_details_05",
          "intent": "details",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.1,
            "pitch": "+5%",
            "energy": "matter-of-fact",
            "breath": "steady"
          },
          "text": "Пытались сбить огнетушителем — бесполезно, тут только брандспойтом заливать водой.",
          "context_note": "Неэффективность первичных средств пожаротушения",
          "cosyvoice_prompt": "Describing failed fire extinguisher attempt"
        },
        "caller_id_01": {
          "audio_id": "t01_q01_caller_id_01",
          "intent": "caller_id",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.0,
            "pitch": "0%",
            "energy": "clear",
            "breath": "normal"
          },
          "text": "Меня зовут Сидоров Иван Сергеевич. Телефон мой: восемь, девятьсот шестнадцать, сто двадцать шесть, тридцать четыре, семьдесят один.",
          "context_note": "Четкая диктовка ФИО и номера телефона",
          "cosyvoice_prompt": "Clear self-identification, stating name and phone number"
        },
        "caller_id_02": {
          "audio_id": "t01_q01_caller_id_02",
          "intent": "caller_id",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.05,
            "pitch": "0%",
            "energy": "firm",
            "breath": "normal"
          },
          "text": "Заявитель — Сидоров Иван Сергеевич. Номер вот этот, с которого звоню: девятьсот шестнадцать, сто двадцать шесть, тридцать четыре, семьдесят один.",
          "context_note": "Подтверждение номера телефона",
          "cosyvoice_prompt": "Stating identity and phone number"
        },
        "caller_id_03": {
          "audio_id": "t01_q01_caller_id_03",
          "intent": "caller_id",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.05,
            "pitch": "+5%",
            "energy": "insistent",
            "breath": "hurried"
          },
          "text": "Сидоров Иван Сергеевич я, рабочий. Мой сотовый — восемь, девятьсот шестнадцать, сто двадцать шесть, тридцать четыре, семьдесят один.",
          "context_note": "Подтверждение контакта",
          "cosyvoice_prompt": "Offering contact phone, male worker"
        },
        "cliche_rage_01": {
          "audio_id": "t01_q01_cliche_rage_01",
          "intent": "cliche_rage",
          "emotion": "rage",
          "prosody": {
            "speed": 1.25,
            "pitch": "+20%",
            "energy": "screaming",
            "breath": "furious"
          },
          "text": "Вы издеваетесь надо мной?! Не тратьте время на пустые вопросы, отправляйте помощь!",
          "context_note": "Универсальный естественный гнев на бюрократический опрос",
          "cosyvoice_prompt": "Outrage, screaming at bureaucratic operator, furious indignation"
        },
        "cliche_rage_02": {
          "audio_id": "t01_q01_cliche_rage_02",
          "intent": "cliche_rage",
          "emotion": "rage",
          "prosody": {
            "speed": 1.25,
            "pitch": "+18%",
            "energy": "screaming",
            "breath": "furious"
          },
          "text": "Да вы меня вообще слышите?! Что вы ерунду какую-то спрашиваете, когда тут такое творится?!",
          "context_note": "Универсальный протест против нелепых вопросов",
          "cosyvoice_prompt": "Furious indignation at absurd question, shouting"
        },
        "cliche_rage_03": {
          "audio_id": "t01_q01_cliche_rage_03",
          "intent": "cliche_rage",
          "emotion": "rage",
          "prosody": {
            "speed": 1.25,
            "pitch": "+15%",
            "energy": "screaming",
            "breath": "furious"
          },
          "text": "Девушка, милая, хватит по инструкции опрашивать, людей спасать надо!",
          "context_note": "Универсальный протест против зачитывания инструкций",
          "cosyvoice_prompt": "Screaming at robotic protocol phrases"
        },
        "cliche_rage_04": {
          "audio_id": "t01_q01_cliche_rage_04",
          "intent": "cliche_rage",
          "emotion": "rage",
          "prosody": {
            "speed": 1.2,
            "pitch": "+15%",
            "energy": "screaming",
            "breath": "furious"
          },
          "text": "Вы в своем уме?! Я вам про беду говорю, а вы формализмом занимаетесь! Машина едет или нет?!",
          "context_note": "Требование прекратить формализм и подтвердить выезд",
          "cosyvoice_prompt": "Demanding confirmation of dispatch instead of regulations"
        },
        "deescalation_01": {
          "audio_id": "t01_q01_deescalation_01",
          "intent": "deescalation",
          "emotion": "grounded",
          "prosody": {
            "speed": 0.95,
            "pitch": "-5%",
            "energy": "relieved",
            "breath": "deep sigh"
          },
          "text": "Фух... Да, хорошо, извините... Я на связи, держусь, что еще сказать?",
          "context_note": "Вздох облегчения, заявитель берет себя в руки",
          "cosyvoice_prompt": "Deep sigh of relief, apologizing for temper, cooperating"
        },
        "deescalation_02": {
          "audio_id": "t01_q01_deescalation_02",
          "intent": "deescalation",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.0,
            "pitch": "0%",
            "energy": "composed",
            "breath": "even"
          },
          "text": "Слава богу, что вызов передали... Дышу ровно, стою на безопасном расстоянии, слушаю вас.",
          "context_note": "Успокоение после подтверждения вызова",
          "cosyvoice_prompt": "Calmed down, confirming safety distance"
        },
        "deescalation_03": {
          "audio_id": "t01_q01_deescalation_03",
          "intent": "deescalation",
          "emotion": "cooperative",
          "prosody": {
            "speed": 1.0,
            "pitch": "0%",
            "energy": "attentive",
            "breath": "steady"
          },
          "text": "Да, я с вами на линии, не отключаюсь. Спрашивайте, я на всё спокойно отвечу.",
          "context_note": "Готовность спокойно отвечать на вопросы",
          "cosyvoice_prompt": "Ready to assist, clear and steady, trusting operator"
        },
        "deescalation_04": {
          "audio_id": "t01_q01_deescalation_04",
          "intent": "deescalation",
          "emotion": "cooperative",
          "prosody": {
            "speed": 0.95,
            "pitch": "-5%",
            "energy": "grateful",
            "breath": "calm"
          },
          "text": "Понял вас, панику отставить. Встречаю расчет у шлагбаума, готов отвечать.",
          "context_note": "Принятие инструкций оператора",
          "cosyvoice_prompt": "Composed, promising to meet fire truck at barrier"
        },
        "urgency_and_silence_01": {
          "audio_id": "t01_q01_urgency_silence_01",
          "intent": "urgency_silence",
          "emotion": "aggressive",
          "prosody": {
            "speed": 1.25,
            "pitch": "+15%",
            "energy": "shouting",
            "breath": "heavy"
          },
          "text": "Алло! Девушка! Вы меня слышите?! Почему тишина в трубке, вы отправили машины?!",
          "context_note": "Окрик при затянувшейся паузе оператора",
          "cosyvoice_prompt": "Shouting at silent operator, furious at call delay"
        },
        "urgency_and_silence_02": {
          "audio_id": "t01_q01_urgency_silence_02",
          "intent": "urgency_silence",
          "emotion": "panic",
          "prosody": {
            "speed": 1.2,
            "pitch": "+10%",
            "energy": "insistent",
            "breath": "tense"
          },
          "text": "Оператор! Не молчите, пожалуйста! Скажите хоть слово, вы передали вызов бригаде?!",
          "context_note": "Запрос подтверждения передачи вызова",
          "cosyvoice_prompt": "Frantic check if call was dispatched, demanding status"
        },
        "urgency_and_silence_03": {
          "audio_id": "t01_q01_urgency_silence_03",
          "intent": "urgency_silence",
          "emotion": "fear",
          "prosody": {
            "speed": 1.15,
            "pitch": "+10%",
            "energy": "pleading",
            "breath": "gasping"
          },
          "text": "Не молчите, ради бога! Тут обстановка накаляется, страшно же! Помощь уже выехала?!",
          "context_note": "Страх перед тишиной в трубке",
          "cosyvoice_prompt": "Fear of silence, pleading operator not to stay quiet"
        },
        "deadlock_guard_01": {
          "audio_id": "t01_q01_deadlock_01",
          "intent": "deadlock_guard",
          "emotion": "aggressive",
          "prosody": {
            "speed": 1.2,
            "pitch": "+15%",
            "energy": "loud",
            "breath": "irritated"
          },
          "text": "Да какая разница?! Вы зачем ерунду какую-то спрашиваете, когда тут счет на секунды идет?!",
          "context_note": "Универсальное пресечение нерелевантного вопроса",
          "cosyvoice_prompt": "Impatient, shutting down useless question, demanding action"
        },
        "deadlock_guard_02": {
          "audio_id": "t01_q01_deadlock_02",
          "intent": "deadlock_guard",
          "emotion": "panic",
          "prosody": {
            "speed": 1.15,
            "pitch": "+10%",
            "energy": "exasperated",
            "breath": "short"
          },
          "text": "Откуда мне это знать?! Я обычный рабочий, а не эксперт! Отправляйте бригаду скорее!",
          "context_note": "Универсальный отказ отвечать на технические мелочи",
          "cosyvoice_prompt": "Exasperated, explains lack of technical knowledge, angry"
        },
        "deadlock_guard_03": {
          "audio_id": "t01_q01_deadlock_03",
          "intent": "deadlock_guard",
          "emotion": "aggressive",
          "prosody": {
            "speed": 1.25,
            "pitch": "+15%",
            "energy": "demanding",
            "breath": "panting"
          },
          "text": "Послушайте... Хватит тратить драгоценное время на пустые расспросы! Машина в пути или нет?!",
          "context_note": "Универсальное требование прекратить расспросы",
          "cosyvoice_prompt": "Demanding immediate dispatch, rejecting irrelevant questions"
        },
        "closing_01": {
          "audio_id": "t01_q01_closing_01",
          "intent": "closing_instructions",
          "emotion": "cooperative",
          "prosody": {
            "speed": 1.0,
            "pitch": "0%",
            "energy": "firm",
            "breath": "steady"
          },
          "text": "Всё, понял вас. Стою на месте, встречаю пожарный расчет, спасибо!",
          "context_note": "Подтверждение встречи экипажа",
          "cosyvoice_prompt": "Clear readiness to guide crews, calm end of call"
        },
        "closing_02": {
          "audio_id": "t01_q01_closing_02",
          "intent": "closing_instructions",
          "emotion": "cooperative",
          "prosody": {
            "speed": 0.95,
            "pitch": "0%",
            "energy": "grateful",
            "breath": "calm"
          },
          "text": "Спасибо большое! Номер не занимаю, жду звонка от пожарных. До свидания!",
          "context_note": "Благодарность оператору за помощь",
          "cosyvoice_prompt": "Grateful closing, keeping phone line open for rescue dispatch"
        },
        "closing_03": {
          "audio_id": "t01_q01_closing_03",
          "intent": "closing_instructions",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.05,
            "pitch": "+5%",
            "energy": "watchful",
            "breath": "steady"
          },
          "text": "Понял вас, остаюсь на связи и контролирую обстановку издалека. Спасибо!",
          "context_note": "Контроль обстановки до прибытия сил",
          "cosyvoice_prompt": "Watchful, staying at scene safely"
        }
      }
    },
    "2": {
      "persona": {
        "caller_name": "Иванов Петр Иванович",
        "gender": "male",
        "age_group": "adult 26-45",
        "voice_timbre": "напряженный баритон, прерывистый голос, шок",
        "personality": "Прохожий, стал свидетелем жестокой массовой драки у посольства, сильно испуган насилием и кровью.",
        "category": "Нарушение правопорядка",
        "panic_level": 80,
        "has_victims": true,
        "cosyvoice_persona_prompt": "Russian male 35yo, shocked pedestrian, breathless, witnessing violent mass brawl",
        "hf_search_keywords": [
          "russian male",
          "adult",
          "brawl emergency",
          "shouting"
        ]
      },
      "phrases_count": 36,
      "phrases": {
        "greeting_01": {
          "audio_id": "t01_q02_greeting_01",
          "intent": "greeting",
          "emotion": "panic",
          "prosody": {
            "speed": 1.25,
            "pitch": "+15%",
            "energy": "shouting",
            "breath": "gasping"
          },
          "text": "Полицию сюда, скорее! Тут побоище настоящее у метро, толпа стенка на стенку сцепилась, у кого-то нож, железяками друг друга молотят!",
          "context_note": "Крик ужаса при виде массового побоища",
          "cosyvoice_prompt": "Urgent, screaming in panic, rapid tempo, male voice"
        },
        "greeting_02": {
          "audio_id": "t01_q02_greeting_02",
          "intent": "greeting",
          "emotion": "panic",
          "prosody": {
            "speed": 1.25,
            "pitch": "+15%",
            "energy": "loud",
            "breath": "heavy"
          },
          "text": "Алло, 112?! Срочно полицию и скорую помощь! Жестокая драка в центре, людей забивают, спасите!",
          "context_note": "Требование экстренного наряда полиции и медиков",
          "cosyvoice_prompt": "Agitated eyewitness, high volume, stressed male"
        },
        "greeting_03": {
          "audio_id": "t01_q02_greeting_03",
          "intent": "greeting",
          "emotion": "terror",
          "prosody": {
            "speed": 1.3,
            "pitch": "+20%",
            "energy": "screaming",
            "breath": "trembling"
          },
          "text": "Девушка, помогите! Тут кошмар творится, массовая драка, крики, кровь кругом! Срочно наряды сюда!",
          "context_note": "Шок очевидца от жестокости драки",
          "cosyvoice_prompt": "Terror, rapid shouting, urgent male"
        },
        "address_01": {
          "audio_id": "t01_q02_address_01",
          "intent": "address",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.1,
            "pitch": "+5%",
            "energy": "firm",
            "breath": "normal"
          },
          "text": "Леонтьевский переулок, дом шестнадцать, строение один. Прямо на тротуаре возле посольства Азербайджана.",
          "context_note": "Точный адрес драки возле посольства",
          "cosyvoice_prompt": "Direct dictation of address, assertive, clear Russian speech"
        },
        "address_02": {
          "audio_id": "t01_q02_address_02",
          "intent": "address",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.1,
            "pitch": "+5%",
            "energy": "insistent",
            "breath": "normal"
          },
          "text": "Это Леонтьевский переулок, дом шестнадцать. Рядом со сквером и азербайджанским посольством.",
          "context_note": "Ориентир сквера и дипломатической миссии",
          "cosyvoice_prompt": "Insistent, explaining location with landmarks"
        },
        "address_03": {
          "audio_id": "t01_q02_address_03",
          "intent": "address",
          "emotion": "aggressive",
          "prosody": {
            "speed": 1.25,
            "pitch": "+15%",
            "energy": "shouting",
            "breath": "irritated"
          },
          "text": "Да Леонтьевский переулок это, дом шестнадцать, строение один. На пешеходной зоне, проезд по переулку открыт.",
          "context_note": "Повторение адреса без лишних фактов",
          "cosyvoice_prompt": "Frustrated, shouting address second time, annoyed"
        },
        "address_04": {
          "audio_id": "t01_q02_address_04",
          "intent": "address",
          "emotion": "panic",
          "prosody": {
            "speed": 1.15,
            "pitch": "+10%",
            "energy": "urgent",
            "breath": "rapid"
          },
          "text": "Около посольства Азербайджана, дом шестнадцать, строение один по Леонтьевскому. Я за машиной стою, наблюдаю.",
          "context_note": "Указание своего укрытия и места драки",
          "cosyvoice_prompt": "Navigating driver, urgent directions, breathless"
        },
        "victims_01": {
          "audio_id": "t01_q02_victims_01",
          "intent": "victims",
          "emotion": "terror",
          "prosody": {
            "speed": 1.2,
            "pitch": "+20%",
            "energy": "screaming",
            "breath": "sobbing"
          },
          "text": "Пять человек на асфальте без сознания лежат, в крови все! Срочно несколько бригад скорой нужно!",
          "context_note": "Сообщение о пяти тяжелораненых",
          "cosyvoice_prompt": "Desperate cry for ambulance, crying, terror"
        },
        "victims_02": {
          "audio_id": "t01_q02_victims_02",
          "intent": "victims",
          "emotion": "panic",
          "prosody": {
            "speed": 1.15,
            "pitch": "+15%",
            "energy": "loud",
            "breath": "shaking"
          },
          "text": "Тяжелые раненые есть! Одному голову пробили железной трубой, без памяти лежит, кровь хлещет!",
          "context_note": "Ужас от вида тяжелой черепно-мозговой травмы",
          "cosyvoice_prompt": "Graphic distress, seeing injured victim, trembling"
        },
        "victims_03": {
          "audio_id": "t01_q02_victims_03",
          "intent": "victims",
          "emotion": "panic",
          "prosody": {
            "speed": 1.15,
            "pitch": "+10%",
            "energy": "shaking",
            "breath": "heavy"
          },
          "text": "Да, пять пострадавших точно! Встать не могут, переломы открытые, хрипят! Реанимацию шлите немедленно!",
          "context_note": "Описание открытых переломов и тяжести травм",
          "cosyvoice_prompt": "Afraid to touch injured victim, anxious, emotional"
        },
        "victims_04": {
          "audio_id": "t01_q02_victims_04",
          "intent": "victims",
          "emotion": "fear",
          "prosody": {
            "speed": 1.2,
            "pitch": "+15%",
            "energy": "pleading",
            "breath": "choking"
          },
          "text": "Люди кровью истекают на тротуаре, травмы очень тяжелые! Скорая срочно нужна, счет на минуты идет!",
          "context_note": "Срочная необходимость скорой помощи",
          "cosyvoice_prompt": "Pleading for rescue crews and multiple ambulances"
        },
        "details_01": {
          "audio_id": "t01_q02_details_01",
          "intent": "details",
          "emotion": "panic",
          "prosody": {
            "speed": 1.2,
            "pitch": "+10%",
            "energy": "loud",
            "breath": "heavy"
          },
          "text": "Толпа человек пятнадцать сошлась, достали строительные прутья и арматуру, бьют со всей дури!",
          "context_note": "Описание начала драки и оружия",
          "cosyvoice_prompt": "Narrating brawl details, descriptive, tense atmosphere"
        },
        "details_02": {
          "audio_id": "t01_q02_details_02",
          "intent": "details",
          "emotion": "panic",
          "prosody": {
            "speed": 1.2,
            "pitch": "+15%",
            "energy": "gasping",
            "breath": "rapid"
          },
          "text": "Крики дикие, мат на всю улицу, витрину расколотили рядом, прохожие в ужасе разбегаются к метро!",
          "context_note": "Паника прохожих и разбитая витрина",
          "cosyvoice_prompt": "Rapid worsening of situation, breathless narration, danger"
        },
        "details_03": {
          "audio_id": "t01_q02_details_03",
          "intent": "details",
          "emotion": "fear",
          "prosody": {
            "speed": 1.2,
            "pitch": "+15%",
            "energy": "shouting",
            "breath": "tense"
          },
          "text": "Одного повалили на землю и впятером ногами месят, добивают со всей силы!",
          "context_note": "Смертельная опасность добивания лежачего",
          "cosyvoice_prompt": "Terrified about victim being stomped to death"
        },
        "details_04": {
          "audio_id": "t01_q02_details_04",
          "intent": "details",
          "emotion": "panic",
          "prosody": {
            "speed": 1.15,
            "pitch": "+10%",
            "energy": "shouting",
            "breath": "urgent"
          },
          "text": "У них с собой заготовки железные были, куски труб и нож складной, полоснули парня!",
          "context_note": "Описание примененного оружия",
          "cosyvoice_prompt": "Describing weapons, metal rods and pipes"
        },
        "details_05": {
          "audio_id": "t01_q02_details_05",
          "intent": "details",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.1,
            "pitch": "+5%",
            "energy": "matter-of-fact",
            "breath": "steady"
          },
          "text": "Часть нападавших с ножом побежала в сторону метро Тверская, а остальные продолжают драку!",
          "context_note": "Направление бегства части нападавших",
          "cosyvoice_prompt": "Directing police intercept toward Tverskaya"
        },
        "caller_id_01": {
          "audio_id": "t01_q02_caller_id_01",
          "intent": "caller_id",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.0,
            "pitch": "0%",
            "energy": "clear",
            "breath": "normal"
          },
          "text": "Иванов Петр Иванович я, случайный прохожий. Телефон: восемь, девятьсот шестнадцать, сто двадцать три, девяносто восемь, семьдесят восемь.",
          "context_note": "Диктовка своих данных свидетеля",
          "cosyvoice_prompt": "Clear self-identification, stating name and phone number"
        },
        "caller_id_02": {
          "audio_id": "t01_q02_caller_id_02",
          "intent": "caller_id",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.05,
            "pitch": "0%",
            "energy": "firm",
            "breath": "normal"
          },
          "text": "Запишите: Иванов Петр Иванович. Номер — девятьсот шестнадцать, сто двадцать три, девяносто восемь, семьдесят восемь.",
          "context_note": "Подтверждение контакта",
          "cosyvoice_prompt": "Stating identity, confirming staying at scene"
        },
        "caller_id_03": {
          "audio_id": "t01_q02_caller_id_03",
          "intent": "caller_id",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.05,
            "pitch": "+5%",
            "energy": "insistent",
            "breath": "hurried"
          },
          "text": "Иванов Петр Иванович. Мой сотовый — восемь, девятьсот шестнадцать, сто двадцать три, девяносто восемь, семьдесят восемь.",
          "context_note": "Готовность к звонку оперативников",
          "cosyvoice_prompt": "Offering contact phone, bystander"
        },
        "cliche_rage_01": {
          "audio_id": "t01_q02_cliche_rage_01",
          "intent": "cliche_rage",
          "emotion": "rage",
          "prosody": {
            "speed": 1.25,
            "pitch": "+20%",
            "energy": "screaming",
            "breath": "furious"
          },
          "text": "Вы издеваетесь надо мной?! Не тратьте время на пустые вопросы, отправляйте помощь!",
          "context_note": "Универсальный гнев на канцелярский опрос во время бойни",
          "cosyvoice_prompt": "Outrage, screaming at bureaucratic operator, furious indignation"
        },
        "cliche_rage_02": {
          "audio_id": "t01_q02_cliche_rage_02",
          "intent": "cliche_rage",
          "emotion": "rage",
          "prosody": {
            "speed": 1.25,
            "pitch": "+20%",
            "energy": "screaming",
            "breath": "furious"
          },
          "text": "Да вы меня вообще слышите?! Что вы ерунду какую-то спрашиваете, когда тут такое творится?!",
          "context_note": "Универсальный крик возмущения на бессмысленный вопрос",
          "cosyvoice_prompt": "Furious at absurd protocol questions"
        },
        "cliche_rage_03": {
          "audio_id": "t01_q02_cliche_rage_03",
          "intent": "cliche_rage",
          "emotion": "rage",
          "prosody": {
            "speed": 1.25,
            "pitch": "+15%",
            "energy": "screaming",
            "breath": "furious"
          },
          "text": "Девушка, милая, хватит по инструкции опрашивать, людей спасать надо!",
          "context_note": "Универсальный протест против бюрократического регламента",
          "cosyvoice_prompt": "Screaming at robotic protocol phrases"
        },
        "cliche_rage_04": {
          "audio_id": "t01_q02_cliche_rage_04",
          "intent": "cliche_rage",
          "emotion": "rage",
          "prosody": {
            "speed": 1.2,
            "pitch": "+15%",
            "energy": "screaming",
            "breath": "furious"
          },
          "text": "Вы в своем уме?! Я вам про беду говорю, а вы формализмом занимаетесь! Наряд едет или нет?!",
          "context_note": "Требование ответа, отправлен ли наряд полиции",
          "cosyvoice_prompt": "Demanding immediate dispatch instead of protocol"
        },
        "deescalation_01": {
          "audio_id": "t01_q02_deescalation_01",
          "intent": "deescalation",
          "emotion": "grounded",
          "prosody": {
            "speed": 0.95,
            "pitch": "-5%",
            "energy": "relieved",
            "breath": "deep sigh"
          },
          "text": "Фух... Да, хорошо, извините... Я на связи, держусь, что еще сказать?",
          "context_note": "Вздох облегчения, заявитель приходит в себя",
          "cosyvoice_prompt": "Deep sigh of relief, shaking hands, regaining composure"
        },
        "deescalation_02": {
          "audio_id": "t01_q02_deescalation_02",
          "intent": "deescalation",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.0,
            "pitch": "0%",
            "energy": "composed",
            "breath": "even"
          },
          "text": "Слава богу, что полиция выехала... Я за машиной присел, не высовываюсь, слушаю вас.",
          "context_note": "Соблюдение мер скрытности и личной безопасности",
          "cosyvoice_prompt": "Whispering behind cover, taking precautions"
        },
        "deescalation_03": {
          "audio_id": "t01_q02_deescalation_03",
          "intent": "deescalation",
          "emotion": "cooperative",
          "prosody": {
            "speed": 1.0,
            "pitch": "0%",
            "energy": "attentive",
            "breath": "steady"
          },
          "text": "Да, я с вами, не отключаюсь. Голос понизил, чтобы меня не заметили, готов отвечать.",
          "context_note": "Тихий диалог на линии",
          "cosyvoice_prompt": "Cautious whisper, cooperating on the line"
        },
        "deescalation_04": {
          "audio_id": "t01_q02_deescalation_04",
          "intent": "deescalation",
          "emotion": "cooperative",
          "prosody": {
            "speed": 0.95,
            "pitch": "-5%",
            "energy": "grateful",
            "breath": "calm"
          },
          "text": "Понял вас, сам не вмешиваюсь, нахожусь в укрытии. Спокойно жду наряд, спрашивайте.",
          "context_note": "Отказ от самостоятельного вмешательства в драку",
          "cosyvoice_prompt": "Promising not to intervene, observing from safety"
        },
        "urgency_and_silence_01": {
          "audio_id": "t01_q02_urgency_silence_01",
          "intent": "urgency_silence",
          "emotion": "aggressive",
          "prosody": {
            "speed": 1.25,
            "pitch": "+15%",
            "energy": "shouting",
            "breath": "heavy"
          },
          "text": "Алло! Девушка! Вы там?! Почему вы молчите, когда тут людей убивают?!",
          "context_note": "Панический крик из-за паузы",
          "cosyvoice_prompt": "Shouting at silent operator, frantic at delay"
        },
        "urgency_and_silence_02": {
          "audio_id": "t01_q02_urgency_silence_02",
          "intent": "urgency_silence",
          "emotion": "panic",
          "prosody": {
            "speed": 1.2,
            "pitch": "+10%",
            "energy": "insistent",
            "breath": "tense"
          },
          "text": "Оператор, не молчите в трубку! Скажите, наряды полиции уже близко?!",
          "context_note": "Ожидание сирен на фоне драки",
          "cosyvoice_prompt": "Listening for sirens, begging operator to talk"
        },
        "urgency_and_silence_03": {
          "audio_id": "t01_q02_urgency_silence_03",
          "intent": "urgency_silence",
          "emotion": "fear",
          "prosody": {
            "speed": 1.15,
            "pitch": "+10%",
            "energy": "pleading",
            "breath": "gasping"
          },
          "text": "Ради бога, ответьте! Сирены слышно уже или нет?! Почему вы замолчали?!",
          "context_note": "Ужас от тишины в эфире",
          "cosyvoice_prompt": "Terrified whisper, pleading for response"
        },
        "deadlock_guard_01": {
          "audio_id": "t01_q02_deadlock_01",
          "intent": "deadlock_guard",
          "emotion": "aggressive",
          "prosody": {
            "speed": 1.2,
            "pitch": "+15%",
            "energy": "loud",
            "breath": "irritated"
          },
          "text": "Да какая разница?! Вы зачем ерунду какую-то спрашиваете, когда люди умирают на асфальте?!",
          "context_note": "Отказ отвечать на неуместные вопросы",
          "cosyvoice_prompt": "Impatient, rejecting irrelevant questions"
        },
        "deadlock_guard_02": {
          "audio_id": "t01_q02_deadlock_02",
          "intent": "deadlock_guard",
          "emotion": "panic",
          "prosody": {
            "speed": 1.15,
            "pitch": "+10%",
            "energy": "exasperated",
            "breath": "short"
          },
          "text": "Откуда мне это знать?! Я обычный прохожий, а не следователь! Отправляйте наряд немедленно!",
          "context_note": "Очевидец не знает причин стычки",
          "cosyvoice_prompt": "Exasperated pedestrian, demanding help not interrogation"
        },
        "deadlock_guard_03": {
          "audio_id": "t01_q02_deadlock_03",
          "intent": "deadlock_guard",
          "emotion": "aggressive",
          "prosody": {
            "speed": 1.25,
            "pitch": "+15%",
            "energy": "demanding",
            "breath": "panting"
          },
          "text": "Послушайте... Хватит задавать пустые вопросы, людям реанимация нужна! Экипажи в пути или нет?!",
          "context_note": "Категорическое требование экстренной помощи",
          "cosyvoice_prompt": "Demanding immediate dispatch, angry"
        },
        "closing_01": {
          "audio_id": "t01_q02_closing_01",
          "intent": "closing_instructions",
          "emotion": "cooperative",
          "prosody": {
            "speed": 1.0,
            "pitch": "0%",
            "energy": "firm",
            "breath": "steady"
          },
          "text": "Понял вас, сижу тихо в укрытии, как увижу полицию — махну рукой. Спасибо!",
          "context_note": "Готовность подать знак экипажу",
          "cosyvoice_prompt": "Clear readiness to guide crews, calm end of call"
        },
        "closing_02": {
          "audio_id": "t01_q02_closing_02",
          "intent": "closing_instructions",
          "emotion": "cooperative",
          "prosody": {
            "speed": 0.95,
            "pitch": "0%",
            "energy": "grateful",
            "breath": "calm"
          },
          "text": "Спасибо большое! Телефон держу свободным, жду прибытия наряда и медиков.",
          "context_note": "Держит телефон свободным",
          "cosyvoice_prompt": "Grateful closing, keeping phone line open"
        },
        "closing_03": {
          "audio_id": "t01_q02_closing_03",
          "intent": "closing_instructions",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.05,
            "pitch": "+5%",
            "energy": "watchful",
            "breath": "steady"
          },
          "text": "Всё понял, остаюсь на безопасном расстоянии, наблюдаю до приезда полиции. До свидания!",
          "context_note": "Наблюдение из безопасности",
          "cosyvoice_prompt": "Watchful wait until police arrival"
        }
      }
    },
    "3": {
      "persona": {
        "caller_name": "Смирнова (мама Ильи)",
        "gender": "female",
        "age_group": "adult 26-45",
        "voice_timbre": "дрожащий женский голос, всхлипы, на грани рыданий",
        "personality": "Испуганная мать, ребенок сильно травмирован при падении с велосипеда, молит о скорой помощи.",
        "category": "Оказание медицинской скорой и неотложной помощи",
        "panic_level": 85,
        "has_victims": true,
        "cosyvoice_persona_prompt": "Russian female 36yo mother, trembling voice, weeping, desperate cry for injured child ambulance",
        "hf_search_keywords": [
          "russian female",
          "mother",
          "child injury",
          "crying",
          "urgent"
        ]
      },
      "phrases_count": 36,
      "phrases": {
        "greeting_01": {
          "audio_id": "t01_q03_greeting_01",
          "intent": "greeting",
          "emotion": "panic",
          "prosody": {
            "speed": 1.2,
            "pitch": "+18%",
            "energy": "screaming",
            "breath": "sobbing"
          },
          "text": "Алло... Скорая?! Господи, помогите, пожалуйста! Сын сильно разбился на улице, плачет навзрыд, помогите!",
          "context_note": "Мать в слезах молит о скорой помощи сыну",
          "cosyvoice_prompt": "Mother in tears, breathless crying, urgent emergency"
        },
        "greeting_02": {
          "audio_id": "t01_q03_greeting_02",
          "intent": "greeting",
          "emotion": "panic",
          "prosody": {
            "speed": 1.2,
            "pitch": "+15%",
            "energy": "loud",
            "breath": "heavy"
          },
          "text": "Девушка, миленькая, примите вызов срочно! Ребенку очень плохо, упал, кричит от боли, скорую пришлите!",
          "context_note": "Отчаянный материнский крик о помощи",
          "cosyvoice_prompt": "Desperate mother, sobbing, high urgency"
        },
        "greeting_03": {
          "audio_id": "t01_q03_greeting_03",
          "intent": "greeting",
          "emotion": "terror",
          "prosody": {
            "speed": 1.25,
            "pitch": "+20%",
            "energy": "screaming",
            "breath": "trembling"
          },
          "text": "112?! Умоляю вас, скорее врачей пришлите! Сын сильно покалечился, встать не может, помогите ради бога!",
          "context_note": "Страх матери перед тяжелой травмой",
          "cosyvoice_prompt": "Terror, sobbing, mother pleading for pediatric ambulance"
        },
        "address_01": {
          "audio_id": "t01_q03_address_01",
          "intent": "address",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.05,
            "pitch": "+10%",
            "energy": "firm",
            "breath": "trembling"
          },
          "text": "Мы в городе Волжский, Волгоградская область. Улица Карла Маркса, прямо около Волжского Молсыркомбината, на траве сидим.",
          "context_note": "Адрес в г. Волжский возле Молсыркомбината",
          "cosyvoice_prompt": "Mother giving address, shaky but clear voice"
        },
        "address_02": {
          "audio_id": "t01_q03_address_02",
          "intent": "address",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.05,
            "pitch": "+5%",
            "energy": "insistent",
            "breath": "normal"
          },
          "text": "Город Волжский, улица Карла Маркса, около Молсыркомбината. Тут въездные ворота рядом, мы у обочины.",
          "context_note": "Уточнение ориентира въездных ворот",
          "cosyvoice_prompt": "Explaining location landmarks in Volzhsky"
        },
        "address_03": {
          "audio_id": "t01_q03_address_03",
          "intent": "address",
          "emotion": "aggressive",
          "prosody": {
            "speed": 1.2,
            "pitch": "+15%",
            "energy": "shouting",
            "breath": "irritated"
          },
          "text": "Волгоградская область, Волжский, улица Карла Маркса, напротив проходной Молсыркомбината.",
          "context_note": "Повторение адреса напротив проходной",
          "cosyvoice_prompt": "Urgent repetition of city and address"
        },
        "address_04": {
          "audio_id": "t01_q03_address_04",
          "intent": "address",
          "emotion": "panic",
          "prosody": {
            "speed": 1.1,
            "pitch": "+10%",
            "energy": "urgent",
            "breath": "rapid"
          },
          "text": "Город Волжский, Карла Маркса у Молсыркомбината. Я в ярко-красной куртке стою у дороги, сразу видно будет бригаде.",
          "context_note": "Приметы матери для водителя скорой",
          "cosyvoice_prompt": "Describing visible clothes to meet ambulance"
        },
        "victims_01": {
          "audio_id": "t01_q03_victims_01",
          "intent": "victims",
          "emotion": "terror",
          "prosody": {
            "speed": 1.15,
            "pitch": "+15%",
            "energy": "pleading",
            "breath": "sobbing"
          },
          "text": "Сын пострадал, мальчик одиннадцать лет, Илья зовут! Упал без сознания, сейчас плачет от нестерпимой боли, рука и нога опухают жутко!",
          "context_note": "Имя и возраст ребенка (Илья, 11 лет)",
          "cosyvoice_prompt": "Mother describing her 11yo son injury, crying"
        },
        "victims_02": {
          "audio_id": "t01_q03_victims_02",
          "intent": "victims",
          "emotion": "panic",
          "prosody": {
            "speed": 1.15,
            "pitch": "+15%",
            "energy": "loud",
            "breath": "shaking"
          },
          "text": "У ребенка рука распухла прямо на глазах, неестественно согнута, и нога ободрана, наступить не может!",
          "context_note": "Описание травмы руки и ноги",
          "cosyvoice_prompt": "Describing swelling arm and leg, emotional distress"
        },
        "victims_03": {
          "audio_id": "t01_q03_victims_03",
          "intent": "victims",
          "emotion": "fear",
          "prosody": {
            "speed": 1.1,
            "pitch": "+10%",
            "energy": "shaking",
            "breath": "heavy"
          },
          "text": "Он то в сознании, то отключается, весь дрожит, судороги от болевого шока! Боюсь, что перелом со смещением, срочно обезболивающее нужно!",
          "context_note": "Болевой шок у ребенка",
          "cosyvoice_prompt": "Afraid to move child, acute pain"
        },
        "victims_04": {
          "audio_id": "t01_q03_victims_04",
          "intent": "victims",
          "emotion": "fear",
          "prosody": {
            "speed": 1.15,
            "pitch": "+15%",
            "energy": "pleading",
            "breath": "choking"
          },
          "text": "Один пострадавший, мой сын одиннадцати лет. Шевелиться не может из-за резкой боли в руке и ноге, нужна скорая!",
          "context_note": "Просьба о скорой помощи для сына",
          "cosyvoice_prompt": "Pleading for pain relief and medical crew"
        },
        "details_01": {
          "audio_id": "t01_q03_details_01",
          "intent": "details",
          "emotion": "panic",
          "prosody": {
            "speed": 1.15,
            "pitch": "+10%",
            "energy": "loud",
            "breath": "heavy"
          },
          "text": "Он ехал по дорожке на велосипеде, колесо повело на гравии, и он со всего размаха рухнул на асфальт, без сознания лежал!",
          "context_note": "Как именно произошло падение с велосипеда",
          "cosyvoice_prompt": "Explaining bicycle fall on gravel"
        },
        "details_02": {
          "audio_id": "t01_q03_details_02",
          "intent": "details",
          "emotion": "panic",
          "prosody": {
            "speed": 1.15,
            "pitch": "+15%",
            "energy": "gasping",
            "breath": "rapid"
          },
          "text": "Велосипед сверху на него упал, основной удар пришелся на правую руку и ногу.",
          "context_note": "Механизм удара велосипедом",
          "cosyvoice_prompt": "Describing bicycle falling on top of boy"
        },
        "details_03": {
          "audio_id": "t01_q03_details_03",
          "intent": "details",
          "emotion": "fear",
          "prosody": {
            "speed": 1.1,
            "pitch": "+5%",
            "energy": "firm",
            "breath": "tense"
          },
          "text": "Головой не ударился, шлем защитил, но удар об асфальт был очень сильный, губы побелели.",
          "context_note": "Шлем спас голову, бледность губ от боли",
          "cosyvoice_prompt": "Checking child head, helmet helped, pale lips"
        },
        "details_04": {
          "audio_id": "t01_q03_details_04",
          "intent": "details",
          "emotion": "panic",
          "prosody": {
            "speed": 1.1,
            "pitch": "+10%",
            "energy": "shaking",
            "breath": "urgent"
          },
          "text": "Я сразу подбежала, кофту ему под голову положила, глажу, но боль всё сильнее становится.",
          "context_note": "Мать ухаживает за сыном на траве",
          "cosyvoice_prompt": "Comforting child, holding his hand, growing pain"
        },
        "details_05": {
          "audio_id": "t01_q03_details_05",
          "intent": "details",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.05,
            "pitch": "+5%",
            "energy": "matter-of-fact",
            "breath": "steady"
          },
          "text": "Прохожие рядом остановились, воды дали попить, трогать боимся до приезда врачей.",
          "context_note": "Прохожие рядом, ждут медиков",
          "cosyvoice_prompt": "Bystanders watching, waiting for pediatric doctor"
        },
        "caller_id_01": {
          "audio_id": "t01_q03_caller_id_01",
          "intent": "caller_id",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.0,
            "pitch": "+5%",
            "energy": "clear",
            "breath": "trembling"
          },
          "text": "Я его мама, Смирнова. Телефон мой: восемь, девятьсот шестнадцать, триста двадцать, двенадцать, восемьдесят три.",
          "context_note": "Мама называет себя и номер телефона",
          "cosyvoice_prompt": "Mother giving her name and phone number"
        },
        "caller_id_02": {
          "audio_id": "t01_q03_caller_id_02",
          "intent": "caller_id",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.05,
            "pitch": "+5%",
            "energy": "firm",
            "breath": "normal"
          },
          "text": "Запишите: мама пострадавшего, Смирнова. Номер — девятьсот шестнадцать, триста двадцать, двенадцать, восемьдесят три.",
          "context_note": "Подтверждение, что звонит мать пострадавшего",
          "cosyvoice_prompt": "Confirming mother identity and cell phone"
        },
        "caller_id_03": {
          "audio_id": "t01_q03_caller_id_03",
          "intent": "caller_id",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.05,
            "pitch": "+5%",
            "energy": "insistent",
            "breath": "hurried"
          },
          "text": "Смирнова я, мама Ильи. Мой телефон — восемь, девятьсот шестнадцать, триста двадцать, двенадцать, восемьдесят три.",
          "context_note": "Номер телефона матери для бригады",
          "cosyvoice_prompt": "Giving phone to doctor, staying on call"
        },
        "cliche_rage_01": {
          "audio_id": "t01_q03_cliche_rage_01",
          "intent": "cliche_rage",
          "emotion": "rage",
          "prosody": {
            "speed": 1.25,
            "pitch": "+20%",
            "energy": "screaming",
            "breath": "furious"
          },
          "text": "Вы издеваетесь надо мной?! Не тратьте время на пустые вопросы, отправляйте помощь!",
          "context_note": "Универсальная отчаянная мольба прекратить опрос",
          "cosyvoice_prompt": "Desperate plea to stop questions and dispatch ambulance"
        },
        "cliche_rage_02": {
          "audio_id": "t01_q03_cliche_rage_02",
          "intent": "cliche_rage",
          "emotion": "rage",
          "prosody": {
            "speed": 1.25,
            "pitch": "+20%",
            "energy": "screaming",
            "breath": "furious"
          },
          "text": "Да вы меня вообще слышите?! Что вы ерунду какую-то спрашиваете, когда тут такое творится?!",
          "context_note": "Универсальный крик возмущения на бессмысленные вопросы",
          "cosyvoice_prompt": "Mother indignant at protocol bureaucracy"
        },
        "cliche_rage_03": {
          "audio_id": "t01_q03_cliche_rage_03",
          "intent": "cliche_rage",
          "emotion": "rage",
          "prosody": {
            "speed": 1.2,
            "pitch": "+18%",
            "energy": "screaming",
            "breath": "furious"
          },
          "text": "Девушка, милая, хватит по инструкции опрашивать, ребенка спасать надо!",
          "context_note": "Универсальная мольба спасать ребенка",
          "cosyvoice_prompt": "Mother breaking down under protocol questions"
        },
        "cliche_rage_04": {
          "audio_id": "t01_q03_cliche_rage_04",
          "intent": "cliche_rage",
          "emotion": "rage",
          "prosody": {
            "speed": 1.2,
            "pitch": "+15%",
            "energy": "screaming",
            "breath": "furious"
          },
          "text": "Вы в своем уме?! Я вам про беду говорю, а вы формализмом занимаетесь! Скорая едет или нет?!",
          "context_note": "Требование ответа, выехала ли скорая",
          "cosyvoice_prompt": "Demanding confirmation of ambulance dispatch"
        },
        "deescalation_01": {
          "audio_id": "t01_q03_deescalation_01",
          "intent": "deescalation",
          "emotion": "grounded",
          "prosody": {
            "speed": 0.95,
            "pitch": "-5%",
            "energy": "relieved",
            "breath": "deep sigh"
          },
          "text": "Ой, господи... Да, хорошо, простите... Я на связи, держусь. Что еще сказать?",
          "context_note": "Мать успокаивается после поддержки оператора",
          "cosyvoice_prompt": "Deep sigh, calming down, apologizing for emotion"
        },
        "deescalation_02": {
          "audio_id": "t01_q03_deescalation_02",
          "intent": "deescalation",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.0,
            "pitch": "0%",
            "energy": "composed",
            "breath": "even"
          },
          "text": "Слава богу, что скорая выехала... Я выдохнула немного, сижу рядом с сыном, слушаю вас.",
          "context_note": "Успокоение после подтверждения вызова",
          "cosyvoice_prompt": "Calming child, speaking softly, listening to operator"
        },
        "deescalation_03": {
          "audio_id": "t01_q03_deescalation_03",
          "intent": "deescalation",
          "emotion": "cooperative",
          "prosody": {
            "speed": 1.0,
            "pitch": "0%",
            "energy": "attentive",
            "breath": "steady"
          },
          "text": "Да, я с вами, не отключаюсь. Говорю с ним спокойным голосом, как вы сказали, спрашивайте.",
          "context_note": "Готовность сотрудничать с оператором",
          "cosyvoice_prompt": "Holding child hand, listening calmly"
        },
        "deescalation_04": {
          "audio_id": "t01_q03_deescalation_04",
          "intent": "deescalation",
          "emotion": "cooperative",
          "prosody": {
            "speed": 0.95,
            "pitch": "-5%",
            "energy": "grateful",
            "breath": "calm"
          },
          "text": "Поняла вас, руку зафиксировала шарфом аккуратно, никуда не двигаем. Спокойно ждем бригаду.",
          "context_note": "Выполнение инструкций оператора",
          "cosyvoice_prompt": "Following instruction not to move injured child"
        },
        "urgency_and_silence_01": {
          "audio_id": "t01_q03_urgency_silence_01",
          "intent": "urgency_silence",
          "emotion": "aggressive",
          "prosody": {
            "speed": 1.2,
            "pitch": "+15%",
            "energy": "shouting",
            "breath": "heavy"
          },
          "text": "Алло! Девушка, не молчите, умоляю! Скажите, скорая помощь выехала?!",
          "context_note": "Испуг матери от тишины оператора",
          "cosyvoice_prompt": "Mother frightened by silence, child crying"
        },
        "urgency_and_silence_02": {
          "audio_id": "t01_q03_urgency_silence_02",
          "intent": "urgency_silence",
          "emotion": "panic",
          "prosody": {
            "speed": 1.2,
            "pitch": "+15%",
            "energy": "insistent",
            "breath": "tense"
          },
          "text": "Оператор, вы здесь?! Пожалуйста, скажите хоть слово, бригада уже едет к нам?!",
          "context_note": "Требование подтвердить статус выезда бригады",
          "cosyvoice_prompt": "Demanding status of ambulance dispatch"
        },
        "urgency_and_silence_03": {
          "audio_id": "t01_q03_urgency_silence_03",
          "intent": "urgency_silence",
          "emotion": "fear",
          "prosody": {
            "speed": 1.15,
            "pitch": "+15%",
            "energy": "pleading",
            "breath": "gasping"
          },
          "text": "Не молчите, ради всего святого! Почему вы замолчали в трубку, ребенку же больно?!",
          "context_note": "Мольба не оставлять в тишине",
          "cosyvoice_prompt": "Pleading operator to speak, fear of silence"
        },
        "deadlock_guard_01": {
          "audio_id": "t01_q03_deadlock_01",
          "intent": "deadlock_guard",
          "emotion": "aggressive",
          "prosody": {
            "speed": 1.2,
            "pitch": "+15%",
            "energy": "loud",
            "breath": "irritated"
          },
          "text": "Да какая разница?! Вы зачем ерунду какую-то спрашиваете, когда ребенок от боли задыхается?!",
          "context_note": "Отказ отвечать на неуместные вопросы",
          "cosyvoice_prompt": "Angry at irrelevant question during pediatric emergency"
        },
        "deadlock_guard_02": {
          "audio_id": "t01_q03_deadlock_02",
          "intent": "deadlock_guard",
          "emotion": "panic",
          "prosody": {
            "speed": 1.15,
            "pitch": "+10%",
            "energy": "exasperated",
            "breath": "short"
          },
          "text": "Откуда мне это знать?! Я мама, а не специалист! Скорую отправьте скорее!",
          "context_note": "Мать не знает технических/формальных деталей",
          "cosyvoice_prompt": "Exasperated mother demanding help not forms"
        },
        "deadlock_guard_03": {
          "audio_id": "t01_q03_deadlock_03",
          "intent": "deadlock_guard",
          "emotion": "aggressive",
          "prosody": {
            "speed": 1.25,
            "pitch": "+15%",
            "energy": "demanding",
            "breath": "panting"
          },
          "text": "Послушайте... Хватит тратить драгоценное время на пустые расспросы! Машина в пути или нет?!",
          "context_note": "Просьба отложить формальности ради ребенка",
          "cosyvoice_prompt": "Begging to send ambulance first, fill forms later"
        },
        "closing_01": {
          "audio_id": "t01_q03_closing_01",
          "intent": "closing_instructions",
          "emotion": "cooperative",
          "prosody": {
            "speed": 1.0,
            "pitch": "0%",
            "energy": "firm",
            "breath": "steady"
          },
          "text": "Спасибо вам огромное, милая... Сидим на месте, ждем скорую помощь, смотрю на дорогу.",
          "context_note": "Благодарность оператору от матери",
          "cosyvoice_prompt": "Heartfelt gratitude, waiting for ambulance by road"
        },
        "closing_02": {
          "audio_id": "t01_q03_closing_02",
          "intent": "closing_instructions",
          "emotion": "cooperative",
          "prosody": {
            "speed": 0.95,
            "pitch": "0%",
            "energy": "grateful",
            "breath": "calm"
          },
          "text": "Спасибо большое! Телефон держу свободным, жду звонка от врачей. До свидания!",
          "context_note": "Линия свободна для связи с врачом",
          "cosyvoice_prompt": "Keeping line free, waiting for crew"
        },
        "closing_03": {
          "audio_id": "t01_q03_closing_03",
          "intent": "closing_instructions",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.0,
            "pitch": "+5%",
            "energy": "watchful",
            "breath": "steady"
          },
          "text": "Всё поняла, остаюсь возле ребенка и никуда не отхожу до приезда скорой. Спасибо!",
          "context_note": "Завершение разговора у ребенка",
          "cosyvoice_prompt": "Comforting child softly, ending call"
        }
      }
    }
  },
  "2": {
    "1": {
      "persona": {
        "caller_name": "Ким Олег Юрьевич",
        "gender": "male",
        "age_group": "adult 26-45",
        "voice_timbre": "спокойный деловой баритон, периодическое покашливание от гари",
        "personality": "Жилец 7-го этажа в 17-этажке, ответственный гражданин, обнаружил дым из мусоропровода, быстро передает факты.",
        "category": "Пожары и задымления",
        "panic_level": 65,
        "has_victims": false,
        "cosyvoice_persona_prompt": "Russian male 38yo resident, coughing, concerned, clear speech, high-rise building smoke",
        "hf_search_keywords": [
          "russian male",
          "adult",
          "apartment smoke",
          "calm"
        ]
      },
      "phrases_count": 36,
      "phrases": {
        "greeting_01": {
          "audio_id": "t02_q01_greeting_01",
          "intent": "greeting",
          "emotion": "panic",
          "prosody": {
            "speed": 1.15,
            "pitch": "+5%",
            "energy": "loud",
            "breath": "heavy"
          },
          "text": "Здравствуйте, служба 112! Срочно пожарных пришлите: в многоэтажном доме сильное задымление, гарью несет!",
          "context_note": "Сообщение о дыме в подъезде жилого дома",
          "cosyvoice_prompt": "Resident reporting trash chute smoke, clear male"
        },
        "greeting_02": {
          "audio_id": "t02_q01_greeting_02",
          "intent": "greeting",
          "emotion": "panic",
          "prosody": {
            "speed": 1.15,
            "pitch": "+5%",
            "energy": "firm",
            "breath": "normal"
          },
          "text": "Оператор, добрый день! Примите вызов на пожарных: в подъезде жилого дома дым валит, дышать тяжело!",
          "context_note": "Четкий звонок о задымлении в высотке",
          "cosyvoice_prompt": "Businesslike emergency call, 17-story building smoke"
        },
        "greeting_03": {
          "audio_id": "t02_q01_greeting_03",
          "intent": "greeting",
          "emotion": "terror",
          "prosody": {
            "speed": 1.2,
            "pitch": "+10%",
            "energy": "screaming",
            "breath": "coughing"
          },
          "text": "112?! Срочно расчет пожарный отправьте! У нас в жилом доме едкий дым заполняет подъезд, помогите!",
          "context_note": "Крик о помощи на фоне кашля от гари",
          "cosyvoice_prompt": "Coughing, urgent call about smoke in apartment hallway"
        },
        "address_01": {
          "audio_id": "t02_q01_address_01",
          "intent": "address",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.05,
            "pitch": "+5%",
            "energy": "firm",
            "breath": "normal"
          },
          "text": "Записывайте адрес: улица Берзарина, дом двадцать один, корпус один, третий подъезд, код домофона шестьдесят восемь. Седьмой этаж семнадцатиэтажного дома.",
          "context_note": "Четкий адрес на ул. Берзарина",
          "cosyvoice_prompt": "Direct address dictation: Berzarina street, bldg 21 k1"
        },
        "address_02": {
          "audio_id": "t02_q01_address_02",
          "intent": "address",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.05,
            "pitch": "+5%",
            "energy": "insistent",
            "breath": "normal"
          },
          "text": "Москва, улица Берзарина, двадцать один, корпус один, подъезд номер три, домофон шестьдесят восемь. Семнадцатиэтажка.",
          "context_note": "Уточнение этажности и подъезда",
          "cosyvoice_prompt": "Explaining apartment location and intercom"
        },
        "address_03": {
          "audio_id": "t02_q01_address_03",
          "intent": "address",
          "emotion": "aggressive",
          "prosody": {
            "speed": 1.15,
            "pitch": "+10%",
            "energy": "shouting",
            "breath": "irritated"
          },
          "text": "Улица Берзарина, дом двадцать один, корпус один, третий подъезд. Подъезд со стороны двора, шлагбаум открыт.",
          "context_note": "Указание проезда со двора",
          "cosyvoice_prompt": "Irritated repetition of Berzarina street address"
        },
        "address_04": {
          "audio_id": "t02_q01_address_04",
          "intent": "address",
          "emotion": "panic",
          "prosody": {
            "speed": 1.1,
            "pitch": "+5%",
            "energy": "urgent",
            "breath": "rapid"
          },
          "text": "Берзарина, дом двадцать один, корпус один, подъезд три. Я спущусь вниз на улицу и открою дверь пожарным.",
          "context_note": "Обещание открыть подъезд расчетам",
          "cosyvoice_prompt": "Will meet fire brigade at entrance 3"
        },
        "victims_01": {
          "audio_id": "t02_q01_victims_01",
          "intent": "victims",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.05,
            "pitch": "0%",
            "energy": "firm",
            "breath": "calm"
          },
          "text": "Пострадавших нет, никто не пострадал. Медицинская помощь никому не требуется.",
          "context_note": "Подтверждение отсутствия пострадавших",
          "cosyvoice_prompt": "Zero victims, no medical help required"
        },
        "victims_02": {
          "audio_id": "t02_q01_victims_02",
          "intent": "victims",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.05,
            "pitch": "0%",
            "energy": "clear",
            "breath": "normal"
          },
          "text": "Людей без сознания нет, никто не надышался. Скорая помощь не нужна, только пожарные.",
          "context_note": "Отказ от бригады скорой помощи",
          "cosyvoice_prompt": "No smoke intoxication, firemen only"
        },
        "victims_03": {
          "audio_id": "t02_q01_victims_03",
          "intent": "victims",
          "emotion": "panic",
          "prosody": {
            "speed": 1.1,
            "pitch": "+5%",
            "energy": "insistent",
            "breath": "rapid"
          },
          "text": "Жертв нет, все жильцы оповещены и находятся в квартирах с закрытыми дверями.",
          "context_note": "Жильцы находятся в безопасности в квартирах",
          "cosyvoice_prompt": "Residents safe inside apartments"
        },
        "victims_04": {
          "audio_id": "t02_q01_victims_04",
          "intent": "victims",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.0,
            "pitch": "0%",
            "energy": "firm",
            "breath": "calm"
          },
          "text": "Травмированных и обожженных нет, слава богу. Опасности для жизни людей сейчас нет.",
          "context_note": "Отсутствие ожогов и травм",
          "cosyvoice_prompt": "No burns, no life hazard currently"
        },
        "details_01": {
          "audio_id": "t02_q01_details_01",
          "intent": "details",
          "emotion": "panic",
          "prosody": {
            "speed": 1.15,
            "pitch": "+5%",
            "energy": "loud",
            "breath": "heavy"
          },
          "text": "Идет густой дым прямо из ковша мусоропровода на площадке седьмого этажа.",
          "context_note": "Источник задымления: ковш мусоропровода на 7 этаже",
          "cosyvoice_prompt": "Smoke coming from trash chute flap on 7th floor"
        },
        "details_02": {
          "audio_id": "t02_q01_details_02",
          "intent": "details",
          "emotion": "panic",
          "prosody": {
            "speed": 1.15,
            "pitch": "+5%",
            "energy": "gasping",
            "breath": "rapid"
          },
          "text": "Запах едкий, пахнет горелым пластиком и тлеющим бытовым мусором.",
          "context_note": "Характер запаха: пластик и мусор",
          "cosyvoice_prompt": "Acrid smell of burning plastic and household waste"
        },
        "details_03": {
          "audio_id": "t02_q01_details_03",
          "intent": "details",
          "emotion": "fear",
          "prosody": {
            "speed": 1.1,
            "pitch": "+5%",
            "energy": "firm",
            "breath": "tense"
          },
          "text": "Открытого пламени не видно, но тяга сильная, дым вверх по стволу мусоропровода поднимается.",
          "context_note": "Пламени не видно, тяга по стволу вверх",
          "cosyvoice_prompt": "No open flames visible, draft pulling smoke up"
        },
        "details_04": {
          "audio_id": "t02_q01_details_04",
          "intent": "details",
          "emotion": "panic",
          "prosody": {
            "speed": 1.1,
            "pitch": "+5%",
            "energy": "shouting",
            "breath": "urgent"
          },
          "text": "Дым постепенно просачивается на верхние этажи, на лестничной клетке видимость падает.",
          "context_note": "Распространение дыма на верхние этажи",
          "cosyvoice_prompt": "Smoke rising to upper floors, visibility dropping"
        },
        "details_05": {
          "audio_id": "t02_q01_details_05",
          "intent": "details",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.05,
            "pitch": "+5%",
            "energy": "matter-of-fact",
            "breath": "steady"
          },
          "text": "В мусорокамере внизу, видимо, что-то загорелось, ствол горячий на ощупь.",
          "context_note": "Труба мусоропровода горячая на ощупь",
          "cosyvoice_prompt": "Chute pipe is hot to touch, fire in basement bin"
        },
        "caller_id_01": {
          "audio_id": "t02_q01_caller_id_01",
          "intent": "caller_id",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.0,
            "pitch": "0%",
            "energy": "clear",
            "breath": "normal"
          },
          "text": "Заявитель — Ким Олег Юрьевич, жилец с седьмого этажа. Телефон: восемь, девятьсот шестнадцать, сто двадцать шесть, тридцать четыре, семьдесят один.",
          "context_note": "ФИО и номер телефона жильца",
          "cosyvoice_prompt": "Stating full name Kim Oleg Yurievich and phone"
        },
        "caller_id_02": {
          "audio_id": "t02_q01_caller_id_02",
          "intent": "caller_id",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.05,
            "pitch": "0%",
            "energy": "firm",
            "breath": "normal"
          },
          "text": "Меня зовут Ким Олег Юрьевич. Мой номер телефона: девятьсот шестнадцать, сто двадцать шесть, тридцать четыре, семьдесят один.",
          "context_note": "Подтверждение данных заявителя",
          "cosyvoice_prompt": "Confirming caller name and phone number"
        },
        "caller_id_03": {
          "audio_id": "t02_q01_caller_id_03",
          "intent": "caller_id",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.05,
            "pitch": "+5%",
            "energy": "insistent",
            "breath": "hurried"
          },
          "text": "Ким Олег Юрьевич. Телефон для связи: восемь, девятьсот шестнадцать, сто двадцать шесть, тридцать четыре, семьдесят один.",
          "context_note": "Контактный номер для пожарного расчета",
          "cosyvoice_prompt": "Contact phone for fire truck commander"
        },
        "cliche_rage_01": {
          "audio_id": "t02_q01_cliche_rage_01",
          "intent": "cliche_rage",
          "emotion": "rage",
          "prosody": {
            "speed": 1.25,
            "pitch": "+15%",
            "energy": "screaming",
            "breath": "furious"
          },
          "text": "Вы издеваетесь надо мной?! Не тратьте время на пустые вопросы, отправляйте помощь!",
          "context_note": "Универсальный протест против траты времени",
          "cosyvoice_prompt": "Angry at bureaucratic questioning, demanding action"
        },
        "cliche_rage_02": {
          "audio_id": "t02_q01_cliche_rage_02",
          "intent": "cliche_rage",
          "emotion": "rage",
          "prosody": {
            "speed": 1.2,
            "pitch": "+15%",
            "energy": "screaming",
            "breath": "furious"
          },
          "text": "Да вы меня вообще слышите?! Что вы ерунду какую-то спрашиваете, когда тут такое творится?!",
          "context_note": "Универсальный гнев на нелепые вопросы",
          "cosyvoice_prompt": "Furious at absurd question, shouting"
        },
        "cliche_rage_03": {
          "audio_id": "t02_q01_cliche_rage_03",
          "intent": "cliche_rage",
          "emotion": "rage",
          "prosody": {
            "speed": 1.2,
            "pitch": "+10%",
            "energy": "screaming",
            "breath": "furious"
          },
          "text": "Девушка, милая, хватит по инструкции опрашивать, людей спасать надо!",
          "context_note": "Универсальный протест против регламентов",
          "cosyvoice_prompt": "Screaming at bureaucratic protocol"
        },
        "cliche_rage_04": {
          "audio_id": "t02_q01_cliche_rage_04",
          "intent": "cliche_rage",
          "emotion": "rage",
          "prosody": {
            "speed": 1.2,
            "pitch": "+10%",
            "energy": "screaming",
            "breath": "furious"
          },
          "text": "Вы в своем уме?! Я вам про беду говорю, а вы формализмом занимаетесь! Расчет выехал или нет?!",
          "context_note": "Требование ответа о выезде пожарных",
          "cosyvoice_prompt": "Demanding dispatch confirmation without bureaucracy"
        },
        "deescalation_01": {
          "audio_id": "t02_q01_deescalation_01",
          "intent": "deescalation",
          "emotion": "grounded",
          "prosody": {
            "speed": 0.95,
            "pitch": "-5%",
            "energy": "relieved",
            "breath": "deep sigh"
          },
          "text": "Фух... Да, хорошо, извините... Я на связи, держусь, что еще сказать?",
          "context_note": "Вздох облегчения, заявитель сотрудничает",
          "cosyvoice_prompt": "Deep breath, cooperating with dispatcher"
        },
        "deescalation_02": {
          "audio_id": "t02_q01_deescalation_02",
          "intent": "deescalation",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.0,
            "pitch": "0%",
            "energy": "composed",
            "breath": "even"
          },
          "text": "Понял вас, спасибо. Взял документы, выхожу на свежий воздух встречать расчет, слушаю вас.",
          "context_note": "Эвакуация на улицу с документами",
          "cosyvoice_prompt": "Taking documents, stepping outside to meet crews"
        },
        "deescalation_03": {
          "audio_id": "t02_q01_deescalation_03",
          "intent": "deescalation",
          "emotion": "cooperative",
          "prosody": {
            "speed": 1.0,
            "pitch": "0%",
            "energy": "attentive",
            "breath": "steady"
          },
          "text": "Да, я с вами на линии, не отключаюсь. Спрашивайте, я на всё спокойно отвечу.",
          "context_note": "Готовность отвечать на вопросы",
          "cosyvoice_prompt": "Ready to answer questions steadily"
        },
        "deescalation_04": {
          "audio_id": "t02_q01_deescalation_04",
          "intent": "deescalation",
          "emotion": "cooperative",
          "prosody": {
            "speed": 0.95,
            "pitch": "-5%",
            "energy": "grateful",
            "breath": "calm"
          },
          "text": "Благодарю за четкую работу. Панику не разводим, стою в безопасном месте, готов отвечать.",
          "context_note": "Вежливое и конструктивное поведение",
          "cosyvoice_prompt": "Polite confirmation, waiting safely"
        },
        "urgency_and_silence_01": {
          "audio_id": "t02_q01_urgency_silence_01",
          "intent": "urgency_silence",
          "emotion": "aggressive",
          "prosody": {
            "speed": 1.2,
            "pitch": "+10%",
            "energy": "shouting",
            "breath": "heavy"
          },
          "text": "Алло! Почему молчите в трубку?! Вы передали вызов в пожарную часть?!",
          "context_note": "Проверка статуса при паузе оператора",
          "cosyvoice_prompt": "Asking if call was dispatched during pause"
        },
        "urgency_and_silence_02": {
          "audio_id": "t02_q01_urgency_silence_02",
          "intent": "urgency_silence",
          "emotion": "panic",
          "prosody": {
            "speed": 1.15,
            "pitch": "+10%",
            "energy": "insistent",
            "breath": "tense"
          },
          "text": "Оператор, вы на связи?! Скажите, расчет уже выехал к нашему дому?!",
          "context_note": "Запрос о выезде расчета",
          "cosyvoice_prompt": "Insistent inquiry about dispatch"
        },
        "urgency_and_silence_03": {
          "audio_id": "t02_q01_urgency_silence_03",
          "intent": "urgency_silence",
          "emotion": "fear",
          "prosody": {
            "speed": 1.15,
            "pitch": "+10%",
            "energy": "pleading",
            "breath": "gasping"
          },
          "text": "Не молчите, пожалуйста! Скажите хоть слово, пожарные машины направлены?!",
          "context_note": "Тревога из-за молчания",
          "cosyvoice_prompt": "Demanding call status, fear of silence"
        },
        "deadlock_guard_01": {
          "audio_id": "t02_q01_deadlock_01",
          "intent": "deadlock_guard",
          "emotion": "aggressive",
          "prosody": {
            "speed": 1.15,
            "pitch": "+10%",
            "energy": "loud",
            "breath": "irritated"
          },
          "text": "Да какая разница?! Вы зачем ерунду какую-то спрашиваете, когда дым во все щели валит?!",
          "context_note": "Пресечение неуместных вопросов",
          "cosyvoice_prompt": "Shutting down irrelevant question"
        },
        "deadlock_guard_02": {
          "audio_id": "t02_q01_deadlock_02",
          "intent": "deadlock_guard",
          "emotion": "panic",
          "prosody": {
            "speed": 1.15,
            "pitch": "+5%",
            "energy": "exasperated",
            "breath": "short"
          },
          "text": "Откуда мне это знать?! Я обычный жилец, а не инспектор! Отправляйте автоцистерну скорее!",
          "context_note": "Жилец не является техническим экспертом",
          "cosyvoice_prompt": "Exasperated response, resident not inspector"
        },
        "deadlock_guard_03": {
          "audio_id": "t02_q01_deadlock_03",
          "intent": "deadlock_guard",
          "emotion": "aggressive",
          "prosody": {
            "speed": 1.2,
            "pitch": "+10%",
            "energy": "demanding",
            "breath": "panting"
          },
          "text": "Послушайте... Хватит тратить драгоценное время на пустые расспросы! Машины едут или нет?!",
          "context_note": "Возврат оператора к вызову пожарных",
          "cosyvoice_prompt": "Redirecting operator to dispatch fire department"
        },
        "closing_01": {
          "audio_id": "t02_q01_closing_01",
          "intent": "closing_instructions",
          "emotion": "cooperative",
          "prosody": {
            "speed": 1.0,
            "pitch": "0%",
            "energy": "firm",
            "breath": "steady"
          },
          "text": "Всё понятно, спускаюсь вниз, открываю кодовый замок и встречаю пожарных. Спасибо!",
          "context_note": "Спускается встречать экипаж",
          "cosyvoice_prompt": "Walking down stairs, unlocking door for firemen"
        },
        "closing_02": {
          "audio_id": "t02_q01_closing_02",
          "intent": "closing_instructions",
          "emotion": "cooperative",
          "prosody": {
            "speed": 0.95,
            "pitch": "0%",
            "energy": "grateful",
            "breath": "calm"
          },
          "text": "Спасибо, телефон держу свободным, жду звонка от командира расчета. До свидания!",
          "context_note": "Телефон свободен для связи",
          "cosyvoice_prompt": "Grateful closing, keeping phone free"
        },
        "closing_03": {
          "audio_id": "t02_q01_closing_03",
          "intent": "closing_instructions",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.0,
            "pitch": "0%",
            "energy": "watchful",
            "breath": "steady"
          },
          "text": "Понял вас, остаюсь на связи у подъезда и встречаю пожарную охрану. Спасибо!",
          "context_note": "Ожидание пожарных у подъезда",
          "cosyvoice_prompt": "Waiting at entrance, calm goodbye"
        }
      }
    },
    "2": {
      "persona": {
        "caller_name": "Клиент салона связи (Неизвестный заявитель)",
        "gender": "male",
        "age_group": "adult 26-45",
        "voice_timbre": "резкий, возмущенный баритон, на повышенных тонах",
        "personality": "Разгневанный посетитель салона Мегафон, возмущен хамством и рукоприкладством сотрудника, бросает трубку.",
        "category": "Нарушение правопорядка",
        "panic_level": 60,
        "has_victims": false,
        "cosyvoice_persona_prompt": "Russian male 35yo, furious client, shouting, outraged at store clerk aggression",
        "hf_search_keywords": [
          "russian male",
          "adult",
          "store conflict",
          "angry"
        ]
      },
      "phrases_count": 36,
      "phrases": {
        "greeting_01": {
          "audio_id": "t02_q02_greeting_01",
          "intent": "greeting",
          "emotion": "panic",
          "prosody": {
            "speed": 1.25,
            "pitch": "+15%",
            "energy": "shouting",
            "breath": "furious"
          },
          "text": "Слушайте, отправьте наряд полиции скорее! Тут сотрудник салона связи взбесился, на людей кидается, дебош устроил!",
          "context_note": "Гневный звонок клиента о дебоше в Мегафоне",
          "cosyvoice_prompt": "Angry client calling police on aggressive store clerk"
        },
        "greeting_02": {
          "audio_id": "t02_q02_greeting_02",
          "intent": "greeting",
          "emotion": "panic",
          "prosody": {
            "speed": 1.25,
            "pitch": "+15%",
            "energy": "loud",
            "breath": "heavy"
          },
          "text": "Алло, полиция?! Срочно наряд пришлите! В салоне связи неадекватный продавец устроил скандал, драку провоцирует!",
          "context_note": "Требование наряда полиции на Сущевский Вал",
          "cosyvoice_prompt": "Demanding police patrol to shopping center Megafon"
        },
        "greeting_03": {
          "audio_id": "t02_q02_greeting_03",
          "intent": "greeting",
          "emotion": "terror",
          "prosody": {
            "speed": 1.25,
            "pitch": "+15%",
            "energy": "screaming",
            "breath": "trembling"
          },
          "text": "Оператор, примите срочно вызов! Беспредел в общественном месте, на меня продавец с кулаками полез, помогите!",
          "context_note": "Возмущение нападением продавца",
          "cosyvoice_prompt": "Outraged by clerk assault, calling 112"
        },
        "address_01": {
          "audio_id": "t02_q02_address_01",
          "intent": "address",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.1,
            "pitch": "+5%",
            "energy": "firm",
            "breath": "normal"
          },
          "text": "Адрес: Сущевский Вал, дом пять, строение один. Торговый центр, салон Мегафон на первом этаже.",
          "context_note": "Четкий адрес салона Мегафон на Сущевском Валу",
          "cosyvoice_prompt": "Dictating Megafon store address on Suschevsky Val"
        },
        "address_02": {
          "audio_id": "t02_q02_address_02",
          "intent": "address",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.1,
            "pitch": "+5%",
            "energy": "insistent",
            "breath": "normal"
          },
          "text": "Сущевский Вал пять, строение один, прямо напротив метро Савеловская. Салон связи у центрального входа.",
          "context_note": "Ориентир станции метро Савеловская",
          "cosyvoice_prompt": "Landmark near Savelovskaya metro station"
        },
        "address_03": {
          "audio_id": "t02_q02_address_03",
          "intent": "address",
          "emotion": "aggressive",
          "prosody": {
            "speed": 1.2,
            "pitch": "+15%",
            "energy": "shouting",
            "breath": "irritated"
          },
          "text": "Да Сущевский Вал это, дом пять, строение один! Первый этаж, зеленая вывеска Мегафона, сразу видно.",
          "context_note": "Повторение адреса без лишних фактов",
          "cosyvoice_prompt": "Shouting store location and green sign"
        },
        "address_04": {
          "audio_id": "t02_q02_address_04",
          "intent": "address",
          "emotion": "panic",
          "prosody": {
            "speed": 1.15,
            "pitch": "+10%",
            "energy": "urgent",
            "breath": "rapid"
          },
          "text": "Запишите адрес: Сущевский Вал пять, строение один. Я у входа в этот салон стою, жду полицию.",
          "context_note": "Ждет наряд у входа",
          "cosyvoice_prompt": "Waiting for police patrol by store entrance"
        },
        "victims_01": {
          "audio_id": "t02_q02_victims_01",
          "intent": "victims",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.1,
            "pitch": "+5%",
            "energy": "firm",
            "breath": "sighing"
          },
          "text": "Пострадавших пока нет, до крови не дошло, но он на людей кидается! Скорая не нужна, полицию шлите!",
          "context_note": "Крови пока нет, скорая не нужна",
          "cosyvoice_prompt": "No blood yet, but police urgently needed"
        },
        "victims_02": {
          "audio_id": "t02_q02_victims_02",
          "intent": "victims",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.1,
            "pitch": "+5%",
            "energy": "clear",
            "breath": "normal"
          },
          "text": "Никто не ранен, скорая помощь не требуется. Но он толкнул меня, тут драка сейчас начнется!",
          "context_note": "Травм нет, но есть угроза драки",
          "cosyvoice_prompt": "No medical injury, assault threat"
        },
        "victims_03": {
          "audio_id": "t02_q02_victims_03",
          "intent": "victims",
          "emotion": "panic",
          "prosody": {
            "speed": 1.15,
            "pitch": "+10%",
            "energy": "insistent",
            "breath": "rapid"
          },
          "text": "Травм ни у кого нет, слава богу. Медики не нужны, срочно патрульно-постовую службу сюда!",
          "context_note": "Отказ от скорой помощи в пользу ППС",
          "cosyvoice_prompt": "No physical injuries, demanding patrol car"
        },
        "victims_04": {
          "audio_id": "t02_q02_victims_04",
          "intent": "victims",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.1,
            "pitch": "+5%",
            "energy": "firm",
            "breath": "calm"
          },
          "text": "Физически все целы, медицинской помощи никому не требуется. Нужен наряд полиции, чтобы порядок навести!",
          "context_note": "Все целы, нужна только полиция",
          "cosyvoice_prompt": "Zero victims physically, police required"
        },
        "details_01": {
          "audio_id": "t02_q02_details_01",
          "intent": "details",
          "emotion": "panic",
          "prosody": {
            "speed": 1.2,
            "pitch": "+10%",
            "energy": "loud",
            "breath": "heavy"
          },
          "text": "Продавец орет матом, швырнул мои документы и паспорт в лицо, угрожает расправой!",
          "context_note": "Суть инцидента: оскорбления и брошенные документы",
          "cosyvoice_prompt": "Explaining incident: verbal abuse, thrown passport"
        },
        "details_02": {
          "audio_id": "t02_q02_details_02",
          "intent": "details",
          "emotion": "panic",
          "prosody": {
            "speed": 1.2,
            "pitch": "+15%",
            "energy": "gasping",
            "breath": "rapid"
          },
          "text": "Он абсолютно невменяемый, бросается на покупателей, пожилую женщину чуть с ног не сбил!",
          "context_note": "Неадекватное поведение сотрудника",
          "cosyvoice_prompt": "Clerk behaving irrationally, pushed people"
        },
        "details_03": {
          "audio_id": "t02_q02_details_03",
          "intent": "details",
          "emotion": "fear",
          "prosody": {
            "speed": 1.15,
            "pitch": "+10%",
            "energy": "firm",
            "breath": "tense"
          },
          "text": "Сорвал с себя бейджик, фамилию назвать отказывается, кричит, что плевать хотел на всех!",
          "context_note": "Сорванный бейджик и угрозы сотрудника",
          "cosyvoice_prompt": "Clerk tore off badge, aggressive shouting"
        },
        "details_04": {
          "audio_id": "t02_q02_details_04",
          "intent": "details",
          "emotion": "panic",
          "prosody": {
            "speed": 1.15,
            "pitch": "+10%",
            "energy": "shouting",
            "breath": "urgent"
          },
          "text": "Тут уже человек десять свидетелей собралось, все возмущены таким поведением сотрудника!",
          "context_note": "Свидетели инцидента",
          "cosyvoice_prompt": "Crowd of witnesses ready to file complaints"
        },
        "details_05": {
          "audio_id": "t02_q02_details_05",
          "intent": "details",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.1,
            "pitch": "+5%",
            "energy": "matter-of-fact",
            "breath": "steady"
          },
          "text": "Он заперся за стойкой, орет из-за стекла и неприличные жесты показывает!",
          "context_note": "Продавец закрылся за стойкой",
          "cosyvoice_prompt": "Clerk locked himself behind counter making gestures"
        },
        "caller_id_01": {
          "audio_id": "t02_q02_caller_id_01",
          "intent": "caller_id",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.05,
            "pitch": "+5%",
            "energy": "clear",
            "breath": "normal"
          },
          "text": "Я клиент этого салона, гражданин России. Телефон мой: восемь, девятьсот шестнадцать, восемьсот девяносто шесть, тридцать два, пятьдесят четыре.",
          "context_note": "Диктовка номера заявителя",
          "cosyvoice_prompt": "Stating phone number, client of store"
        },
        "caller_id_02": {
          "audio_id": "t02_q02_caller_id_02",
          "intent": "caller_id",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.05,
            "pitch": "+5%",
            "energy": "firm",
            "breath": "normal"
          },
          "text": "Запишите номер телефона: девятьсот шестнадцать, восемьсот девяносто шесть, тридцать два, пятьдесят четыре. Фамилию свою в заявлении полиции укажу!",
          "context_note": "Обещание указать ФИО в заявлении полиции",
          "cosyvoice_prompt": "Confirming phone, will write name in police report"
        },
        "caller_id_03": {
          "audio_id": "t02_q02_caller_id_03",
          "intent": "caller_id",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.05,
            "pitch": "+5%",
            "energy": "insistent",
            "breath": "hurried"
          },
          "text": "Мой телефон у вас есть: восемь, девятьсот шестнадцать, восемьсот девяносто шесть, тридцать два, пятьдесят четыре. Я на месте стою, никуда не уйду.",
          "context_note": "Заявитель остается на месте",
          "cosyvoice_prompt": "Remaining on scene until patrol car arrives"
        },
        "cliche_rage_01": {
          "audio_id": "t02_q02_cliche_rage_01",
          "intent": "cliche_rage",
          "emotion": "rage",
          "prosody": {
            "speed": 1.25,
            "pitch": "+20%",
            "energy": "screaming",
            "breath": "furious"
          },
          "text": "Вы издеваетесь надо мной?! Не тратьте время на пустые вопросы, отправляйте помощь!",
          "context_note": "Универсальный гнев на пустые расспросы",
          "cosyvoice_prompt": "Furious at bureaucratic questions, shouting"
        },
        "cliche_rage_02": {
          "audio_id": "t02_q02_cliche_rage_02",
          "intent": "cliche_rage",
          "emotion": "rage",
          "prosody": {
            "speed": 1.25,
            "pitch": "+18%",
            "energy": "screaming",
            "breath": "furious"
          },
          "text": "Да вы меня вообще слышите?! Что вы ерунду какую-то спрашиваете, когда тут такое творится?!",
          "context_note": "Универсальный крик возмущения",
          "cosyvoice_prompt": "Outraged at irrelevant questions, shouting"
        },
        "cliche_rage_03": {
          "audio_id": "t02_q02_cliche_rage_03",
          "intent": "cliche_rage",
          "emotion": "rage",
          "prosody": {
            "speed": 1.2,
            "pitch": "+15%",
            "energy": "screaming",
            "breath": "furious"
          },
          "text": "Девушка, милая, хватит по инструкции опрашивать, людей спасать надо!",
          "context_note": "Универсальный протест против опросника",
          "cosyvoice_prompt": "Demanding operator to act instead of protocol"
        },
        "cliche_rage_04": {
          "audio_id": "t02_q02_cliche_rage_04",
          "intent": "cliche_rage",
          "emotion": "rage",
          "prosody": {
            "speed": 1.2,
            "pitch": "+15%",
            "energy": "screaming",
            "breath": "furious"
          },
          "text": "Вы в своем уме?! Я вам про беду говорю, а вы формализмом занимаетесь! Наряд едет или нет?!",
          "context_note": "Требование ответа, едет ли полиция",
          "cosyvoice_prompt": "Demanding confirmation of police dispatch"
        },
        "deescalation_01": {
          "audio_id": "t02_q02_deescalation_01",
          "intent": "deescalation",
          "emotion": "grounded",
          "prosody": {
            "speed": 0.95,
            "pitch": "-5%",
            "energy": "relieved",
            "breath": "deep sigh"
          },
          "text": "Ладно... Фух... Да, хорошо, извините... Я на связи, держусь, что еще сказать?",
          "context_note": "Успокоение после слов поддержки оператора",
          "cosyvoice_prompt": "Promising to stay calm, standing aside"
        },
        "deescalation_02": {
          "audio_id": "t02_q02_deescalation_02",
          "intent": "deescalation",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.0,
            "pitch": "0%",
            "energy": "composed",
            "breath": "even"
          },
          "text": "Понял вас, руками махать не буду. Отошел в сторону от стойки, стою спокойно, слушаю вас.",
          "context_note": "Отказ от эскалации конфликта",
          "cosyvoice_prompt": "Calming down, stepping back from counter"
        },
        "deescalation_03": {
          "audio_id": "t02_q02_deescalation_03",
          "intent": "deescalation",
          "emotion": "cooperative",
          "prosody": {
            "speed": 1.0,
            "pitch": "0%",
            "energy": "attentive",
            "breath": "steady"
          },
          "text": "Да, я вас услышал. Заявление по закону напишу, конфликт не раздуваю, готов отвечать.",
          "context_note": "Конструктивное решение действовать по закону",
          "cosyvoice_prompt": "Will file formal police report, calm"
        },
        "deescalation_04": {
          "audio_id": "t02_q02_deescalation_04",
          "intent": "deescalation",
          "emotion": "cooperative",
          "prosody": {
            "speed": 0.95,
            "pitch": "-5%",
            "energy": "grateful",
            "breath": "calm"
          },
          "text": "Хорошо, успокоился. Стою у витрины, жду сотрудников полиции, спрашивайте.",
          "context_note": "Спокойное ожидание у витрины",
          "cosyvoice_prompt": "Calm wait by store window"
        },
        "urgency_and_silence_01": {
          "audio_id": "t02_q02_urgency_silence_01",
          "intent": "urgency_silence",
          "emotion": "aggressive",
          "prosody": {
            "speed": 1.25,
            "pitch": "+15%",
            "energy": "shouting",
            "breath": "heavy"
          },
          "text": "Алло! Вы чего замолчали?! Вы наряд полиции отправили или нет?!",
          "context_note": "Резкий вопрос при тишине в трубке",
          "cosyvoice_prompt": "Sharp shout at silent operator"
        },
        "urgency_and_silence_02": {
          "audio_id": "t02_q02_urgency_silence_02",
          "intent": "urgency_silence",
          "emotion": "panic",
          "prosody": {
            "speed": 1.2,
            "pitch": "+10%",
            "energy": "insistent",
            "breath": "tense"
          },
          "text": "Девушка! Не молчите в трубку, скажите, полиция уже едет на вызов?!",
          "context_note": "Запрос подтверждения отправки наряда",
          "cosyvoice_prompt": "Insisting on confirmation of patrol car"
        },
        "urgency_and_silence_03": {
          "audio_id": "t02_q02_urgency_silence_03",
          "intent": "urgency_silence",
          "emotion": "fear",
          "prosody": {
            "speed": 1.15,
            "pitch": "+10%",
            "energy": "pleading",
            "breath": "gasping"
          },
          "text": "Оператор, вы слышите меня?! Ответьте, наряд выехал или вы еще думаете?!",
          "context_note": "Требование ответа, принят ли вызов",
          "cosyvoice_prompt": "Asking if police accepted emergency card"
        },
        "deadlock_guard_01": {
          "audio_id": "t02_q02_deadlock_01",
          "intent": "deadlock_guard",
          "emotion": "aggressive",
          "prosody": {
            "speed": 1.2,
            "pitch": "+15%",
            "energy": "loud",
            "breath": "irritated"
          },
          "text": "Да какая разница?! Вы зачем ерунду какую-то спрашиваете, когда тут хулиганство средь бела дня?!",
          "context_note": "Отказ от нерелевантных вопросов",
          "cosyvoice_prompt": "Angry refusal to discuss irrelevant topics"
        },
        "deadlock_guard_02": {
          "audio_id": "t02_q02_deadlock_02",
          "intent": "deadlock_guard",
          "emotion": "panic",
          "prosody": {
            "speed": 1.15,
            "pitch": "+10%",
            "energy": "exasperated",
            "breath": "short"
          },
          "text": "Откуда мне это знать?! Я покупатель, а не юрист! Полицию шлите скорее!",
          "context_note": "Очевидец требует выслать полицию",
          "cosyvoice_prompt": "Exasperated at irrelevant questions"
        },
        "deadlock_guard_03": {
          "audio_id": "t02_q02_deadlock_03",
          "intent": "deadlock_guard",
          "emotion": "aggressive",
          "prosody": {
            "speed": 1.25,
            "pitch": "+15%",
            "energy": "demanding",
            "breath": "panting"
          },
          "text": "Послушайте... Хватит задавать пустые вопросы и испытывать терпение! Наряд отправлен или нет?!",
          "context_note": "Требование прекратить глупые вопросы",
          "cosyvoice_prompt": "Impatient demand to dispatch police without delay"
        },
        "closing_01": {
          "audio_id": "t02_q02_closing_01",
          "intent": "closing_instructions",
          "emotion": "cooperative",
          "prosody": {
            "speed": 1.15,
            "pitch": "+10%",
            "energy": "firm",
            "breath": "steady"
          },
          "text": "Всё, наряд высылайте скорее! Я стою у входа, жду полицию, спасибо!",
          "context_note": "Клиент завершает звонок, оставаясь на месте",
          "cosyvoice_prompt": "Client confirming waiting by store entrance"
        },
        "closing_02": {
          "audio_id": "t02_q02_closing_02",
          "intent": "closing_instructions",
          "emotion": "cooperative",
          "prosody": {
            "speed": 1.15,
            "pitch": "+5%",
            "energy": "grateful",
            "breath": "calm"
          },
          "text": "Хватит пустых разговоров, я всё сказал! Жду сотрудников на месте, до свидания!",
          "context_note": "Категоричное завершение звонка",
          "cosyvoice_prompt": "Abrupt call termination, waiting for police"
        },
        "closing_03": {
          "audio_id": "t02_q02_closing_03",
          "intent": "closing_instructions",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.2,
            "pitch": "+10%",
            "energy": "watchful",
            "breath": "steady"
          },
          "text": "Всё понял, остаюсь на месте и встречаю патруль полиции. Всего доброго!",
          "context_note": "Завершение разговора у входа в магазин",
          "cosyvoice_prompt": "Calm confirmation to meet police patrol"
        }
      }
    },
    "3": {
      "persona": {
        "caller_name": "Иванова Елена Сергеевна",
        "gender": "female",
        "age_group": "adult 26-45",
        "voice_timbre": "сдавленный женский голос, прерывистое дыхание, шок",
        "personality": "Очевидец падения легкового автомобиля в реку Яузу, в состоянии сильного шока, задыхается от ужаса.",
        "category": "ДТП",
        "panic_level": 70,
        "has_victims": false,
        "cosyvoice_persona_prompt": "Russian female 32yo, shocked eyewitness, gasping, car plunged into river emergency",
        "hf_search_keywords": [
          "russian female",
          "adult",
          "car in river",
          "shocked",
          "urgent"
        ]
      },
      "phrases_count": 36,
      "phrases": {
        "greeting_01": {
          "audio_id": "t02_q03_greeting_01",
          "intent": "greeting",
          "emotion": "panic",
          "prosody": {
            "speed": 1.2,
            "pitch": "+18%",
            "energy": "screaming",
            "breath": "gasping"
          },
          "text": "Господи... Девушка, спасите! Только что машина с набережной слетела прямо в реку, тонет!",
          "context_note": "Шок очевидца от падения машины в Яузу",
          "cosyvoice_prompt": "Shocked woman screaming about car falling into river"
        },
        "greeting_02": {
          "audio_id": "t02_q03_greeting_02",
          "intent": "greeting",
          "emotion": "panic",
          "prosody": {
            "speed": 1.2,
            "pitch": "+15%",
            "energy": "loud",
            "breath": "heavy"
          },
          "text": "112?! Срочно спасателей и водолазов сюда! На набережной автомобиль ограждение снес и рухнул в воду!",
          "context_note": "Требование спасателей и водолазов",
          "cosyvoice_prompt": "Pleading for divers and rescue boats, car in water"
        },
        "greeting_03": {
          "audio_id": "t02_q03_greeting_03",
          "intent": "greeting",
          "emotion": "terror",
          "prosody": {
            "speed": 1.25,
            "pitch": "+20%",
            "energy": "screaming",
            "breath": "trembling"
          },
          "text": "Алло! Помогите, катастрофа! Машина в реке тонет прямо сейчас, под воду уходит, спасите!",
          "context_note": "Ужас от вида тонущего автомобиля",
          "cosyvoice_prompt": "Terror, car sinking into water, shouting"
        },
        "address_01": {
          "audio_id": "t02_q03_address_01",
          "intent": "address",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.05,
            "pitch": "+10%",
            "energy": "firm",
            "breath": "trembling"
          },
          "text": "Набережная реки Яузы, направление движения в сторону области, прямо напротив Большого Нижнего пруда.",
          "context_note": "Четкий адрес набережной Яузы",
          "cosyvoice_prompt": "Giving exact location on Yauza embankment opposite pond"
        },
        "address_02": {
          "audio_id": "t02_q03_address_02",
          "intent": "address",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.05,
            "pitch": "+5%",
            "energy": "insistent",
            "breath": "normal"
          },
          "text": "Это набережная Яузы, ехать в область, ровно напротив Большого Нижнего пруда. Ограждение снесено.",
          "context_note": "Ориентир выбитого ограждения",
          "cosyvoice_prompt": "Specifying broken railing on embankment"
        },
        "address_03": {
          "audio_id": "t02_q03_address_03",
          "intent": "address",
          "emotion": "aggressive",
          "prosody": {
            "speed": 1.2,
            "pitch": "+15%",
            "energy": "shouting",
            "breath": "irritated"
          },
          "text": "Набережная Яузы в область, Большой Нижний пруд с противоположной стороны дороги.",
          "context_note": "Повторение ориентира пруда",
          "cosyvoice_prompt": "Repetition of Yauza embankment landmarks"
        },
        "address_04": {
          "audio_id": "t02_q03_address_04",
          "intent": "address",
          "emotion": "panic",
          "prosody": {
            "speed": 1.1,
            "pitch": "+10%",
            "energy": "urgent",
            "breath": "rapid"
          },
          "text": "Напротив Большого Нижнего пруда по набережной Яузы. Я стою у разломанного парапета, руками машу.",
          "context_note": "Машет руками у пролома парапета",
          "cosyvoice_prompt": "Waving arms by broken fence on riverbank"
        },
        "victims_01": {
          "audio_id": "t02_q03_victims_01",
          "intent": "victims",
          "emotion": "terror",
          "prosody": {
            "speed": 1.15,
            "pitch": "+15%",
            "energy": "screaming",
            "breath": "sobbing"
          },
          "text": "Внутри машины могут быть люди, никто не выплыл! Срочно скорую и водолазов шлите!",
          "context_note": "Люди могут быть заблокированы внутри",
          "cosyvoice_prompt": "Fear that passengers are trapped inside car"
        },
        "victims_02": {
          "audio_id": "t02_q03_victims_02",
          "intent": "victims",
          "emotion": "panic",
          "prosody": {
            "speed": 1.15,
            "pitch": "+15%",
            "energy": "loud",
            "breath": "shaking"
          },
          "text": "Окна закрыты, из-за мутной воды не видно, сколько там человек! Если заблокированы — они захлебнутся!",
          "context_note": "Окна закрыты, угроза захлебнуться",
          "cosyvoice_prompt": "Closed windows, acute drowning danger"
        },
        "victims_03": {
          "audio_id": "t02_q03_victims_03",
          "intent": "victims",
          "emotion": "fear",
          "prosody": {
            "speed": 1.1,
            "pitch": "+10%",
            "energy": "shaking",
            "breath": "heavy"
          },
          "text": "Никто на поверхность не выбрался, люди могут утонуть прямо сейчас! Реанимацию и спасателей скорее!",
          "context_note": "Никто не выбрался на поверхность",
          "cosyvoice_prompt": "Urgent request for divers and medical crew"
        },
        "victims_04": {
          "audio_id": "t02_q03_victims_04",
          "intent": "victims",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.05,
            "pitch": "0%",
            "energy": "firm",
            "breath": "sighing"
          },
          "text": "Пока никто не выплыл, не знаю, жив ли водитель! Срочно нужна медицинская помощь и спасатели!",
          "context_note": "Неизвестно состояние водителя",
          "cosyvoice_prompt": "Unsure if driver alive, needing rescue"
        },
        "details_01": {
          "audio_id": "t02_q03_details_01",
          "intent": "details",
          "emotion": "panic",
          "prosody": {
            "speed": 1.2,
            "pitch": "+10%",
            "energy": "loud",
            "breath": "heavy"
          },
          "text": "Легковой автомобиль пробил чугунное ограждение набережной и со всего хода рухнул в реку!",
          "context_note": "Машина пробила парапет и упала в воду",
          "cosyvoice_prompt": "Describing car crashing through barrier into river"
        },
        "details_02": {
          "audio_id": "t02_q03_details_02",
          "intent": "details",
          "emotion": "panic",
          "prosody": {
            "speed": 1.2,
            "pitch": "+15%",
            "energy": "gasping",
            "breath": "rapid"
          },
          "text": "Машина носом вниз наклонилась, пузыри воздуха идут, на крыше только багажник пока виден!",
          "context_note": "Машина уходит носом под воду, пузыри воздуха",
          "cosyvoice_prompt": "Car tilting nose down, air bubbles"
        },
        "details_03": {
          "audio_id": "t02_q03_details_03",
          "intent": "details",
          "emotion": "fear",
          "prosody": {
            "speed": 1.15,
            "pitch": "+10%",
            "energy": "firm",
            "breath": "tense"
          },
          "text": "Течение сносит автомобиль, он медленно погружается на глубину, вокруг масляное пятно!",
          "context_note": "Течение сносит тонущий автомобиль",
          "cosyvoice_prompt": "Current moving car, sinking, oil slick"
        },
        "details_04": {
          "audio_id": "t02_q03_details_04",
          "intent": "details",
          "emotion": "panic",
          "prosody": {
            "speed": 1.15,
            "pitch": "+10%",
            "energy": "shouting",
            "breath": "urgent"
          },
          "text": "Разбитое ограждение на набережной разворочено, осколки бампера на асфальте валяются.",
          "context_note": "Следы удара на набережной",
          "cosyvoice_prompt": "Broken railing and debris on asphalt"
        },
        "details_05": {
          "audio_id": "t02_q03_details_05",
          "intent": "details",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.1,
            "pitch": "+5%",
            "energy": "matter-of-fact",
            "breath": "steady"
          },
          "text": "Очевидцы кричат с берега, но прыгать в ледяную воду боятся, тут глубоко и илистое дно!",
          "context_note": "Опасность прыгать в ледяную мутную воду",
          "cosyvoice_prompt": "Bystanders on shore, deep water hazard"
        },
        "caller_id_01": {
          "audio_id": "t02_q03_caller_id_01",
          "intent": "caller_id",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.0,
            "pitch": "0%",
            "energy": "clear",
            "breath": "normal"
          },
          "text": "Меня зовут Иванова Елена Сергеевна. Телефон: восемь, девятьсот шестнадцать, восемьсот девяносто шесть, тридцать два, пятьдесят четыре.",
          "context_note": "Четкая диктовка ФИО и номера телефона",
          "cosyvoice_prompt": "Stating full name Ivanova Elena Sergeevna and phone"
        },
        "caller_id_02": {
          "audio_id": "t02_q03_caller_id_02",
          "intent": "caller_id",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.05,
            "pitch": "0%",
            "energy": "firm",
            "breath": "normal"
          },
          "text": "Запишите: Иванова Елена Сергеевна я, очевидец. Номер — девятьсот шестнадцать, восемьсот девяносто шесть, тридцать два, пятьдесят четыре.",
          "context_note": "Подтверждение данных очевидца",
          "cosyvoice_prompt": "Confirming eyewitness identity and phone"
        },
        "caller_id_03": {
          "audio_id": "t02_q03_caller_id_03",
          "intent": "caller_id",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.05,
            "pitch": "+5%",
            "energy": "insistent",
            "breath": "hurried"
          },
          "text": "Иванова Елена Сергеевна. Мой телефон: восемь, девятьсот шестнадцать, восемьсот девяносто шесть, тридцать два, пятьдесят четыре.",
          "context_note": "Номер для связи со спасателями",
          "cosyvoice_prompt": "Giving phone number to rescue crews"
        },
        "cliche_rage_01": {
          "audio_id": "t02_q03_cliche_rage_01",
          "intent": "cliche_rage",
          "emotion": "rage",
          "prosody": {
            "speed": 1.25,
            "pitch": "+20%",
            "energy": "screaming",
            "breath": "furious"
          },
          "text": "Вы издеваетесь надо мной?! Не тратьте время на пустые вопросы, отправляйте помощь!",
          "context_note": "Универсальный крик отчаяния при тонущей машине",
          "cosyvoice_prompt": "Desperate scream at bureaucratic delays"
        },
        "cliche_rage_02": {
          "audio_id": "t02_q03_cliche_rage_02",
          "intent": "cliche_rage",
          "emotion": "rage",
          "prosody": {
            "speed": 1.25,
            "pitch": "+20%",
            "energy": "screaming",
            "breath": "furious"
          },
          "text": "Да вы меня вообще слышите?! Что вы ерунду какую-то спрашиваете, когда тут такое творится?!",
          "context_note": "Универсальный протест против бессмысленных расспросов",
          "cosyvoice_prompt": "Outraged at absurd protocol questions, screaming"
        },
        "cliche_rage_03": {
          "audio_id": "t02_q03_cliche_rage_03",
          "intent": "cliche_rage",
          "emotion": "rage",
          "prosody": {
            "speed": 1.2,
            "pitch": "+15%",
            "energy": "screaming",
            "breath": "furious"
          },
          "text": "Девушка, милая, хватит по инструкции опрашивать, людей спасать надо!",
          "context_note": "Универсальная мольба спасти людей",
          "cosyvoice_prompt": "Pleading to rescue people instead of protocol"
        },
        "cliche_rage_04": {
          "audio_id": "t02_q03_cliche_rage_04",
          "intent": "cliche_rage",
          "emotion": "rage",
          "prosody": {
            "speed": 1.2,
            "pitch": "+15%",
            "energy": "screaming",
            "breath": "furious"
          },
          "text": "Вы в своем уме?! Я вам про беду говорю, а вы формализмом занимаетесь! Катер со спасателями плывет или нет?!",
          "context_note": "Требование ответа, выслан ли катер",
          "cosyvoice_prompt": "Demanding confirmation of water rescue dispatch"
        },
        "deescalation_01": {
          "audio_id": "t02_q03_deescalation_01",
          "intent": "deescalation",
          "emotion": "grounded",
          "prosody": {
            "speed": 0.95,
            "pitch": "-5%",
            "energy": "relieved",
            "breath": "deep sigh"
          },
          "text": "Ой, господи... Да, хорошо, простите... Я на связи, держусь. Что еще сказать?",
          "context_note": "Глубокий вдох, спад паники",
          "cosyvoice_prompt": "Deep sigh, heart pounding, calming down"
        },
        "deescalation_02": {
          "audio_id": "t02_q03_deescalation_02",
          "intent": "deescalation",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.0,
            "pitch": "0%",
            "energy": "composed",
            "breath": "even"
          },
          "text": "Слава богу, что спасатели выехали... Я выдохнула немного, стою у парапета на безопасном расстоянии, слушаю вас.",
          "context_note": "Успокоение на безопасном расстоянии",
          "cosyvoice_prompt": "Calmed down, standing safely by parapet"
        },
        "deescalation_03": {
          "audio_id": "t02_q03_deescalation_03",
          "intent": "deescalation",
          "emotion": "cooperative",
          "prosody": {
            "speed": 1.0,
            "pitch": "0%",
            "energy": "attentive",
            "breath": "steady"
          },
          "text": "Да, я с вами, не отключаюсь. Людям крикнула в воду не прыгать, чтобы сами не утонули, готова отвечать.",
          "context_note": "Предотвращение гибели добровольцев",
          "cosyvoice_prompt": "Stopped men from diving into cold river"
        },
        "deescalation_04": {
          "audio_id": "t02_q03_deescalation_04",
          "intent": "deescalation",
          "emotion": "cooperative",
          "prosody": {
            "speed": 0.95,
            "pitch": "-5%",
            "energy": "grateful",
            "breath": "calm"
          },
          "text": "Поняла вас, держу себя в руках. Встречу спасателей и укажу точно место, где машина ушла под воду.",
          "context_note": "Готовность показать место водолазам",
          "cosyvoice_prompt": "Ready to point out location to divers"
        },
        "urgency_and_silence_01": {
          "audio_id": "t02_q03_urgency_silence_01",
          "intent": "urgency_silence",
          "emotion": "aggressive",
          "prosody": {
            "speed": 1.2,
            "pitch": "+15%",
            "energy": "shouting",
            "breath": "heavy"
          },
          "text": "Алло! Девушка! Не молчите, ради бога! Машина уже исчезает под водой!",
          "context_note": "Крик при тишине на фоне погружающейся машины",
          "cosyvoice_prompt": "Shouting at silent operator, car almost fully submerged"
        },
        "urgency_and_silence_02": {
          "audio_id": "t02_q03_urgency_silence_02",
          "intent": "urgency_silence",
          "emotion": "panic",
          "prosody": {
            "speed": 1.2,
            "pitch": "+15%",
            "energy": "insistent",
            "breath": "tense"
          },
          "text": "Оператор, вы слышите меня?! Скажите, катер спасателей уже плывет к нам?!",
          "context_note": "Запрос о выходе спасательного катера",
          "cosyvoice_prompt": "Frantic question about rescue boat arrival"
        },
        "urgency_and_silence_03": {
          "audio_id": "t02_q03_urgency_silence_03",
          "intent": "urgency_silence",
          "emotion": "fear",
          "prosody": {
            "speed": 1.15,
            "pitch": "+15%",
            "energy": "pleading",
            "breath": "gasping"
          },
          "text": "Умоляю, скажите хоть что-то! Почему вы молчите в трубку, они успеют приехать?!",
          "context_note": "Страх, что спасатели опоздают",
          "cosyvoice_prompt": "Pleading in tears, fear that rescue will be too late"
        },
        "deadlock_guard_01": {
          "audio_id": "t02_q03_deadlock_01",
          "intent": "deadlock_guard",
          "emotion": "aggressive",
          "prosody": {
            "speed": 1.2,
            "pitch": "+15%",
            "energy": "loud",
            "breath": "irritated"
          },
          "text": "Да какая разница?! Вы зачем ерунду какую-то спрашиваете, когда машина на дно идет?!",
          "context_note": "Отказ от неуместных вопросов",
          "cosyvoice_prompt": "Angry at irrelevant question"
        },
        "deadlock_guard_02": {
          "audio_id": "t02_q03_deadlock_02",
          "intent": "deadlock_guard",
          "emotion": "panic",
          "prosody": {
            "speed": 1.15,
            "pitch": "+10%",
            "energy": "exasperated",
            "breath": "short"
          },
          "text": "Откуда мне это знать?! Я прохожая, а не эксперт! Отправляйте водолазов скорее!",
          "context_note": "Очевидица не знает технических деталей",
          "cosyvoice_prompt": "Did not see details, heard loud crash"
        },
        "deadlock_guard_03": {
          "audio_id": "t02_q03_deadlock_03",
          "intent": "deadlock_guard",
          "emotion": "aggressive",
          "prosody": {
            "speed": 1.25,
            "pitch": "+15%",
            "energy": "demanding",
            "breath": "panting"
          },
          "text": "Послушайте... Хватит тратить драгоценное время на пустые расспросы! Люди под водой гибнут, катер выслан?!",
          "context_note": "Категорическое требование помощи без пустых вопросов",
          "cosyvoice_prompt": "Demanding divers immediately, stop wasting time"
        },
        "closing_01": {
          "audio_id": "t02_q03_closing_01",
          "intent": "closing_instructions",
          "emotion": "cooperative",
          "prosody": {
            "speed": 1.0,
            "pitch": "0%",
            "energy": "firm",
            "breath": "steady"
          },
          "text": "Всё поняла, стою у разломанного ограждения на набережной, буду встречать спасателей и махать шарфом. Спасибо!",
          "context_note": "Встреча спасателей с шарфом у разлома",
          "cosyvoice_prompt": "Meeting rescue crews with waving scarf"
        },
        "closing_02": {
          "audio_id": "t02_q03_closing_02",
          "intent": "closing_instructions",
          "emotion": "cooperative",
          "prosody": {
            "speed": 0.95,
            "pitch": "0%",
            "energy": "grateful",
            "breath": "calm"
          },
          "text": "Спасибо вам огромное... Телефон не занимаю, жду звонка от экстренных служб. До свидания!",
          "context_note": "Благодарность оператору, линия открыта",
          "cosyvoice_prompt": "Grateful closing, keeping phone open for dispatch"
        },
        "closing_03": {
          "audio_id": "t02_q03_closing_03",
          "intent": "closing_instructions",
          "emotion": "grounded",
          "prosody": {
            "speed": 1.0,
            "pitch": "+5%",
            "energy": "watchful",
            "breath": "steady"
          },
          "text": "Поняла вас, оградили место, чтобы никто вниз не сорвался. Встречаем экипажи, спасибо!",
          "context_note": "Оцепление пролома набережной",
          "cosyvoice_prompt": "Guarding broken railing so bystanders don't fall"
        }
      }
    }
  }
};
