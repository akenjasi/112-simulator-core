export const SERVICE_101 =
  "Служба 101 (ГУ МЧС России по г. Москве, ГКУ 'Пожарно спасательный центр' ОДС)"
export const SERVICE_102 =
  "Служба 102 (Дежурная часть ГУ МВД)"
export const SERVICE_103 =
  "Служба 103 (ГБУ города Москвы Станция скорой и неотложной медицинской помощи им. А.С. Пучкова)"
export const SERVICE_104 =
  "Служба 104 (АО 'МОСГАЗ' Диспетчерское управление)"

export const DEFAULT_SERVICES_LIST: string[] = [
  SERVICE_101,
  SERVICE_102,
  "ФСБ",
  "ЦЭМП",
  SERVICE_103,
  SERVICE_104,
  "ОГДЦ",
  "ЦОДД (ГКУ 'Центр организации дорожного движения')",
  "Гормост (Гормост)",
  "Мосгортранс",
  "Автодороги",
  "Мосводоканал (АО 'Мосводоканал')",
  "Россети МР",
  "МОЭК",
  "Деп. ЖКХ (Департамент ЖКХ)",
  "Метро",
  "АСУ НС (Автоматизированная система управления)",
  "Мос.Без. (Московская Безопасность)",
  "112 Мос. обл. (112 Московской области)",
  "ФГУП РСВО (Российские сети вещания и оповещения)",
  "ОЭК (Объединенная энергетическая компания)",
  "Мослифт (Лифт МСК)",
  "Мосводосток (Мосводосток)",
  "Москоллектор (Москоллектор)",
  "ВАЕН.КОМЕНДАТУРА",
  "МЖД",
  "112 Калининской области",
  "МГТС (Московская городская телефонная сеть)",
  "Департамент культуры города Москвы",
  "Комитет ветеринарии",
  "Департамент строительства",
  "Мостуризм",
  "ГКУ ЦСА (Центр социальной помощи)",
]

export const NON_EMERGENCY_INCIDENT_TYPES: string[] = [
  "отмена вызова",
  "тестовый вызов",
  "передача дежурства",
  "консультация",
  "вызов на иностранном языке",
  "ошибочно набран номер",
  "справка-101",
  "справка-102",
  "справка-103",
]

export function getServiceShortName(name: string): string {
  if (!name) return ""
  if (name.startsWith("Служба 101")) return "Служба 101"
  if (name.startsWith("Служба 102")) return "Служба 102"
  if (name.startsWith("Служба 103")) return "Служба 103"
  if (name.startsWith("Служба 104")) return "Служба 104"
  const parenIdx = name.indexOf(" (")
  if (parenIdx > 0) return name.slice(0, parenIdx).trim()
  return name
}

