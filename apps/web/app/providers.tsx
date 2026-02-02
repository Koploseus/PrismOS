"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { ThemeProvider, useTheme } from "next-themes";
import "@rainbow-me/rainbowkit/styles.css";
import { config } from "@/lib/config";

const queryClient = new QueryClient();

function RainbowKitWrapper({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();

  const rkTheme = React.useMemo(() => {
    if (!resolvedTheme) return null;

    return resolvedTheme === "dark"
      ? darkTheme({
        accentColor: "#FAFAFA",
        accentColorForeground: "#0A0A0A",
        borderRadius: "none",
      })
      : lightTheme({
        accentColor: "#0A0A0A",
        accentColorForeground: "#FFFFFF",
        borderRadius: "none",
      });
  }, [resolvedTheme]);

  if (!rkTheme) return null;

  return (
    <RainbowKitProvider theme={rkTheme} locale="en-US">
      {children}
    </RainbowKitProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitWrapper>{children}</RainbowKitWrapper>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
}
