"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SIDEBAR_NAV } from "@/lib/constants";

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const pathname = usePathname();

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Branding */}
      <div className="flex items-center justify-between px-4 h-16 border-b border-custis-border">
        <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "text-xl font-bold text-text-primary tracking-tight",
              collapsed && "lg:hidden"
            )}
          >
            Cust
            <span className="relative">
              i<span className="absolute -top-0.5 left-[0.15em] w-1.5 h-1.5 bg-custis-gold rounded-full" />
            </span>
            s
          </span>
          {collapsed && (
            <span className="hidden lg:block text-xl font-bold text-custis-gold">
              C
            </span>
          )}
        </Link>

        {/* Close button — mobile only */}
        <button
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 rounded-lg hover:bg-custis-border/50 text-text-secondary"
          aria-label="Close sidebar"
        >
          <X size={18} />
        </button>

        {/* Collapse button — desktop only */}
        <button
          onClick={onToggleCollapse}
          className="hidden lg:flex p-1.5 rounded-lg hover:bg-custis-border/50 text-text-secondary"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronLeft
            size={16}
            className={cn(
              "transition-transform duration-200",
              collapsed && "rotate-180"
            )}
          />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {SIDEBAR_NAV.map((item) => {
          const Icon = item.icon;
          // Check if any other nav item is a more specific match
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname === item.href ||
                (pathname.startsWith(item.href + "/") &&
                  !SIDEBAR_NAV.some(
                    (other) =>
                      other.href !== item.href &&
                      other.href.startsWith(item.href) &&
                      pathname.startsWith(other.href)
                  ));

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onCloseMobile}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150",
                isActive
                  ? "bg-custis-gold-muted text-custis-gold"
                  : "text-text-secondary hover:text-text-primary hover:bg-custis-border/30",
                collapsed && "lg:justify-center lg:px-2"
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon
                size={18}
                className={cn(isActive ? "text-custis-gold" : "")}
              />
              <span className={cn(collapsed && "lg:hidden")}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-custis-border">
        <p
          className={cn(
            "text-xs text-text-muted",
            collapsed && "lg:text-center"
          )}
        >
          {collapsed ? (
            <span className="hidden lg:block">&copy;</span>
          ) : (
            "Custis v0.1.0"
          )}
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-custis-card border-r border-custis-border theme-transition",
          "transform transition-transform duration-300 lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:z-30",
          "bg-custis-card border-r border-custis-border theme-transition",
          "transition-[width] duration-200",
          collapsed ? "lg:w-16" : "lg:w-60"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
