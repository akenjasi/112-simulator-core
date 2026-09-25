import Link from "next/link"
import { GraduationCap, Headphones, ArrowRight, ShieldCheck, Activity } from "lucide-react"

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col justify-between text-foreground">
      {/* Top minimalistic brand badge */}
      <header className="px-6 py-6 max-w-6xl mx-auto w-full flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-black text-lg shadow-sm">
            112
          </div>
          <div>
            <span className="font-extrabold tracking-tight text-base sm:text-lg">
              Система-112
            </span>
            <span className="text-xs text-muted-foreground block -mt-0.5">
              Учебный тренажерный комплекс
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/60 px-3 py-1.5 rounded-full border border-border/60">
          <Activity className="h-3.5 w-3.5 text-emerald-500 animate-pulse" />
          <span>Система активна</span>
        </div>
      </header>

      {/* Main Hero & Dual Entry Points */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-10 max-w-4xl mx-auto w-full">
        <div className="text-center space-y-4 mb-10 sm:mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Интерактивный симулятор экстренных служб</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-900 dark:text-slate-50">
            Симулятор 112
          </h1>

          <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto font-normal">
            Профессиональная платформа подготовки операторов экстренной службы 112 и диспетчеров ДДС
          </p>
        </div>

        {/* Two Large Entrance Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
          {/* 1. Teacher Entrance */}
          <Link
            href="/teacher/sessions"
            className="group relative flex flex-col justify-between p-8 rounded-2xl bg-card border-2 border-border/80 hover:border-primary shadow-sm hover:shadow-xl transition-all duration-300 text-left overflow-hidden cursor-pointer"
          >
            <div className="space-y-4">
              <div className="h-16 w-16 rounded-2xl bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                <GraduationCap className="h-8 w-8" />
              </div>

              <div>
                <h2 className="text-2xl font-bold text-foreground group-hover:text-primary transition-colors">
                  Вход для преподавателя
                </h2>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  Управление группами, формирование сценариев, запуск учебных сессий и аналитика успеваемости.
                </p>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t flex items-center justify-between text-sm font-semibold text-primary">
              <span>Панель преподавателя</span>
              <ArrowRight className="h-4 w-4 transform group-hover:translate-x-1.5 transition-transform" />
            </div>
          </Link>

          {/* 2. Cadet / Student Entrance */}
          <Link
            href="/student/profile"
            className="group relative flex flex-col justify-between p-8 rounded-2xl bg-card border-2 border-border/80 hover:border-emerald-500 shadow-sm hover:shadow-xl transition-all duration-300 text-left overflow-hidden cursor-pointer"
          >
            <div className="space-y-4">
              <div className="h-16 w-16 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-110 group-hover:bg-emerald-600 group-hover:text-white transition-all duration-300">
                <Headphones className="h-8 w-8" />
              </div>

              <div>
                <h2 className="text-2xl font-bold text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                  Вход для курсанта
                </h2>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  Личный кабинет, аттестационная статистика, прохождение билетов и тренажеры Оператора 112 / ДДС.
                </p>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t flex items-center justify-between text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              <span>Личный кабинет курсанта</span>
              <ArrowRight className="h-4 w-4 transform group-hover:translate-x-1.5 transition-transform" />
            </div>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-muted-foreground">
        Система-112 • Комплекс профессиональной подготовки и аттестации
      </footer>
    </div>
  )
}
