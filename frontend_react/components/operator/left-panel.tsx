"use client"

import { useState, useEffect } from "react"
import { X, ChevronDown, Languages, MapPin } from "lucide-react"
import { useCallStore } from "@/store/useCallStore"

const border = "#c9ced1"
const slate = "#49555d"
const muted = "#9aa3a9"

type AddressData = {
  country: string
  subject: string
  city: string
  objectName: string
  okrug: string
  district: string
  street: string
  house: string
  building: string
  structure: string
  apartment: string
  entrance: string
  floor: string
  doorCode: string
  description: string
}

type Props = {
  callerName: string
  setCallerName: (v: string) => void
  callerStatus: string
  setCallerStatus: (v: string) => void
  address: AddressData
  setAddress: React.Dispatch<React.SetStateAction<AddressData>>
  fullAddressString: string
  setFullAddressString: (v: string) => void
  incidentDescription: string
  setIncidentDescription: (v: string) => void
  onTranslate?: () => void
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
}) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[11px] mb-0.5" style={{ color: muted }}>
        {label}
      </span>
      <div className="flex items-center" style={{ borderBottom: `1px solid ${border}`, minHeight: 24 }}>
        <input
          type="text"
          value={value}
          onChange={onChange}
          placeholder={placeholder || ""}
          className="w-full text-[14px] bg-transparent outline-none truncate"
          style={{ color: value ? slate : "#b7bec3" }}
        />
      </div>
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void
  options: string[]
}) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[11px] mb-0.5" style={{ color: muted }}>
        {label}
      </span>
      <div className="flex items-center justify-between relative" style={{ borderBottom: `1px solid ${border}`, minHeight: 24 }}>
        <select
          value={value}
          onChange={onChange}
          className="w-full text-[14px] bg-transparent outline-none appearance-none cursor-pointer pr-4 truncate font-medium"
          style={{ color: slate }}
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <ChevronDown size={14} color={muted} className="absolute right-0 pointer-events-none shrink-0" />
      </div>
    </div>
  )
}

export const DISTRICTS_BY_OKRUG: Record<string, string[]> = {
  "СВАО": [
    "Южное Медведково",
    "Северное Медведково",
    "Бабушкинский",
    "Бибирево",
    "Отрадное",
    "Свиблово",
    "Алексеевский",
    "Останкинский",
    "Лосиноостровский",
    "Ярославский",
    "Бутырский",
    "Лианозово",
    "Алтуфьевский",
    "Марфино",
    "Марьина Роща",
    "Ростокино",
    "Северный",
  ],
  "ЦАО": [
    "Арбат",
    "Басманный",
    "Замоскворечье",
    "Красносельский",
    "Мещанский",
    "Пресненский",
    "Таганский",
    "Тверской",
    "Хамовники",
    "Якиманка",
  ],
  "ЮАО": [
    "Чертаново Северное",
    "Чертаново Центральное",
    "Чертаново Южное",
    "Орехово-Борисово Северное",
    "Орехово-Борисово Южное",
    "Бирюлево Восточное",
    "Бирюлево Западное",
    "Царицыно",
    "Нагатино-Садовники",
    "Нагатинский Затон",
    "Даниловский",
    "Донской",
    "Братеево",
    "Зябликово",
    "Москворечье-Сабурово",
    "Нагорный",
  ],
  "ЗАО": [
    "Раменки",
    "Дорогомилово",
    "Фили-Давыдково",
    "Филевский Парк",
    "Крылатское",
    "Кунцево",
    "Можайский",
    "Ново-Переделкино",
    "Очаково-Матвеевское",
    "Солнцево",
    "Тропарево-Никулино",
    "Проспект Вернадского",
    "Внуково",
  ],
  "САО": [
    "Аэропорт",
    "Беговой",
    "Бескудниковский",
    "Войковский",
    "Головинский",
    "Дегунино Восточное",
    "Дегунино Западное",
    "Дмитровский",
    "Коптево",
    "Левобережный",
    "Молжаниновский",
    "Савеловский",
    "Сокол",
    "Тимирязевский",
    "Ховрино",
    "Хорошевский",
  ],
  "ВАО": [
    "Богородское",
    "Вешняки",
    "Восточное Измайлово",
    "Гольяново",
    "Ивановское",
    "Измайлово",
    "Косино-Ухтомский",
    "Метрогородок",
    "Новогиреево",
    "Новокосино",
    "Перово",
    "Преображенское",
    "Северное Измайлово",
    "Соколиная Гора",
    "Сокольники",
  ],
  "ЮВАО": [
    "Выхино-Жулебино",
    "Капотня",
    "Кузьминки",
    "Лефортово",
    "Люблино",
    "Марьино",
    "Некрасовка",
    "Нижегородский",
    "Печатники",
    "Рязанский",
    "Текстильщики",
    "Южнопортовый",
  ],
  "ЮЗАО": [
    "Академический",
    "Гагаринский",
    "Зюзино",
    "Коньково",
    "Котловка",
    "Ломоносовский",
    "Обручевский",
    "Северное Бутово",
    "Теплый Стан",
    "Черемушки",
    "Южное Бутово",
    "Ясенево",
  ],
  "СЗАО": [
    "Куркино",
    "Митино",
    "Покровское-Стрешнево",
    "Строгино",
    "Северное Тушино",
    "Южное Тушино",
    "Хорошево-Мневники",
    "Щукино",
  ],
  "ЗелАО": [
    "Крюково",
    "Матушкино",
    "Савелки",
    "Силино",
    "Старое Крюково",
  ],
  "ТиНАО": [
    "Московский",
    "Щербинка",
    "Троицк",
    "Сосенское",
    "Внуковское",
    "Воскресенское",
    "Десеновское",
    "Кокошкино",
    "Марушкинское",
  ],
}

