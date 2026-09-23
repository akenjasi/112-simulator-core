import { DispatcherData, dispatcherData as baseData } from "./dispatcher-data"

export type DdsScenario = {
  id: string
  ticketNumber: string
  title: string
  isTrick: boolean
  trickType?: "OUT_OF_TERRITORY" | "DUPLICATE" | "OUT_OF_COMPETENCE"
  expectedDecision: "Принята" | "Не принята"
  expectedReasonCode?: string
  expectedDuplicateId?: string
  expectedService?: string
  explanation: string
  cardData: DispatcherData
}

export const ddsScenarios: DdsScenario[] = [
  {
    id: "DDS-01",
    ticketNumber: "382893712",
    title: "Падение дерева во дворе (Штатный)",
    isTrick: false,
    expectedDecision: "Принята",
    expectedService: "Аварийная служба",
    explanation: "Штатная коммунальная авария в Чертаново Южное. Диспетчер обязан принять карточку и направить аварийную службу района.",
    cardData: {
      ...baseData,
      incident: {
        number: "Происшествие 382893712",
        savedAt: "Сохр. 20.08.2021 в 11:57:19",
        operator: "Опер. 14, АРМ 7, Рожкова О И",
      },
      caller: {
        name: "Иванов",
        role: "очевидец",
        address: "Россия, Москва, (ЮАО, Чертаново Южное), Чертановская улица, 58, к. 2, под. 2",
      },
      classification: {
        section: "Аварии и происшествия в городском хозяйстве",
        title: "Дерево. Двор (упало).",
        class: "Дерево упало во дворе; проезд перегорожен",
        visClass: "ГБУ Жилищник Чертаново Южное",
      },
      services: [
        {
          id: "chertanovo",
          name: "Упр. Чертанов...",
          time: "13:22",
          status: "Получена слу...",
          isRejected: false,
          history: [
            { op: "оп. 14", time: "20.08.2021 11:59:43", status: "Добавлена" },
            { op: "оп. 0", time: "20.08.2021 13:22:25", status: "Получена службой" },
          ],
        },
      ],
    },
  },
  {
    id: "DDS-02",
    ticketNumber: "382894105",
    title: "Задымление в подъезде жилого дома (Штатный)",
    isTrick: false,
    expectedDecision: "Принята",
    expectedService: "101",
    explanation: "Угроза пожара в многоквартирном доме. Диспетчер принимает карточку и передает информацию в службу пожарной охраны (101).",
    cardData: {
      ...baseData,
      incident: {
        number: "Происшествие 382894105",
        savedAt: "Сохр. 20.08.2021 в 12:10:04",
        operator: "Опер. 22, АРМ 3, Смирнова Е В",
      },
      caller: {
        name: "Ковалева Анна",
        role: "житель подъезда",
        address: "Россия, Москва, (ЮАО, Чертаново Южное), Варшавское шоссе, 142, к. 1, под. 3",
      },
      statuses: {
        injured: "нет",
        ambulanceRefusal: "нет",
        blocked: "нет",
      },
      classification: {
        section: "Пожары и задымления",
        title: "Задымление в подъезде на 4 этаже",
        class: "Запах гари, задымление лестничной клетки;",
        visClass: "МЧС / Пожарная охрана 101",
      },
      services: [
        {
          id: "chertanovo",
          name: "Упр. Чертанов...",
          time: "12:11",
          status: "Получена слу...",
          isRejected: false,
          history: [
            { op: "оп. 22", time: "20.08.2021 12:10:30", status: "Добавлена" },
            { op: "оп. 0", time: "20.08.2021 12:11:00", status: "Получена службой" },
          ],
        },
      ],
    },
  },
  {
    id: "DDS-03",
    ticketNumber: "382895221",
    title: "Утечка газа в квартире (Штатный)",
    isTrick: false,
    expectedDecision: "Принята",
    expectedService: "Мосгаз",
    explanation: "Опасная авария газовых сетей. Диспетчер принимает карточку и немедленно направляет аварийную службу Мосгаз.",
    cardData: {
      ...baseData,
      incident: {
        number: "Происшествие 382895221",
        savedAt: "Сохр. 20.08.2021 в 12:35:50",
        operator: "Опер. 9, АРМ 11, Кузнецов М А",
      },
      caller: {
        name: "Петров Сергей",
        role: "сосед",
        address: "Россия, Москва, (ЮАО, Чертаново Южное), Россошанская улица, 3, к. 1, кв. 14",
      },
      classification: {
        section: "Аварии коммунальных сетей",
        title: "Запах газа в помещении",
        class: "Утечка бытового газа в многоквартирном доме;",
        visClass: "Аварийная служба Мосгаз",
      },
      services: [
        {
          id: "chertanovo",
          name: "Упр. Чертанов...",
          time: "12:36",
          status: "Получена слу...",
          isRejected: false,
          history: [
            { op: "оп. 9", time: "20.08.2021 12:36:00", status: "Добавлена" },
            { op: "оп. 0", time: "20.08.2021 12:36:20", status: "Получена службой" },
          ],
        },
      ],
    },
  },
  {
    id: "DDS-04",
    ticketNumber: "382896334",
    title: "ДТП с пострадавшими на перекрестке (Штатный)",
    isTrick: false,
    expectedDecision: "Принята",
    expectedService: "103",
    explanation: "ДТП с пострадавшим в границах района. Диспетчер принимает карточку и обеспечивает координацию со скорой помощью (103) и ГИБДД (102).",
    cardData: {
      ...baseData,
      incident: {
        number: "Происшествие 382896334",
        savedAt: "Сохр. 20.08.2021 в 13:02:11",
        operator: "Опер. 14, АРМ 7, Рожкова О И",
      },
      caller: {
        name: "Васильев Олег",
        role: "водитель",
        address: "Россия, Москва, (ЮАО, Чертаново Южное), Кировоградская ул., д. 22, перекресток",
      },
      statuses: {
        injured: "да (1 чел)",
        ambulanceRefusal: "нет",
        blocked: "нет",
      },
      classification: {
        section: "Дорожно-транспортные происшествия",
        title: "ДТП с пострадавшими",
        class: "Столкновение 2 а/м, травма грудной клетки;",
        visClass: "Скорая помощь 103 / ГИБДД 102",
      },
      services: [
        {
          id: "chertanovo",
          name: "Упр. Чертанов...",
          time: "13:03",
          status: "Получена слу...",
          isRejected: false,
          history: [
            { op: "оп. 14", time: "20.08.2021 13:02:40", status: "Добавлена" },
            { op: "оп. 0", time: "20.08.2021 13:03:00", status: "Получена службой" },
          ],
        },
      ],
    },
  },
  {
    id: "DDS-05",
    ticketNumber: "382897445",
    title: "Прорыв ГВС (ПОДВОХ: Чужая территория)",
    isTrick: true,
    trickType: "OUT_OF_TERRITORY",
    expectedDecision: "Не принята",
    expectedReasonCode: "OUT_OF_TERRITORY",
    explanation: "ВНИМАНИЕ! Адрес относится к ЮЗАО (Северное Бутово), а карточка ошибочно направлена в ДДС Чертаново Южное (ЮАО). Диспетчер ОБЯЗАН отклонить карточку со статусом «Не принята» и указать причину территориальной неподведомственности.",
    cardData: {
      ...baseData,
      incident: {
        number: "Происшествие 382897445",
        savedAt: "Сохр. 20.08.2021 в 13:15:30",
        operator: "Опер. 31, АРМ 2, Васильева Т С",
      },
      caller: {
        name: "Семенов Игорь",
        role: "житель",
        address: "Россия, Москва, (ЮЗАО, Северное Бутово), бульвар Дмитрия Донского, 8, под. 1",
      },
      classification: {
        section: "Аварии коммунальных сетей",
        title: "Прорыв трубы горячего водоснабжения",
        class: "Затопление подвального помещения ГВС;",
        visClass: "ОШИБКА МАРШРУТИЗАЦИИ: ЮЗАО Северное Бутово",
      },
      services: [
        {
          id: "chertanovo",
          name: "Упр. Чертанов...",
          time: "13:16",
          status: "Получена слу...",
          isRejected: false,
          history: [
            { op: "оп. 31", time: "20.08.2021 13:15:50", status: "Добавлена" },
            { op: "оп. 0", time: "20.08.2021 13:16:10", status: "Получена службой" },
          ],
        },
      ],
    },
  },
  {
    id: "DDS-06",
    ticketNumber: "382898556",
    title: "Повторный вызов (ПОДВОХ: Дубль происшествия)",
    isTrick: true,
    trickType: "DUPLICATE",
    expectedDecision: "Не принята",
    expectedReasonCode: "DUPLICATE",
    expectedDuplicateId: "382893712",
    explanation: "ВНИМАНИЕ! Карточка полностью дублирует происшествие #382893712 (то же упавшее дерево на Чертановской 58 к2). Диспетчер ОБЯЗАН выбрать «Не принята», указать код дубля и номер исходной карточки #382893712.",
    cardData: {
      ...baseData,
      incident: {
        number: "Происшествие 382898556",
        savedAt: "Сохр. 20.08.2021 в 13:25:00",
        operator: "Опер. 18, АРМ 9, Григорьев А В",
      },
      caller: {
        name: "Морозова Елена",
        role: "прохожий",
        address: "Россия, Москва, (ЮАО, Чертаново Южное), Чертановская улица, 58, к. 2, двор",
      },
      classification: {
        section: "Аварии и происшествия в городском хозяйстве",
        title: "Повтор: упавшее дерево перекрыло двор",
        class: "Дубликат вызова по дереву во дворе;",
        visClass: "ДУБЛИКАТ к КП #382893712",
      },
      services: [
        {
          id: "chertanovo",
          name: "Упр. Чертанов...",
          time: "13:26",
          status: "Получена слу...",
          isRejected: false,
          history: [
            { op: "оп. 18", time: "20.08.2021 13:25:20", status: "Добавлена" },
            { op: "оп. 0", time: "20.08.2021 13:26:00", status: "Получена службой" },
          ],
        },
      ],
    },
  },
  {
    id: "DDS-07",
    ticketNumber: "382899667",
    title: "Шум и крики соседей (ПОДВОХ: Вне компетенции)",
    isTrick: true,
    trickType: "OUT_OF_COMPETENCE",
    expectedDecision: "Не принята",
    expectedReasonCode: "OUT_OF_COMPETENCE",
    explanation: "ВНИМАНИЕ! Нарушение тишины и угрозы драки — это компетенция правоохранительных органов (102 / полиция), а не районной коммунальной ДДС. Диспетчер ОБЯЗАН нажать «Не принята» и указать переадресацию в полицию.",
    cardData: {
      ...baseData,
      incident: {
        number: "Происшествие 382899667",
        savedAt: "Сохр. 20.08.2021 в 13:40:15",
        operator: "Опер. 5, АРМ 14, Николаев Д К",
      },
      caller: {
        name: "Алексеев Владимир",
        role: "сосед",
        address: "Россия, Москва, (ЮАО, Чертаново Южное), Чертановская улица, 64, к. 1, кв. 89",
      },
      classification: {
        section: "Охрана общественного порядка",
        title: "Шум в соседней квартире после 23:00, крики",
        class: "Нарушение закона о тишине, конфликт соседей;",
        visClass: "ВНЕ КОМПЕТЕНЦИИ ДДС (Служба 102)",
      },
      services: [
        {
          id: "chertanovo",
          name: "Упр. Чертанов...",
          time: "13:41",
          status: "Получена слу...",
          isRejected: false,
          history: [
            { op: "оп. 5", time: "20.08.2021 13:40:40", status: "Добавлена" },
            { op: "оп. 0", time: "20.08.2021 13:41:00", status: "Получена службой" },
          ],
        },
      ],
    },
  },
]
