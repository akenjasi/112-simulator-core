import { useEffect, useState } from "react"

export type SystemStatusState = "checking" | "active" | "down"

export function useSystemStatus(): SystemStatusState {
  const [status, setStatus] = useState<SystemStatusState>("checking")

  useEffect(() => {
    let isCurrentEffect = true
    let activeController: AbortController | null = null
    let activeTimeoutId: ReturnType<typeof setTimeout> | null = null

    const performCheck = async () => {
      // Abort any existing in-flight check
      if (activeController) {
        activeController.abort()
        activeController = null
      }
      if (activeTimeoutId) {
        clearTimeout(activeTimeoutId)
        activeTimeoutId = null
      }

      const controller = new AbortController()
      activeController = controller

      let timeoutFired = false
      const timeoutPromise = new Promise<never>((_, reject) => {
        activeTimeoutId = setTimeout(() => {
          timeoutFired = true
          controller.abort()
          reject(new Error("timeout"))
        }, 5000)
      })

      const fetchPromise = (async () => {
        const res = await fetch("/api/health", {
          cache: "no-store",
          signal: controller.signal,
        })
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        const data = await res.json()
        if (
          !data ||
          typeof data !== "object" ||
          Array.isArray(data) ||
          data.status !== "ok"
        ) {
          throw new Error("Invalid status payload")
        }
        return data
      })()

      // Prevent unhandled rejection if fetchPromise fails after timeout
      fetchPromise.catch(() => {})

      try {
        await Promise.race([fetchPromise, timeoutPromise])
        if (!isCurrentEffect || controller.signal.aborted) {
          return
        }
        setStatus("active")
      } catch {
        if (!isCurrentEffect) {
          return
        }
        if (controller.signal.aborted && !timeoutFired) {
          // Aborted due to unmount or another check starting - do not update state
          return
        }
        // Failure or timeout
        setStatus("down")
      } finally {
        if (activeTimeoutId) {
          clearTimeout(activeTimeoutId)
          activeTimeoutId = null
        }
        if (activeController === controller) {
          activeController = null
        }
      }
    }

    // 1. Initial check immediately
    performCheck()

    // 2. Fixed cadence polling every 30 seconds
    const intervalId = setInterval(performCheck, 30000)

    return () => {
      isCurrentEffect = false
      if (intervalId) {
        clearInterval(intervalId)
      }
      if (activeTimeoutId) {
        clearTimeout(activeTimeoutId)
        activeTimeoutId = null
      }
      if (activeController) {
        activeController.abort()
        activeController = null
      }
    }
  }, [])

  return status
}
