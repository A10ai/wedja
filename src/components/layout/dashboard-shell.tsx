"use client";

import { useState } from "react";
import { ThemeProvider } from "@/providers/theme-provider";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { cn } from "@/lib/utils";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-custis-bg theme-transition">
        <Sidebar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />

        <div
          className={cn(
            "transition-[margin] duration-200",
            collapsed ? "lg:ml-16" : "lg:ml-60"
          )}
        >
          <Header onMenuClick={() => setMobileOpen(true)} />
          <main className="p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </ThemeProvider>
  );
}
