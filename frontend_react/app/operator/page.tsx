"use client"

import { useState, useEffect } from "react"
import { OperatorTopBar } from "@/components/operator/top-bar"
import { OperatorLeftPanel } from "@/components/operator/left-panel"
import { OperatorRightPanel } from "@/components/operator/right-panel"
import { OperatorBottomBar, type OperatorService } from "@/components/operator/bottom-bar"
import {
  CheckCircle2,
  X,
  Phone,
  PhoneOff,
  AlertTriangle,
  FileText,
  Clock,
  Link2,
  Bell,
  MessageSquare,
  Globe,
  HelpCircle,
  MapPin,
  Flame,
  Shield,
  Stethoscope,
  Wrench,
  Truck,
  Plus,
} from "lucide-react"

type ModalType =
  | "save"
  | "hangup"
  | "call_records"
  | "sms_list"
  | "msg"
  | "translate"
  | "add_incident"
  | "add_service"
  | "links"
  | "timer"
  | "alerts"
  | "chat"
  | "close"
  | null

export default function OperatorPage() {
  // 1. Elapsed timer starting from 16s (matching reference photo 00:16)
  const [elapsedSeconds, setElapsedSeconds] = useState(16)
  const [isCallActive, setIsCallActive] = useState(true)

  useEffect(() => {
    if (!isCallActive) return
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [isCallActive])

  // 2. Phone numbers in top slots
  const [aonPhone, setAonPhone] = useState("+7 (903) 123-45-67")
  const [providedPhone, setProvidedPhone] = useState("+7 ( )  - -")
  const [onSitePhone, setOnSitePhone] = useState("+7 ( )  - -")

  // 3. Caller & Address State (Pre-filled matching the reference photo)
  const [callerName, setCallerName] = useState("")
  const [callerStatus, setCallerStatus] = useState("")
  const [fullAddressString, setFullAddressString] = useState("Россия, Москва, Ясный проезд, 10")
  const [address, setAddress] = useState({
    country: "Россия",
    subject: "Москва",
    city: "Москва",
    objectName: "",
    okrug: "СВАО",
    district: "Южное Медведково",
    street: "Ясный проезд",
    house: "10",
    building: "",
    structure: "",
    apartment: "",
    entrance: "",
    floor: "",
    doorCode: "",
    description: "",
  })

  // 4. Incident Description (Фабула со слов заявителя)
  const [incidentDescription, setIncidentDescription] = useState("")

  // 5. Quick Status Buttons (Пострадавшие, Отказ от скорой, Заблокированные, нет контакта, срыв)
  const [topStatuses, setTopStatuses] = useState<Record<string, boolean>>({
    victims: false,
    refusal: false,
    blocked: false,
    no_contact: false,
    call_dropped: false,
  })
  const toggleTopStatus = (id: string) => {
    setTopStatuses((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // 6. Questionnaire Pills (Pre-set matching the reference photo: Дом, Открытое пламя, балкон)
  const [selectedPills, setSelectedPills] = useState<Record<string, boolean>>({
    where_Дом: true,
    "fire_Открытое пламя": true,
    house_flame_балкон: true,
  })
  const togglePill = (id: string) => {
    setSelectedPills((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // 7. Assigned Services (Matching reference photo)
  const [services, setServices] = useState<OperatorService[]>([
    { id: "102", name: "Служба 102", isGray: true },
    { id: "101", name: "Служба 101", isGray: false },
    { id: "omvd", name: "ОМВД", isGray: true },
    { id: "codd", name: "ЦОДД", isGray: false },
    { id: "mosbez", name: "Мос.Без.", isGray: false },
    { id: "uprava", name: "Упр. Южное М...", isGray: false },
  ])

  const handleRemoveService = (id: string) => {
    setServices((prev) => prev.filter((s) => s.id !== id))
  }

  // 8. Modals state & Toast feedback
  const [activeModal, setActiveModal] = useState<ModalType>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current))
    }, 3000)
  }

  // Incident title tab
  const [activeIncidentTitle, setActiveIncidentTitle] = useState("Происшествие 101")

  // Copy AON helpers
  const handleCopyAonToProvided = () => {
    setProvidedPhone(aonPhone)
    showToast("Номер АОН скопирован в «предоставленный»")
  }
  const handleCopyAonToOnSite = () => {
    setOnSitePhone(aonPhone)
    showToast("Номер АОН скопирован в «телефон на место»")
  }

  // Action stamps for no-contact and call-dropped
  const handleNoContact = () => {
    const next = !topStatuses.no_contact
    toggleTopStatus("no_contact")
    if (next) {
      setIncidentDescription((prev) =>
        prev
          ? `${prev}\n[Зафиксировано: нет контакта с заявителем]`
          : "[Зафиксировано: нет контакта с заявителем]"
      )
      showToast("Зафиксировано: нет контакта с заявителем")
    }
  }

  const handleCallDropped = () => {
    const next = !topStatuses.call_dropped
    toggleTopStatus("call_dropped")
    if (next) {
      setIncidentDescription((prev) =>
        prev ? `${prev}\n[Зафиксировано: срыв звонка]` : "[Зафиксировано: срыв звонка]"
      )
      showToast("Зафиксировано: срыв звонка")
    }
  }

  // Catalog of available emergency services to add
  const availableServicesList: Array<{ name: string; isGray: boolean; desc: string }> = [
    { name: "Служба 103 (Скорая)", isGray: false, desc: "Скорая медицинская помощь г. Москвы" },
    { name: "Служба 104 (Мосгаз)", isGray: false, desc: "Аварийно-спасательная газовая служба" },
    { name: "ГБУ «Гормост»", isGray: false, desc: "Инженерные сооружения, мосты, тоннели" },
    { name: "АО «Мосводоканал»", isGray: false, desc: "Аварии систем водоснабжения и канализации" },
    { name: "КП «Мосгортранс»", isGray: false, desc: "Диспетчерская служба наземного транспорта" },
    { name: "Управа Южное Медведково", isGray: false, desc: "Районный отдел ЖКХ и благоустройства" },
    { name: "ПСО №204 Метрополитена", isGray: false, desc: "Пожарно-спасательный отряд ГКУ ПСЦ" },
    { name: "Служба 101 (МЧС)", isGray: false, desc: "Пожарно-спасательный гарнизон" },
    { name: "Служба 102 (МВД)", isGray: true, desc: "Дежурная часть ГУ МВД" },
  ]

  const handleAddPredefinedService = (name: string, isGray: boolean) => {
    if (services.some((s) => s.name === name)) {
      showToast(`Служба «${name}» уже добавлена`)
      return
    }
    setServices((prev) => [
      ...prev,
      { id: `svc_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`, name, isGray },
    ])
    showToast(`Служба «${name}» успешно добавлена в карточку`)
    setActiveModal(null)
  }

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden select-none font-sans" style={{ background: "#efefef" }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-[#303335] text-white text-xs px-4 py-2 rounded shadow-lg border border-gray-600 animate-in fade-in slide-in-from-top-2 duration-200">
          {toastMessage}
        </div>
      )}

      {/* Top Bar (Telephony, Numbers, Incident Info, Timer) */}
      <OperatorTopBar
        elapsedSeconds={elapsedSeconds}
        aonPhone={aonPhone}
        providedPhone={providedPhone}
        onSitePhone={onSitePhone}
        onHangup={() => setActiveModal("hangup")}
        onCallRecords={() => setActiveModal("call_records")}
        onSmsList={() => setActiveModal("sms_list")}
        onOpenMsg={() => setActiveModal("msg")}
        onAonInfo={() => showToast("АОН: Определитель номера сотового оператора (ПАО «МТС», Москва)")}
        onMapInfo={() => showToast("Геолокация БС: Москва, СВАО, Ясный проезд, вышка #4182")}
        onProviderInfo={() => showToast("Оператор связи: ПАО «МТС», коммутатор г. Москвы, СОРМ-3")}
        onCopyAonToProvided={handleCopyAonToProvided}
        onCopyAonToOnSite={handleCopyAonToOnSite}
      />

      {/* Main Two-Column Workstation Grid (50 / 50 Desktop Split) */}
      <div className="flex-1 grid grid-cols-2 overflow-hidden" style={{ background: "#efefef" }}>
        {/* Left Column: Caller Information & Structured Address */}
        <div className="h-full overflow-hidden" style={{ borderRight: "1px solid #c9ced1" }}>
          <OperatorLeftPanel
            callerName={callerName}
            setCallerName={setCallerName}
            callerStatus={callerStatus}
            setCallerStatus={setCallerStatus}
            address={address}
            setAddress={setAddress}
            fullAddressString={fullAddressString}
            setFullAddressString={setFullAddressString}
            incidentDescription={incidentDescription}
            setIncidentDescription={setIncidentDescription}
            onTranslate={() => setActiveModal("translate")}
          />
        </div>

        {/* Right Column: Emergency Actions & Questionnaire Pills */}
        <div className="h-full overflow-hidden">
          <OperatorRightPanel
            selectedPills={selectedPills}
            togglePill={togglePill}
            topStatuses={topStatuses}
            toggleTopStatus={toggleTopStatus}
            onNoContact={handleNoContact}
            onCallDropped={handleCallDropped}
            onAddIncidentType={() => setActiveModal("add_incident")}
            onCloseIncident={() => setActiveModal("close")}
            activeIncidentTitle={activeIncidentTitle}
          />
        </div>
      </div>

      {/* Bottom Bar: Wide & Roomy Services Bar (min-height 64px, safe at 133% zoom) */}
      <OperatorBottomBar
        services={services}
        onRemoveService={handleRemoveService}
        onAddService={() => setActiveModal("add_service")}
        onSave={() => setActiveModal("save")}
        onOpenLinks={() => setActiveModal("links")}
        onOpenTimer={() => setActiveModal("timer")}
        onOpenAlerts={() => setActiveModal("alerts")}
        onOpenChat={() => setActiveModal("chat")}
        onCloseCard={() => setActiveModal("close")}
      />

      {/* ==================== INTERACTIVE MODALS ==================== */}

      {/* 1. Modal: Save & Finalize Incident Card */}
      {activeModal === "save" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded shadow-2xl p-6 max-w-lg w-full flex flex-col gap-4 border border-gray-300 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-7 w-7 text-emerald-600 shrink-0" />
                <div>
                  <h3 className="text-base font-bold text-gray-900">Карточка происшествия #913126</h3>
                  <p className="text-xs text-gray-500">Готова к сохранению и передаче в ДДС экстренных служб</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-gray-400 hover:text-gray-700 cursor-pointer p-1"
              >
                <X size={20} />
              </button>
            </div>

            <div className="text-xs text-gray-800 bg-gray-50 p-3.5 rounded border border-gray-200 flex flex-col gap-2">
              <div><b>Адрес происшествия:</b> {fullAddressString || "Не указан"}</div>
              <div><b>Заявитель:</b> {callerName || "Аноним"} ({callerStatus || "статус не выбран"})</div>
              <div><b>Назначено служб ({services.length}):</b> {services.map((s) => s.name).join(", ")}</div>
              <div><b>Выбранные признаки:</b> {Object.keys(selectedPills).filter((k) => selectedPills[k]).map((k) => k.replace(/^[a-z]+_/, "")).join(", ") || "не выбраны"}</div>
              <div><b>Хронометраж приёма:</b> {Math.floor(elapsedSeconds / 60)} мин {elapsedSeconds % 60} сек (Норматив ≤ 90 сек: {elapsedSeconds <= 90 ? "✅ Соблюден" : "⚠️ Превышен"})</div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded text-xs font-semibold hover:bg-gray-100 cursor-pointer transition"
              >
                Вернуться к редактированию
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveModal(null)
                  showToast("Карточка #913126 успешно передана в дежурные службы!")
                }}
                className="px-5 py-2 bg-[#d64e23] text-white rounded text-xs font-bold hover:brightness-110 cursor-pointer shadow transition"
              >
                Передать в службы
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Modal: Hang Up Call */}
      {activeModal === "hangup" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded shadow-2xl p-6 max-w-md w-full flex flex-col gap-4 border border-gray-300">
            <div className="flex items-center gap-3 border-b pb-3">
              <PhoneOff className="h-6 w-6 text-red-600 shrink-0" />
              <h3 className="text-base font-bold text-gray-900">Завершение телефонного соединения</h3>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              Вы хотите завершить активный вызов с заявителем? Разговор длится {Math.floor(elapsedSeconds / 60)} мин {elapsedSeconds % 60} сек. Карточка происшествия останется открытой для дозаполнения.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-1.5 border border-gray-300 text-gray-700 rounded text-xs font-semibold hover:bg-gray-100 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCallActive(false)
                  setActiveModal(null)
                  showToast("Вызов завершен оператором")
                }}
                className="px-4 py-1.5 bg-red-600 text-white rounded text-xs font-bold hover:bg-red-700 cursor-pointer"
              >
                Положить трубку
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Modal: Call Recordings Archive */}
      {activeModal === "call_records" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded shadow-2xl p-6 max-w-lg w-full flex flex-col gap-4 border border-gray-300">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-bold text-gray-900">Записи телефонных разговоров АРМ-7</h3>
              <button type="button" onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-700 p-1">
                <X size={18} />
              </button>
            </div>
            <div className="divide-y text-xs text-gray-700 max-h-60 overflow-y-auto">
              <div className="py-2.5 flex items-center justify-between">
                <div>
                  <div className="font-semibold">09:04:37 — {aonPhone} (Текущий вызов)</div>
                  <div className="text-gray-500">Ясный проезд 10, открытое пламя на балконе</div>
                </div>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-medium">В эфире</span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <div>
                  <div className="font-semibold">08:48:12 — +7 (495) 912-34-56 (Завершён)</div>
                  <div className="text-gray-500">Полярная ул. 14, ДТП без пострадавших (1 мин 18 с)</div>
                </div>
                <button
                  type="button"
                  onClick={() => showToast("Воспроизведение аудиозаписи...")}
                  className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 border rounded text-[11px] font-medium cursor-pointer"
                >
                  ▷ Слушать
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Modal: Emergency SMS List */}
      {activeModal === "sms_list" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded shadow-2xl p-6 max-w-lg w-full flex flex-col gap-4 border border-gray-300">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-bold text-gray-900">Экстренные SMS-сообщения (Служба-112)</h3>
              <button type="button" onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-700 p-1">
                <X size={18} />
              </button>
            </div>
            <div className="text-xs text-gray-700 space-y-2">
              <div className="p-2.5 bg-gray-50 border rounded">
                <div className="flex justify-between font-semibold text-gray-900">
                  <span>От: +7 (903) 123-45-67</span>
                  <span className="text-gray-500">09:02:15</span>
                </div>
                <div className="mt-1 text-gray-800">«Пожар на балконе 4 этажа, Ясный проезд дом 10, срочно пожарных!»</div>
                <div className="mt-1 text-[11px] text-blue-600">Координаты: 55.8641° N, 37.6412° E</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Modal: Send Service SMS / Message */}
      {activeModal === "msg" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded shadow-2xl p-6 max-w-md w-full flex flex-col gap-4 border border-gray-300">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-bold text-gray-900">Служебное SMS заявителю</h3>
              <button type="button" onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-700 p-1">
                <X size={18} />
              </button>
            </div>
            <div className="flex flex-col gap-2 text-xs">
              <label className="text-gray-600">Номер абонента:</label>
              <input
                type="text"
                value={aonPhone}
                readOnly
                className="p-2 bg-gray-100 border rounded font-mono text-gray-800"
              />
              <label className="text-gray-600 mt-1">Текст сообщения:</label>
              <textarea
                defaultValue="Служба-112 Москвы приняла ваш вызов. Экстренные службы направлены на Ясный проезд, 10. Оставайтесь в безопасном месте."
                rows={3}
                className="p-2 border rounded text-xs outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-3 py-1.5 border text-gray-700 rounded text-xs hover:bg-gray-50 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveModal(null)
                  showToast("SMS успешно отправлено абоненту")
                }}
                className="px-4 py-1.5 bg-[#157dbd] text-white rounded text-xs font-bold hover:bg-[#126fa8] cursor-pointer"
              >
                Отправить SMS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Modal: Inter-language & Sign Translation Service */}
      {activeModal === "translate" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded shadow-2xl p-6 max-w-md w-full flex flex-col gap-4 border border-gray-300">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <Globe className="text-blue-600" size={20} />
                <h3 className="text-sm font-bold text-gray-900">Служба межъязыкового перевода 112</h3>
              </div>
              <button type="button" onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-700 p-1">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-gray-600">
              Выберите язык для подключения оператора-лингвиста или сурдопереводчика к трехсторонней конференции:
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {["Английский", "Узбекский", "Таджикский", "Киргизский", "Китайский", "Русский жестовый (РЖЯ)"].map(
                (lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => {
                      setActiveModal(null)
                      showToast(`Подключен переводчик: ${lang}`)
                    }}
                    className="p-2.5 text-left border rounded hover:border-blue-500 hover:bg-blue-50 transition cursor-pointer font-medium text-gray-800"
                  >
                    🌐 {lang}
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* 7. Modal: Add Incident Type Classifier (ЕКП) */}
      {activeModal === "add_incident" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded shadow-2xl p-6 max-w-md w-full flex flex-col gap-4 border border-gray-300">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-bold text-gray-900">Добавить категорию происшествия (ЕКП)</h3>
              <button type="button" onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-700 p-1">
                <X size={18} />
              </button>
            </div>
            <div className="flex flex-col gap-2 text-xs max-h-72 overflow-y-auto">
              {[
                { title: "Происшествие 101", desc: "Пожары, задымления, возгорания, ЧС", icon: Flame },
                { title: "Происшествие 102", desc: "Охрана правопорядка, драка, кража, ДТП", icon: Shield },
                { title: "Происшествие 103", desc: "Угроза жизни, травмы, скорая помощь", icon: Stethoscope },
                { title: "Происшествие 104", desc: "Запах газа, утечка, аварии на сетях Мосгаз", icon: Wrench },
                { title: "Происшествие ЦОДД", desc: "Светофоры, заторы, падение деревьев на ПЧ", icon: Truck },
              ].map((item) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => {
                    setActiveIncidentTitle(item.title)
                    setActiveModal(null)
                    showToast(`Выбрана категория: ${item.title}`)
                  }}
                  className="flex items-center gap-3 p-3 border rounded hover:border-blue-500 hover:bg-blue-50 transition cursor-pointer text-left"
                >
                  <item.icon size={22} className="text-blue-600 shrink-0" />
                  <div>
                    <div className="font-bold text-gray-900">{item.title}</div>
                    <div className="text-gray-500 text-[11px]">{item.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 8. Modal: Add Emergency Service */}
      {activeModal === "add_service" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded shadow-2xl p-6 max-w-lg w-full flex flex-col gap-4 border border-gray-300">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <Plus size={18} className="text-[#ec653b]" />
                <h3 className="text-sm font-bold text-gray-900">Назначить службу экстренного реагирования</h3>
              </div>
              <button type="button" onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-700 p-1">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-72 overflow-y-auto text-xs">
              {availableServicesList.map((svc) => (
                <button
                  key={svc.name}
                  type="button"
                  onClick={() => handleAddPredefinedService(svc.name, svc.isGray)}
                  className="p-2.5 border rounded text-left hover:border-[#ec653b] hover:bg-orange-50 transition cursor-pointer flex flex-col justify-between gap-1"
                >
                  <div className="font-bold text-gray-900">{svc.name}</div>
                  <div className="text-[11px] text-gray-500">{svc.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 9. Modal: Links and Incident Duplicates */}
      {activeModal === "links" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded shadow-2xl p-6 max-w-md w-full flex flex-col gap-4 border border-gray-300">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <Link2 size={18} className="text-blue-600" />
                <h3 className="text-sm font-bold text-gray-900">Связанные карточки и дубли</h3>
              </div>
              <button type="button" onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-700 p-1">
                <X size={18} />
              </button>
            </div>
            <div className="text-xs text-gray-700 space-y-2">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                <div className="font-bold text-blue-950">Дубликат найден: Карточка #913120</div>
                <div className="text-blue-800 text-[11px] mt-0.5">09:01:14 — Звонок от жильца с 5 этажа (Ясный пр. 10)</div>
                <div className="text-blue-700 text-[11px] mt-1 font-medium">Статус в ДДС 101: «В пути (АЦ-3.2)»</div>
              </div>
              <p className="text-[11px] text-gray-500">
                Карточка автоматически связана с основным инцидентом для предотвращения повторной высылки избыточных сил.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 10. Modal: Call Timeline (Хронометраж) */}
      {activeModal === "timer" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded shadow-2xl p-6 max-w-md w-full flex flex-col gap-4 border border-gray-300">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <Clock size={18} className="text-blue-600" />
                <h3 className="text-sm font-bold text-gray-900">Хронометраж этапов вызова</h3>
              </div>
              <button type="button" onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-700 p-1">
                <X size={18} />
              </button>
            </div>
            <div className="divide-y text-xs text-gray-700">
              <div className="py-2 flex justify-between">
                <span>Поступление вызова в АТС:</span>
                <span className="font-mono font-bold">09:04:21</span>
              </div>
              <div className="py-2 flex justify-between">
                <span>Снятие трубки оператором (АРМ-7):</span>
                <span className="font-mono font-bold">09:04:37 (16 сек)</span>
              </div>
              <div className="py-2 flex justify-between">
                <span>Текущая длительность опроса:</span>
                <span className="font-mono font-bold text-blue-600">
                  {Math.floor(elapsedSeconds / 60)} мин {elapsedSeconds % 60} сек
                </span>
              </div>
              <div className="py-2 flex justify-between">
                <span>Регламентный норматив 112:</span>
                <span className="font-mono font-bold text-emerald-600">≤ 90 секунд</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 11. Modal: Operational Alerts */}
      {activeModal === "alerts" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded shadow-2xl p-6 max-w-md w-full flex flex-col gap-4 border border-gray-300">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <Bell size={18} className="text-amber-500" />
                <h3 className="text-sm font-bold text-gray-900">Оперативные оповещения смены</h3>
              </div>
              <button type="button" onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-700 p-1">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-2 text-xs text-gray-700">
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded">
                <div className="font-bold text-amber-900">Метеопредупреждение МЧС</div>
                <div className="text-amber-800 text-[11px] mt-0.5">Усиление порывов ветра до 18 м/с в северных округах Москвы.</div>
              </div>
              <div className="p-2.5 bg-gray-50 border rounded">
                <div className="font-bold text-gray-900">Регламент ЕКП 2025</div>
                <div className="text-gray-600 text-[11px] mt-0.5">Обязательное внесение подъезда и этажа при пожаре в жилом секторе.</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 12. Modal: Operator Shift Chat */}
      {activeModal === "chat" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded shadow-2xl p-6 max-w-md w-full flex flex-col gap-3 border border-gray-300">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <MessageSquare size={18} className="text-blue-600" />
                <h3 className="text-sm font-bold text-gray-900">Служебный чат смены 112</h3>
              </div>
              <button type="button" onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-700 p-1">
                <X size={18} />
              </button>
            </div>
            <div className="bg-gray-50 p-3 rounded border text-xs h-48 overflow-y-auto space-y-2">
              <div className="bg-white p-2 rounded shadow-xs border">
                <span className="font-bold text-blue-700">Старший смены:</span> Все АРМ, обратите внимание на возгорание на Ясном проезде, службы оповещены.
              </div>
              <div className="bg-white p-2 rounded shadow-xs border">
                <span className="font-bold text-emerald-700">ДДС-101:</span> АЦ 22 ПСЧ выехала к дому 10.
              </div>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Сообщение старшему оператору..."
                className="flex-1 text-xs border rounded p-2 outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => showToast("Сообщение отправлено")}
                className="px-3 py-1.5 bg-gray-800 text-white rounded text-xs font-semibold cursor-pointer"
              >
                Отправить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 13. Modal: Close Incident Confirmation */}
      {activeModal === "close" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded shadow-2xl p-6 max-w-sm w-full flex flex-col gap-4 border border-gray-300">
            <div className="flex items-center gap-3 border-b pb-3">
              <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0" />
              <h3 className="text-base font-bold text-gray-900">Закрыть карточку вызова?</h3>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              Вы действительно хотите закрыть карточку #913126? Все несохраненные данные будут сброшены.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-1.5 border rounded text-xs font-semibold text-gray-700 hover:bg-gray-100 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveModal(null)
                  showToast("Карточка закрыта")
                }}
                className="px-4 py-1.5 bg-red-600 text-white rounded text-xs font-bold hover:bg-red-700 cursor-pointer"
              >
                Закрыть без сохранения
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
