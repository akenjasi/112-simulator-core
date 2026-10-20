"use client"

import {useEffect, useRef, useState} from "react"
import {Joyride, type Step, type EventData, STATUS} from "react-joyride"
import {DDS_HELP, DDS_TOUR_TARGETS, type DDSHelpTopic} from "@/lib/dds-interface-help"

type Props = {
  run: boolean
  onFinish: () => void
  context?: "demo" | "guide" | "lesson"
  onTopicChange?: (topic: DDSHelpTopic | null) => void
}

export function Tutorial({run, onFinish, context = "demo", onTopicChange}: Props) {
  const [steps, setSteps] = useState<Step[]>([])
  const finishRef = useRef(onFinish)
  finishRef.current = onFinish
  const topicRef = useRef(onTopicChange)
  topicRef.current = onTopicChange
  const completed = useRef(false)
  const previousFocus = useRef<HTMLElement | null>(null)

  const finish = () => {
    if (completed.current) return
    completed.current = true
    finishRef.current()
    requestAnimationFrame(() => {if (previousFocus.current?.isConnected) previousFocus.current.focus()})
  }

  useEffect(() => {
    if (!run) return
    completed.current = false
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const introduction = context === "lesson"
      ? "Справка объясняет окна и кнопки и не выполняет действия за вас. Время занятия продолжает идти. Можно закрыть справку по Escape или кнопкой «Пропустить»."
      : "Познакомьтесь с рабочим местом диспетчера ДДС на учебном примере. Звонки и действия не отправляются, оценки не выставляются. Пояснения доступны в этом пошаговом знакомстве; его можно закрыть и запустить повторно."
    const prepare = async (topic: DDSHelpTopic | null) => {
      if (completed.current) return
      topicRef.current?.(topic)
      // Wait for the phone portal and its selected view before Joyride measures the target.
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    }
    const available = DDS_TOUR_TARGETS.filter(({target, when}) => {
      const element = document.querySelector(when && topicRef.current ? when : target)
      return element && !element.closest('[hidden], [aria-hidden="true"]') && getComputedStyle(element).display !== "none"
    })
    setSteps([
      {target: "body", title: "Знакомство с интерфейсом ДДС", content: introduction, placement: "center", skipBeacon: true, before: () => prepare(null)},
      ...available.map(({topic, target}): Step => ({
        target, title: DDS_HELP[topic].title, content: DDS_HELP[topic].text,
        placement: "auto", skipBeacon: true, before: () => prepare(topic),
      })),
    ])
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault(); event.stopPropagation(); finish()
    }
    document.addEventListener("keydown", escape, true)
    return () => document.removeEventListener("keydown", escape, true)
  }, [run, context])

  const handleEvent = ({status}: EventData) => {
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) finish()
  }

  return <Joyride steps={steps} run={run && steps.length > 0} continuous onEvent={handleEvent}
    options={{primaryColor: "#157dbd", textColor: "var(--popover-foreground)", backgroundColor: "var(--popover)",
      zIndex: 1500, width: "min(360px, calc(100vw - 32px))", showProgress: true,
      buttons: ["back", "primary", "skip"], overlayClickAction: false, blockTargetInteraction: true}}
    styles={{buttonPrimary: {color: "#fff", backgroundColor: "#126da4", fontWeight: 600}, buttonBack: {color: "var(--popover-foreground)"}}}
    locale={{back: "Назад", close: "Закрыть", last: "Завершить", next: "Далее", nextWithProgress: "Далее ({current} из {total})", open: "Открыть подсказку", skip: "Пропустить"}} />
}
