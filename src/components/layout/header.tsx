"use client";

import { Menu, Sun, Moon } from "lucide-react";
import { useTheme } from "@/providers/theme-provider";
import { DEFAULT_PROPERTY } from "@/lib/constants";
import { NotificationBell } from "./notification-bell";

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-20 h-16 bg-custis-card/80 backdrop-blur-md border-b border-custis-border theme-transition">
      <div className="flex items-center justify-between h-full px-4 lg:px-6">
        {/* Left — hamburger + property name */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 rounded-lg hover:bg-custis-border/50 text-text-secondary"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <div>
            <h1 className="text-sm font-semibold text-text-primary">
              {DEFAULT_PROPERTY}
            </h1>
            <p className="text-xs text-text-muted hidden sm:block">
              Property Management
            </p>
          </div>
        </div>

        {/* Right — actions */}
        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-custis-border/50 text-text-secondary transition-colors"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Notifications */}
          <NotificationBell />

          {/* User avatar placeholder */}
          <div className="w-8 h-8 rounded-full bg-custis-gold-muted flex items-center justify-center ml-1">
            <span className="text-xs font-semibold text-custis-gold">SM</span>
          </div>
        </div>
      </div>
    </header>
  );
}