const MOCK_ADDRESSES = [
  { street: "Тверская улица", okrug: "ЦАО", district: "Тверской" },
  { street: "Новый Арбат", okrug: "ЦАО", district: "Арбат" },
  { street: "Проспект Мира", okrug: "СВАО", district: "Алексеевский" },
  { street: "Ленинский проспект", okrug: "ЮЗАО", district: "Гагаринский" },
  { street: "Профсоюзная улица", okrug: "ЮЗАО", district: "Академический" },
  { street: "Кутузовский проспект", okrug: "ЗАО", district: "Дорогомилово" },
  { street: "Рублевское шоссе", okrug: "ЗАО", district: "Кунцево" },
  { street: "Ленинградский проспект", okrug: "САО", district: "Аэропорт" },
  { street: "Щелковское шоссе", okrug: "ВАО", district: "Гольяново" },
  { street: "Варшавское шоссе", okrug: "ЮАО", district: "Чертаново Северное" }
]

function StreetAutocompleteField({
  label,
  value,
  onChange,
  onSelectAddress,
  hideBorder = false,
}: {
  label?: string
  value: string
  onChange: (val: string) => void
  onSelectAddress: (street: string, okrug: string, district: string) => void
  hideBorder?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<{street: string, okrug: string, district: string}[]>([])
  
  useEffect(() => {
    if (!value || value.length < 2) {
      setSuggestions([])
      return
    }
    const timer = setTimeout(() => {
      fetch(`/api/v1/addresses?q=${encodeURIComponent(value)}`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setSuggestions(data)
          } else if (data.items && Array.isArray(data.items)) {
            setSuggestions(data.items)
          }
        })
        .catch(err => console.error("Error fetching addresses:", err))
    }, 300)
    return () => clearTimeout(timer)
  }, [value])

  return (
    <div className="flex flex-col min-w-0 relative">
      {label && (
        <span className="text-[11px] mb-0.5" style={{ color: muted }}>
          {label}
        </span>
      )}
      <div className="flex items-center" style={{ borderBottom: hideBorder ? "none" : `1px solid ${border}`, minHeight: 24 }}>
        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          className="w-full text-[14px] bg-transparent outline-none truncate"
          style={{ color: value ? slate : "#b7bec3" }}
        />
      </div>
      {isOpen && suggestions.length > 0 && (
        <div className="absolute top-[100%] left-0 w-full bg-white shadow-md border rounded-b-md mt-1 z-50 max-h-40 overflow-y-auto" style={{ borderColor: border }}>
          {suggestions.map((addr, idx) => (
            <div
              key={`${addr.street}-${addr.district}-${idx}`}
              className="px-2 py-1.5 text-[13px] hover:bg-gray-100 cursor-pointer"
              style={{ color: slate }}
              onClick={() => {
                onSelectAddress(addr.street, addr.okrug, addr.district)
                setIsOpen(false)
              }}
            >
              <div className="font-medium">{addr.street}</div>
              <div className="text-[10px] text-gray-500">{addr.okrug}, {addr.district}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export const CALLER_STATUSES = [
  "очевидец",
  "пострадавший",
  "родственник",
  "знакомый",
  "ребенок",
  "участник",
]

export function OperatorLeftPanel({
  callerName,
  setCallerName,
  callerStatus,
  setCallerStatus,
  address,
  setAddress,
  fullAddressString,
  setFullAddressString,
  incidentDescription,
  setIncidentDescription,
  onTranslate,
}: Props) {
  const currentDistricts = DISTRICTS_BY_OKRUG[address.okrug] || ["Южное Медведково"]

  const handleOkrugChange = (newOkrug: string) => {
    const districts = DISTRICTS_BY_OKRUG[newOkrug] || []
    const newDistrict = districts.includes(address.district)
      ? address.district
      : districts[0] || ""
    setAddress((prev) => ({
      ...prev,
      okrug: newOkrug,
      district: newDistrict,
    }))
  }

  const handleClearAddress = () => {
    setFullAddressString("")
    setAddress({
      country: "Россия",
      subject: "Москва",
      city: "Москва",
      objectName: "",
      okrug: "СВАО",
      district: "Южное Медведково",
      street: "",
      house: "",
      building: "",
      structure: "",
      apartment: "",
      entrance: "",
      floor: "",
      doorCode: "",
      description: "",
    })
  }

  return (
    <div className="flex flex-col gap-2.5 p-3 overflow-y-auto h-full" style={{ background: "#fff" }}>
      {/* 1. Верхний ряд: ФИО, статус заявителя, перевод */}
      <div className="flex items-center gap-3">
        <div className="flex-1" style={{ borderBottom: `1px solid ${border}`, paddingBottom: 2 }}>
          <input
            type="text"
            value={callerName}
            onChange={(e) => setCallerName(e.target.value)}
            placeholder="Фамилия и имя заявителя"
            className="w-full text-[15px] bg-transparent outline-none placeholder-[#b7bec3]"
            style={{ color: slate }}
          />
        </div>

        <div
          className="flex items-center gap-1.5 relative"
          style={{ borderBottom: `1px solid ${border}`, paddingBottom: 2, minWidth: 160 }}
        >
          <select
            value={callerStatus}
            onChange={(e) => setCallerStatus(e.target.value)}
            className="w-full text-[15px] bg-transparent outline-none appearance-none cursor-pointer pr-4 text-[#49555d] font-medium"
          >
            <option value="">выберите статус</option>
            {CALLER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <ChevronDown size={15} color={muted} className="absolute right-0 pointer-events-none" />
        </div>

        <div className="flex items-center justify-end" style={{ borderBottom: `1px solid ${border}`, paddingBottom: 2, width: 30 }}>
          <ChevronDown size={15} color={muted} />
        </div>

        <button
          type="button"
          onClick={onTranslate}
          className="flex items-center justify-center hover:bg-gray-100 transition-colors cursor-pointer active:scale-95"
          style={{ width: 34, height: 30, border: `1px solid ${border}`, background: "#fbfdfe" }}
          aria-label="Перевод"
          title="Служба перевода"
        >
          <Languages size={17} color={slate} />
        </button>
      </div>

      {/* 2. Блок структурированного адреса происшествия */}
      <div style={{ border: `1px solid ${border}` }}>
        <div className="flex items-center gap-1.5 px-3 pt-2">
          <span className="text-[12px] font-medium" style={{ color: slate }}>
            Адрес:
          </span>
          <MapPin size={15} color="#157dbd" fill="#157dbd" />
        </div>

        <div className="flex items-center justify-between px-3 pb-1.5" style={{ borderBottom: `1px solid ${border}` }}>
          <div className="w-full pr-2">
            <StreetAutocompleteField
              value={fullAddressString}
              onChange={setFullAddressString}
              hideBorder={true}
              onSelectAddress={(street, okrug, district) => {
                setFullAddressString(street)
                setAddress({ ...address, street, okrug, district })
              }}
            />
          </div>
          <button
            type="button"
            onClick={handleClearAddress}
            className="text-gray-400 hover:text-gray-700"
            title="Очистить адрес"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-3 flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3">
            <InputField
              label="Страна:"
              value={address.country}
              onChange={(e) => setAddress({ ...address, country: e.target.value })}
            />
            <InputField
              label="Субъект:"
              value={address.subject}
              onChange={(e) => setAddress({ ...address, subject: e.target.value })}
            />
            <InputField
              label="Населенный пункт:"
              value={address.city}
              onChange={(e) => setAddress({ ...address, city: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <InputField
              label="Объект:"
              value={address.objectName}
              onChange={(e) => setAddress({ ...address, objectName: e.target.value })}
            />
            <SelectField
              label="Округ:"
              value={address.okrug}
              onChange={(e) => handleOkrugChange(e.target.value)}
              options={Object.keys(DISTRICTS_BY_OKRUG)}
            />
            <SelectField
              label="Район:"
              value={address.district}
              onChange={(e) => setAddress({ ...address, district: e.target.value })}
              options={currentDistricts}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <StreetAutocompleteField
              label="Улица:"
              value={address.street}
              onChange={(val) => setAddress({ ...address, street: val })}
              onSelectAddress={(street, okrug, district) => {
                setAddress({ ...address, street, okrug, district })
              }}
            />
            <InputField
              label="Дом/Вл:"
              value={address.house}
              onChange={(e) => setAddress({ ...address, house: e.target.value })}
            />
            <InputField
              label="Корпус:"
              value={address.building}
              onChange={(e) => setAddress({ ...address, building: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-5 gap-2">
            <InputField
              label="Стр/соор:"
              value={address.structure}
              onChange={(e) => setAddress({ ...address, structure: e.target.value })}
            />
            <InputField
              label="Квартира/офис:"
              value={address.apartment}
              onChange={(e) => setAddress({ ...address, apartment: e.target.value })}
            />
            <InputField
              label="Подъезд:"
              value={address.entrance}
              onChange={(e) => setAddress({ ...address, entrance: e.target.value })}
            />
            <InputField
              label="Этаж:"
              value={address.floor}
              onChange={(e) => setAddress({ ...address, floor: e.target.value })}
            />
            <InputField
              label="Код:"
              value={address.doorCode}
              onChange={(e) => setAddress({ ...address, doorCode: e.target.value })}
            />
          </div>

          <div className="flex items-end gap-3 pt-1">
            <div className="flex-1">
              <InputField
                label="Описательный адрес:"
                value={address.description}
                onChange={(e) => setAddress({ ...address, description: e.target.value })}
              />
            </div>
            <button
              type="button"
              onClick={handleClearAddress}
              className="text-[12px] whitespace-nowrap hover:bg-gray-100 transition-colors font-medium"
              style={{ padding: "5px 12px", border: `1px solid ${border}`, background: "#fbfdfe", color: slate }}
            >
              очистить адрес
            </button>
          </div>
        </div>
      </div>

      {/* 3. Блок описания происшествия со слов заявителя (Фабула) - Теперь Чат */}
      <div style={{ border: `1px solid ${border}` }} className="flex flex-col flex-1 min-h-[140px] bg-white overflow-hidden">
        <div className="px-3 py-2 border-b" style={{ borderColor: border, backgroundColor: "#f8fafc" }}>
          <span className="text-[12px] font-medium block" style={{ color: slate }}>
            Чат-диалог
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 relative">
          <ChatDialog />
        </div>
        <ChatInput />
      </div>
    </div>
  )
}

function ChatDialog() {
  const messages = useCallStore((s) => s.messages)
  
  if (messages.length === 0) {
    return <div className="text-xs text-center text-gray-400 mt-4">Диалог пуст...</div>
  }
  
  return (
    <>
      {messages.map((msg, idx) => {
        if (msg.sender === "system") {
          return (
            <div key={msg.id || idx} className="text-[10px] text-center text-gray-400 my-1 bg-gray-50 rounded py-1">
              {msg.text}
            </div>
          )
        }
        
        const isOperator = msg.sender === "operator"
        return (
          <div key={msg.id || idx} className={`flex w-full ${isOperator ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded px-3 py-2 text-[13px] relative shadow-sm ${
                isOperator ? "bg-[#dcf8c6] text-gray-800 rounded-tr-none" : "bg-white border border-gray-200 text-gray-800 rounded-tl-none"
              }`}
            >
              <div className="mb-0.5 font-semibold text-[10px] opacity-60">
                {isOperator ? "Оператор" : "Заявитель"}
              </div>
              <div className="leading-relaxed whitespace-pre-wrap word-break">{msg.text}</div>
            </div>
          </div>
        )
      })}
    </>
  )
}

function ChatInput() {
  const [text, setText] = useState("")
  const sendAsrText = useCallStore((s) => s.sendAsrText)
  const addMessage = useCallStore((s) => s.addMessage)

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed) return

    // Stop any currently playing audio
    if ((window as any).currentCallAudio) {
       ;(window as any).currentCallAudio.pause()
    }

    // Add operator message to dialogue history immediately
    addMessage({
      id: `msg_op_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      sender: "operator",
      text: trimmed,
      timestamp: Date.now(),
    })

    // Send to ASR/dialogue WebSocket for classifier processing
    if (sendAsrText) {
      sendAsrText(trimmed)
    }
    setText("")
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value)
    if ((window as any).currentCallAudio) {
       ;(window as any).currentCallAudio.pause()
    }
  }

  return (
    <div className="p-2 border-t flex gap-2 items-center" style={{ borderColor: border, backgroundColor: "#f8fafc" }}>
      <input
        type="text"
        className="flex-1 text-[13px] px-2 py-1.5 outline-none bg-white border rounded"
        style={{ borderColor: border, color: slate }}
        placeholder="Введите сообщение (ручной ввод)..."
        value={text}
        onChange={handleChange}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            handleSend()
          }
        }}
      />
      <button
        type="button"
        onClick={handleSend}
        className="px-3 py-1.5 text-[12px] font-semibold bg-[#157dbd] text-white rounded hover:brightness-110 transition cursor-pointer"
      >
        →
      </button>
    </div>
  )
}
