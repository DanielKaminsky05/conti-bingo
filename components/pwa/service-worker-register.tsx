"use client"

import { useEffect } from "react"

/**
 * Registers the PWA service worker (/sw.js) once the page has loaded. Renders
 * nothing. Service workers only run in a secure context (HTTPS or localhost), so
 * this is a no-op over plain http (e.g. a LAN IP during dev).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Non-fatal: the app works without the SW; it just won't be offline-capable.
      })
    }

    if (document.readyState === "complete") {
      register()
      return
    }
    window.addEventListener("load", register, { once: true })
    return () => window.removeEventListener("load", register)
  }, [])

  return null
}