export function matchCanonicalService(query: string): string {
  if (!query) return ""
  const q = query.trim().toLowerCase()

  // Exact or startsWith in DEFAULT_SERVICES_LIST
  for (const svc of DEFAULT_SERVICES_LIST) {
    const sLower = svc.toLowerCase()
    if (sLower === q || sLower.startsWith(q)) {
      return svc
    }
  }

  // Check key markers (excluding reference/informational requests like справка)
  if (
    q === "101" ||
    (q.includes("101") && !q.includes("справка")) ||
    q.includes("мчс") ||
    (q.includes("пожар") && !q.includes("справка"))
  ) {
    return SERVICE_101
  }
  if (
    q === "102" ||
    (q.includes("102") && !q.includes("справка")) ||
    q.includes("мвд") ||
    q.includes("полиц") ||
    q.includes("правопоряд")
  ) {
    return SERVICE_102
  }
  if (
    q === "103" ||
    (q.includes("103") && !q.includes("справка")) ||
    q.includes("скор") ||
    q.includes("пучков")
  ) {
    return SERVICE_103
  }
  if (
    q === "104" ||
    (q.includes("104") && !q.includes("справка")) ||
    q.includes("мосгаз") ||
    (q.includes("газ") && !q.includes("газификац"))
  ) {
    return SERVICE_104
  }
  if (q.includes("цодд")) {
    return DEFAULT_SERVICES_LIST.find((s) => s.includes("ЦОДД")) || ""
  }
  if (q.includes("гормост")) {
    return DEFAULT_SERVICES_LIST.find((s) => s.includes("Гормост")) || ""
  }
  if (q.includes("мосгортранс") || q.includes("транспорт")) {
    return DEFAULT_SERVICES_LIST.find((s) => s.includes("Мосгортранс")) || ""
  }
  if (q.includes("автодороги")) {
    return DEFAULT_SERVICES_LIST.find((s) => s.includes("Автодороги")) || ""
  }
  if (q.includes("мосводоканал")) {
    return DEFAULT_SERVICES_LIST.find((s) => s.includes("Мосводоканал")) || ""
  }
  if (q.includes("моэк")) {
    return DEFAULT_SERVICES_LIST.find((s) => s.includes("МОЭК")) || ""
  }
  if (q.includes("жкх")) {
    return DEFAULT_SERVICES_LIST.find((s) => s.includes("ЖКХ")) || ""
  }
  if (q.includes("метро") || q.includes("мцк")) {
    return DEFAULT_SERVICES_LIST.find((s) => s.includes("Метро")) || ""
  }
  if (q.includes("мослифт") || q.includes("лифт")) {
    return DEFAULT_SERVICES_LIST.find((s) => s.includes("Мослифт")) || ""
  }
  if (q.includes("мосводосток")) {
    return DEFAULT_SERVICES_LIST.find((s) => s.includes("Мосводосток")) || ""
  }
  if (q.includes("москоллектор") || q.includes("коллектор")) {
    return DEFAULT_SERVICES_LIST.find((s) => s.includes("Москоллектор")) || ""
  }
  if (q.includes("мжд") || q.includes("железн")) {
    return DEFAULT_SERVICES_LIST.find((s) => s.includes("МЖД")) || ""
  }
  if (q.includes("ветеринар")) {
    return DEFAULT_SERVICES_LIST.find((s) => s.includes("ветеринарии")) || ""
  }
  if (q.includes("цса") || q.includes("социальн")) {
    return DEFAULT_SERVICES_LIST.find((s) => s.includes("ЦСА")) || ""
  }
  if (q.includes("фсб")) {
    return DEFAULT_SERVICES_LIST.find((s) => s.includes("ФСБ")) || ""
  }
  if (q.includes("цэмп")) {
    return DEFAULT_SERVICES_LIST.find((s) => s.includes("ЦЭМП")) || ""
  }

  // Any substring match in list
  const subMatch = DEFAULT_SERVICES_LIST.find((svc) => svc.toLowerCase().includes(q))
  if (subMatch) return subMatch

  // Never return an arbitrary string (like "Отмена вызова") as a service!
  return ""
}

