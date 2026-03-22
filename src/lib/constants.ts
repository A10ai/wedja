import {
  Eye,
  LayoutDashboard,
  Building2,
  Store,
  FileText,
  ScrollText,
  DollarSign,
  Users,
  AlertTriangle,
  Wrench,
  Zap,
  Wallet,
  FileBarChart,
  Settings,
  GraduationCap,
  Megaphone,
  Share2,
  BarChart3,
  Map,
  Camera,
  TrendingUp,
  AlertOctagon,
  Activity,
  Timer,
  Brain,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const SIDEBAR_NAV: NavItem[] = [
  { label: "AI Brain", href: "/dashboard/ai/brain", icon: Brain },
  { label: "Live Map", href: "/dashboard/heatmap", icon: Map },
  { label: "CCTV Analytics", href: "/dashboard/cctv", icon: Camera },
  { label: "AI Centre", href: "/dashboard/ai", icon: Eye },
  { label: "AI Scheduler", href: "/dashboard/ai/scheduler", icon: Timer },
  { label: "Automations", href: "/dashboard/ai/automations", icon: Workflow },
  { label: "Predictions", href: "/dashboard/ai/predictions", icon: TrendingUp },
  { label: "Event Bus", href: "/dashboard/ai/events", icon: Activity },
  { label: "Anomalies", href: "/dashboard/anomalies", icon: AlertOctagon },
  { label: "Learning", href: "/dashboard/ai/learning", icon: GraduationCap },
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Property", href: "/dashboard/property", icon: Building2 },
  { label: "Tenants", href: "/dashboard/tenants", icon: Store },
  { label: "Tenant Analytics", href: "/dashboard/tenant-analytics", icon: BarChart3 },
  { label: "Leases", href: "/dashboard/leases", icon: FileText },
  { label: "Contracts", href: "/dashboard/contracts", icon: ScrollText },
  { label: "Revenue", href: "/dashboard/revenue", icon: DollarSign },
  { label: "% Rent Analysis", href: "/dashboard/percentage-rent", icon: TrendingUp },
  { label: "Footfall", href: "/dashboard/footfall", icon: Users },
  {
    label: "Discrepancies",
    href: "/dashboard/discrepancies",
    icon: AlertTriangle,
  },
  { label: "Maintenance", href: "/dashboard/maintenance", icon: Wrench },
  { label: "Energy", href: "/dashboard/energy", icon: Zap },
  { label: "Finance", href: "/dashboard/finance", icon: Wallet },
  { label: "Marketing", href: "/dashboard/marketing", icon: Megaphone },
  { label: "Social Media", href: "/dashboard/social", icon: Share2 },
  { label: "Reports", href: "/dashboard/reports", icon: FileBarChart },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

export const APP_NAME = "wedja.ai";
export const APP_TAGLINE = "The AI that runs your property";
export const DEFAULT_PROPERTY = "Senzo Mall, Hurghada";
export const DEFAULT_CURRENCY = "EGP" as const;
