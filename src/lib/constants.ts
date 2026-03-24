import {
  Eye,
  Newspaper,
  MessageSquare,
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

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const SIDEBAR_NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Daily Briefing", href: "/dashboard/briefing", icon: Newspaper },
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Live Map", href: "/dashboard/heatmap", icon: Map },
      { label: "Property", href: "/dashboard/property", icon: Building2 },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { label: "AI Brain", href: "/dashboard/ai/brain", icon: Brain },
      { label: "AI Centre", href: "/dashboard/ai", icon: Eye },
      { label: "Predictions", href: "/dashboard/ai/predictions", icon: TrendingUp },
      { label: "Anomalies", href: "/dashboard/anomalies", icon: AlertOctagon },
      { label: "Automations", href: "/dashboard/ai/automations", icon: Workflow },
      { label: "Scheduler", href: "/dashboard/ai/scheduler", icon: Timer },
      { label: "Event Bus", href: "/dashboard/ai/events", icon: Activity },
      { label: "Learning", href: "/dashboard/ai/learning", icon: GraduationCap },
    ],
  },
  {
    label: "Revenue",
    items: [
      { label: "Revenue", href: "/dashboard/revenue", icon: DollarSign },
      { label: "% Rent Analysis", href: "/dashboard/percentage-rent", icon: TrendingUp },
      { label: "Discrepancies", href: "/dashboard/discrepancies", icon: AlertTriangle },
      { label: "Tenant Analytics", href: "/dashboard/tenant-analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Tenants", href: "/dashboard/tenants", icon: Store },
      { label: "Communications", href: "/dashboard/communications", icon: MessageSquare },
      { label: "Leases", href: "/dashboard/leases", icon: FileText },
      { label: "Contracts", href: "/dashboard/contracts", icon: ScrollText },
      { label: "Footfall", href: "/dashboard/footfall", icon: Users },
      { label: "CCTV Analytics", href: "/dashboard/cctv", icon: Camera },
      { label: "Maintenance", href: "/dashboard/maintenance", icon: Wrench },
      { label: "Energy", href: "/dashboard/energy", icon: Zap },
    ],
  },
  {
    label: "Business",
    items: [
      { label: "Finance", href: "/dashboard/finance", icon: Wallet },
      { label: "Marketing", href: "/dashboard/marketing", icon: Megaphone },
      { label: "Social Media", href: "/dashboard/social", icon: Share2 },
      { label: "Reports", href: "/dashboard/reports", icon: FileBarChart },
      { label: "Settings", href: "/dashboard/settings", icon: Settings },
    ],
  },
];

export const APP_NAME = "wedja.ai";
export const APP_TAGLINE = "The AI that runs your property";
export const DEFAULT_PROPERTY = "Senzo Mall, Hurghada";
export const DEFAULT_CURRENCY = "EGP" as const;
