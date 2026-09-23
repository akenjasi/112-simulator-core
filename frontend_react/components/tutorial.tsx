"use client"

import { Joyride, Step, CallBackProps, STATUS } from "react-joyride"

type Props = {
  run: boolean
  onFinish: () => void
}

export function Tutorial({ run, onFinish }: Props) {
  const steps: Step[] = [
    {
      target: "body",
      content: "Добро пожаловать в тренажер ДДС! Это краткое обучение познакомит вас с рабочим местом диспетчера.",
      placement: "center",
      disableBeacon: true,
    },
    {
      target: "#tour-topbar",
      content: "Здесь находится основная информация о звонке, контактах заявителя, номерах телефонов и таймере SLA.",
      placement: "bottom",
    },
    {
      target: "#tour-caller",
      content: "Панель заявителя. Здесь отображается ФИО, роль (например, очевидец) и адрес происшествия.",
      placement: "right",
    },
    {
      target: "#tour-incident",
      content: "Панель происшествия. Здесь можно увидеть наличие пострадавших, заблокированных людей и признаки ЧС/ЧП.",
      placement: "left",
    },
    {
      target: "#tour-services",
      content: "Самая важная часть! Здесь отображаются все службы, привлеченные к карточке. Ваша задача — следить за своей службой.",
      placement: "top",
    },
    {
      target: "#tour-pencil",
      content: "Нажмите на карандаш, чтобы изменить статус вашей службы (Принята, Начало реагирования и т.д.) и оставить обязательный комментарий.",
      placement: "top",
    }
  ]

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status } = data
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED]

    if (finishedStatuses.includes(status)) {
      onFinish()
    }
  }

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      showSkipButton
      showProgress
      disableOverlayClose
      callback={handleJoyrideCallback}
      styles={{
        options: {
          primaryColor: "#157dbd",
          textColor: "#303335",
          zIndex: 1000,
        },
        buttonClose: {
          display: "none",
        }
      }}
      locale={{
        back: "Назад",
        close: "Закрыть",
        last: "Завершить",
        next: "Далее",
        skip: "Пропустить",
      }}
    />
  )
}
