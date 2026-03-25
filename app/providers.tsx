"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider, useTheme } from "next-themes"
import { useState } from "react"
import { Toaster } from "sonner"
import "@/lib/axios"

function ToasterWrapper() {
  const { theme } = useTheme();
  return <Toaster richColors position="top-right" theme={theme as any} />;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        {children}
        <ToasterWrapper />
      </ThemeProvider>
    </QueryClientProvider>
  )
}
