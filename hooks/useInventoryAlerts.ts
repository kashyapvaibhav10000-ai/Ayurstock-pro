"use client"

import { useQuery } from "@tanstack/react-query"

export function useInventoryAlerts() {
  return useQuery({
    queryKey: ["inventory-alerts"],

    queryFn: async () => {
      const res = await fetch("/api/dashboard/alerts")
      if (!res.ok) throw new Error("Failed to fetch alerts")
      return res.json()
    },

    refetchInterval: 30000, // refresh every 30 seconds
    staleTime: 25000,
  })
}
