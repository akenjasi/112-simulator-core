export type ServiceHistoryEntry = {
  op: string
  time: string
  status: string
  orderNumber?: string
  comment?: string
  isRejected?: boolean
}

export type ServiceStatus = {
  id: string
  name: string
  time: string
  status: string
  orderNumber?: string
  isRejected?: boolean
  history: ServiceHistoryEntry[]
}

export type DispatcherData = {
  connection: string
  phones: {
    aon: string
    provided: string
    onSite: string
  }
  incident: {
    number: string
    savedAt: string
    operator: string
  }
  caller: {
    name: string
    role: string
    address: string
  }
  description?: string;
  statuses: {
    injured: string
    ambulanceRefusal: string
    blocked: string
  }
  emergency: {
    cs: boolean
    cp: boolean
  }
  classification: {
    section: string
    title: string
    class: string
    visClass: string
  }
  services: ServiceStatus[]
}

export const dispatcherData: DispatcherData = {
  connection: "не подключен",
  phones: {
    aon: "+7 (749) 512-34-56",
    provided: "+7 (749) 512-34-56",
    onSite: "",
  },
  incident: {
    number: "Происшествие 881412",
    savedAt: "Сохр. 20.08.2021 в 11:57:19",
    operator: "Опер. 14, АРМ 7, Рожкова О И",
  },
  caller: {
    name: "Иванов",
    role: "очевидец",
    address: "Россия, Москва, (ЮАО, Чертаново Южное), Чертановская улица, 58, к. 2, под. 2",
  },
  statuses: {
    injured: "нет",
    ambulanceRefusal: "нет",
    blocked: "нет",
  },
  emergency: {
    cs: false,
    cp: false,
  },
  classification: {
    section: "Аварии и происшествия в городском хозяйстве",
    title: "Дерево. Двор (упало).",
    class: "Дерево упало во дворе;",
    visClass: "",
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
    {
      id: "pref",
      name: "Преф. ЮАО",
      time: "11:59",
      status: "Добавлена",
      isRejected: false,
      history: [
        { op: "оп. 14", time: "20.08.2021 11:59:43", status: "Добавлена" },
      ],
    },
    {
      id: "priroda",
      name: "Деп. природ.",
      time: "11:59",
      status: "Добавлена",
      isRejected: false,
      history: [
        { op: "оп. 14", time: "20.08.2021 11:59:43", status: "Добавлена" },
      ],
    },
  ],
}

export const emptyDispatcherData: DispatcherData = {
  connection: "не подключен",
  phones: {
    aon: "---",
    provided: "---",
    onSite: "",
  },
  incident: {
    number: "---",
    savedAt: "",
    operator: "",
  },
  caller: {
    name: "---",
    role: "---",
    address: "---",
  },
  statuses: {
    injured: "---",
    ambulanceRefusal: "---",
    blocked: "---",
  },
  emergency: {
    cs: false,
    cp: false,
  },
  classification: {
    section: "---",
    title: "---",
    class: "---",
    visClass: "---",
  },
  services: [],
}
