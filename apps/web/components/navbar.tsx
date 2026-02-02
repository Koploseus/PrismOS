'use client';

import { useTheme } from 'next-themes';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Sun, Moon, Layers, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export function Navbar() {
  const { setTheme, resolvedTheme } = useTheme();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isActive = (path: string) => pathname === path;

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-xl" data-testid="navbar">
      <div className="max-w-7xl mx-auto flex h-14 items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2" data-testid="logo-link">
            <Layers className="h-5 w-5" strokeWidth={1.5} />
            <span className="font-mono text-sm font-bold tracking-wider uppercase">PrismOS</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            <Link href="/">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "font-mono text-xs uppercase tracking-wider",
                  isActive('/') && "bg-accent"
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
                  isActive('/dashboard') && "bg-accent"
                )}
                data-testid="nav-dashboard"
              >
                Dashboard
              </Button>
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              data-testid="theme-toggle"
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="h-4 w-4" strokeWidth={1.5} />
              ) : (
                <Moon className="h-4 w-4" strokeWidth={1.5} />
              )}
            </Button>
          )}
          <div className="hidden sm:block">
            <ConnectButton 
              showBalance={false}
              chainStatus="icon"
              accountStatus={{
                smallScreen: 'avatar',
                largeScreen: 'address'
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
        <div className="md:hidden border-t bg-background" data-testid="mobile-menu">
          <nav className="flex flex-col p-4 gap-2">
            <Link href="/" onClick={() => setMobileMenuOpen(false)}>
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start font-mono text-xs uppercase tracking-wider",
                  isActive('/') && "bg-accent"
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
                  isActive('/dashboard') && "bg-accent"
                )}
                data-testid="mobile-nav-dashboard"
              >
                Dashboard
              </Button>
            </Link>
            <div className="pt-2 border-t mt-2">
              <ConnectButton 
                showBalance={false}
                chainStatus="icon"
                accountStatus={{
                  smallScreen: 'avatar',
                  largeScreen: 'address'
                }}
              />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