export function calculateLocalServices(params: {
  finalType?: string | null
  category?: string | null
  hasVictims?: boolean
  isBlocked?: boolean
  isFire?: boolean
  tags?: string[]
}): string[] {
  const finalType = (params.finalType || "").trim()
  const category = (params.category || "").trim()
  const tags = params.tags || []
  const text = `${finalType} ${category} ${tags.join(" ")}`.toLowerCase()

  // If incident is non-emergency and no emergency factors are set, recommend no services
  const isNonEmergency = NON_EMERGENCY_INCIDENT_TYPES.some((ne) => text.includes(ne))
  if (isNonEmergency && !params.isFire && !params.hasVictims && !params.isBlocked) {
    return []
  }

  const result: string[] = []

  // Base rule 1: Fire / 101
  if (
    params.isFire ||
    (text.includes("101") && !text.includes("справка-101")) ||
    text.includes("пожар") ||
    text.includes("задымлен") ||
    text.includes("пламя") ||
    text.includes("взрыв") ||
    text.includes("гари")
  ) {
    result.push(SERVICE_101)
  }

  // Base rule 2: Police / 102
  if (
    (text.includes("102") && !text.includes("справка-102")) ||
    text.includes("полици") ||
    text.includes("правопоряд") ||
    text.includes("драка") ||
    text.includes("граждане с оружием") ||
    text.includes("заложники") ||
    text.includes("подозрительный предмет") ||
    text.includes("краж")
  ) {
    result.push(SERVICE_102)
  }

  // Base rule 3: Medical / 103
  if (
    params.hasVictims ||
    (text.includes("103") && !text.includes("справка-103")) ||
    text.includes("скор") ||
    text.includes("пострадав") ||
    text.includes("травм") ||
    text.includes("медицинская помощь: да")
  ) {
    result.push(SERVICE_103)
  }

  // Base rule 4: Gas / 104
  if (
    text.includes("104") ||
    text.includes("газ") ||
    text.includes("газовая колонка") ||
    text.includes("газовая плита") ||
    text.includes("газификация: да")
  ) {
    result.push(SERVICE_104)
  }

  // Blocked person / door requires rescue (101)
  if (
    params.isBlocked ||
    text.includes("заблокир") ||
    text.includes("придавил") ||
    text.includes("нет доступа")
  ) {
    if (!result.includes(SERVICE_101)) {
      result.push(SERVICE_101)
    }
  }

  // Traffic / Roads / DTP
  if (
    text.includes("дтп") ||
    text.includes("дорог") ||
    text.includes("цодд") ||
    text.includes("проблемы на дороге")
  ) {
    const codd = DEFAULT_SERVICES_LIST.find((s) => s.includes("ЦОДД"))
    if (codd && !result.includes(codd)) result.push(codd)
  }

  // Bridges / Tunnels -> Gormost
  if (text.includes("мост") || text.includes("тоннель") || text.includes("эстакада")) {
    const gormost = DEFAULT_SERVICES_LIST.find((s) => s.includes("Гормост"))
    if (gormost && !result.includes(gormost)) result.push(gormost)
    const codd = DEFAULT_SERVICES_LIST.find((s) => s.includes("ЦОДД"))
    if (codd && !result.includes(codd)) result.push(codd)
  }

  // Public Transport
  if (
    text.includes("автобус") ||
    text.includes("электробус") ||
    text.includes("трамвай") ||
    text.includes("мосгортранс")
  ) {
    const mgt = DEFAULT_SERVICES_LIST.find((s) => s.includes("Мосгортранс"))
    if (mgt && !result.includes(mgt)) result.push(mgt)
  }

  // Metro / MCC
  if (text.includes("метро") || text.includes("мцк")) {
    const metro = DEFAULT_SERVICES_LIST.find((s) => s.includes("Метро"))
    if (metro && !result.includes(metro)) result.push(metro)
    if (!result.includes(SERVICE_101)) {
      result.push(SERVICE_101)
    }
  }

  // Water / sewage
  if (text.includes("водоканал") || text.includes("прорыв воды")) {
    const mvk = DEFAULT_SERVICES_LIST.find((s) => s.includes("Мосводоканал"))
    if (mvk && !result.includes(mvk)) result.push(mvk)
  }

  // Elevator
  if (text.includes("лифт")) {
    const lift = DEFAULT_SERVICES_LIST.find((s) => s.includes("Мослифт"))
    if (lift && !result.includes(lift)) result.push(lift)
    if (!result.includes(SERVICE_101)) {
      result.push(SERVICE_101)
    }
  }

  // Social help
  if (text.includes("социальн") || text.includes("цса")) {
    const csa = DEFAULT_SERVICES_LIST.find((s) => s.includes("ЦСА"))
    if (csa && !result.includes(csa)) result.push(csa)
  }

  // Animal incidents
  if (text.includes("животн") || text.includes("ветеринар")) {
    const vet = DEFAULT_SERVICES_LIST.find((s) => s.includes("ветеринарии"))
    if (vet && !result.includes(vet)) result.push(vet)
  }

  // Fallback ONLY if finalType explicitly maps to a known service in DEFAULT_SERVICES_LIST
  if (result.length === 0 && finalType && !isNonEmergency) {
    const canonical = matchCanonicalService(finalType)
    if (canonical && DEFAULT_SERVICES_LIST.includes(canonical)) {
      result.push(canonical)
    }
  }

  return Array.from(new Set(result))
}
