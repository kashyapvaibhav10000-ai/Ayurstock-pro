"use client"

import { useEffect } from "react"
import { socket } from "@/lib/socket-client"

export function useRealtimeInventory(refetch: () => void) {
  useEffect(() => {
    socket.on("inventory-updated", () => {
      refetch()
    })

    return () => {
      socket.off("inventory-updated")
    }
  }, [refetch])
}
