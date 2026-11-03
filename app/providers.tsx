"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider, useTheme } from "next-themes"
import { useState } from "react"
import { Toaster } from "sonner"
import "@/lib/axios"

function ToasterWrapper() {
  const { theme } = useTheme();
  return (
    <Toaster
      position="bottom-center"
      theme={theme as any}
      toastOptions={{
        classNames: {
          toast: '!rounded-full !border-0 !bg-surface !text-foreground !shadow-pop !px-4 !py-2.5 !text-[13px] !font-medium !w-auto !min-w-0',
          success: '[&_[data-icon]]:!text-success',
          error: '[&_[data-icon]]:!text-danger',
          warning: '[&_[data-icon]]:!text-warning',
          description: '!text-label-secondary !text-[12px]',
        },
      }}
    />
  );
}

export default function Providers({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
        themes={['light', 'dark']}
        disableTransitionOnChange
        storageKey="theme"
        nonce={nonce}
      >
        {children}
        <ToasterWrapper />
      </ThemeProvider>
    </QueryClientProvider>
  )
}
