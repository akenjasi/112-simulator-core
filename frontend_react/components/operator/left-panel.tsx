"use client"

import { useState } from "react"
import { X, ChevronDown, Languages, MapPin } from "lucide-react"

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
          <input
            type="text"
            value={fullAddressString}
            onChange={(e) => setFullAddressString(e.target.value)}
            className="w-full text-[14px] font-medium bg-transparent outline-none pr-2"
            style={{ color: slate }}
          />
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
            <InputField
              label="Улица:"
              value={address.street}
              onChange={(e) => setAddress({ ...address, street: e.target.value })}
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

      {/* 3. Блок описания происшествия со слов заявителя (Фабула) */}
      <div style={{ border: `1px solid ${border}` }} className="p-3 flex flex-col flex-1 min-h-[140px]">
        <span className="text-[12px] font-medium block mb-1.5" style={{ color: slate }}>
          Описание со слов заявителя
        </span>
        <textarea
          value={incidentDescription}
          onChange={(e) => setIncidentDescription(e.target.value.slice(0, 1999))}
          placeholder="введите подробное описание ситуации со слов заявителя..."
          className="w-full flex-1 text-[14px] bg-transparent outline-none resize-none placeholder-[#b7bec3]"
          style={{ color: slate }}
        />
        <div className="flex justify-end pt-1">
          <span className="text-[12px] tabular-nums" style={{ color: muted }}>
            {incidentDescription.length} / 1999
          </span>
        </div>
      </div>
    </div>
  )
}
