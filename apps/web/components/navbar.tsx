"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Layers, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

const ThemeToggle = dynamic(() => import("./theme-toggle").then((m) => m.ThemeToggle), {
  ssr: false,
});

export function Navbar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => pathname === path;

  return (
    <header
      className="bg-background/80 sticky top-0 z-50 w-full border-b backdrop-blur-xl"
      data-testid="navbar"
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2" data-testid="logo-link">
            <Layers className="h-5 w-5" strokeWidth={1.5} />
            <span className="font-mono text-sm font-bold uppercase tracking-wider">PrismOS</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            <Link href="/">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "font-mono text-xs uppercase tracking-wider",
                  isActive("/") && "bg-accent"
                )}
                data-testid="nav-marketplace"
              >
                Marketplace
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "font-mono text-xs uppercase tracking-wider",
                  isActive("/dashboard") && "bg-accent"
                )}
                data-testid="nav-dashboard"
              >
                Dashboard
              </Button>
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <div className="hidden sm:block">
            <ConnectButton
              showBalance={false}
              chainStatus="icon"
              accountStatus={{
                smallScreen: "avatar",
                largeScreen: "address",
              }}
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            data-testid="mobile-menu-toggle"
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" strokeWidth={1.5} />
            ) : (
              <Menu className="h-5 w-5" strokeWidth={1.5} />
            )}
          </Button>
        </div>
      </div>
      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="bg-background border-t md:hidden" data-testid="mobile-menu">
          <nav className="flex flex-col gap-2 p-4">
            <Link href="/" onClick={() => setMobileMenuOpen(false)}>
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start font-mono text-xs uppercase tracking-wider",
                  isActive("/") && "bg-accent"
                )}
                data-testid="mobile-nav-marketplace"
              >
                Marketplace
              </Button>
            </Link>
            <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}>
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start font-mono text-xs uppercase tracking-wider",
                  isActive("/dashboard") && "bg-accent"
                )}
                data-testid="mobile-nav-dashboard"
              >
                Dashboard
              </Button>
            </Link>
            <div className="mt-2 border-t pt-2">
              <ConnectButton
                showBalance={false}
                chainStatus="icon"
                accountStatus={{
                  smallScreen: "avatar",
                  largeScreen: "address",
                }}
              />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
