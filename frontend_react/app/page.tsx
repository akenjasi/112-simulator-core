import Link from "next/link"
import { Headphones, GraduationCap, Truck } from "lucide-react"

export default function DemoMenuPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-[#49555d] mb-4">
            Симулятор Службы 112
          </h1>
          <p className="text-lg text-gray-500">
            Выберите модуль для запуска демо-версии
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Operator 112 */}
          <Link
            href="/operator"
            className="group bg-white rounded-2xl shadow-sm border-2 border-[#c9ced1] p-8 hover:border-[#157dbd] hover:shadow-md transition-all flex flex-col items-center text-center"
          >
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-6 group-hover:bg-[#157dbd] transition-colors">
              <Headphones className="w-8 h-8 text-[#157dbd] group-hover:text-white" />
            </div>
            <h2 className="text-2xl font-bold text-[#49555d] mb-3">
              Оператор 112
            </h2>
            <p className="text-gray-500">
              Рабочее место оператора: прием звонков, заполнение карточки и маршрутизация.
            </p>
          </Link>

          {/* Teacher */}
          <Link
            href="/teacher"
            className="group bg-white rounded-2xl shadow-sm border-2 border-[#c9ced1] p-8 hover:border-[#157dbd] hover:shadow-md transition-all flex flex-col items-center text-center"
          >
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-6 group-hover:bg-[#157dbd] transition-colors">
              <GraduationCap className="w-8 h-8 text-[#157dbd] group-hover:text-white" />
            </div>
            <h2 className="text-2xl font-bold text-[#49555d] mb-3">
              Преподаватель
            </h2>
            <p className="text-gray-500">
              Управление группами, создание занятий и детальная аналитика оценок.
            </p>
          </Link>

          {/* DDS Dispatcher */}
          <Link
            href="/dds"
            className="group bg-white rounded-2xl shadow-sm border-2 border-[#c9ced1] p-8 hover:border-[#157dbd] hover:shadow-md transition-all flex flex-col items-center text-center"
          >
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-6 group-hover:bg-[#157dbd] transition-colors">
              <Truck className="w-8 h-8 text-[#157dbd] group-hover:text-white" />
            </div>
            <h2 className="text-2xl font-bold text-[#49555d] mb-3">
              Диспетчер ДДС
            </h2>
            <p className="text-gray-500">
              Вторичная обработка вызовов и распределение реагирующих бригад.
            </p>
          </Link>
        </div>
      </div>
    </div>
  )
}
