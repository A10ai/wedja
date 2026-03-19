import {
  Eye,
  LayoutDashboard,
  Building2,
  Store,
  FileText,
  DollarSign,
  Users,
  AlertTriangle,
  Wrench,
  Zap,
  Wallet,
  FileBarChart,
  Settings,
  GraduationCap,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const SIDEBAR_NAV: NavItem[] = [
  { label: "AI Centre", href: "/dashboard/ai", icon: Eye },
  { label: "Learning", href: "/dashboard/ai/learning", icon: GraduationCap },
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Property", href: "/dashboard/property", icon: Building2 },
  { label: "Tenants", href: "/dashboard/tenants", icon: Store },
  { label: "Leases", href: "/dashboard/leases", icon: FileText },
  { label: "Revenue", href: "/dashboard/revenue", icon: DollarSign },
  { label: "Footfall", href: "/dashboard/footfall", icon: Users },
  {
    label: "Discrepancies",
    href: "/dashboard/discrepancies",
    icon: AlertTriangle,
  },
  { label: "Maintenance", href: "/dashboard/maintenance", icon: Wrench },
  { label: "Energy", href: "/dashboard/energy", icon: Zap },
  { label: "Finance", href: "/dashboard/finance", icon: Wallet },
  { label: "Reports", href: "/dashboard/reports", icon: FileBarChart },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

export const APP_NAME = "Custis";
export const APP_TAGLINE = "The AI that runs your property";
export const DEFAULT_PROPERTY = "Senzo Mall, Hurghada";
export const DEFAULT_CURRENCY = "EGP" as const;
