import {
  DollarSign,
  Building2,
  Store,
  Users,
  Wrench,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const stats = [
  {
    label: "Total Revenue",
    value: "EGP 4.2M",
    change: "+12.5%",
    icon: DollarSign,
    positive: true,
  },
  {
    label: "Occupancy Rate",
    value: "87.3%",
    change: "+2.1%",
    icon: Building2,
    positive: true,
  },
  {
    label: "Active Tenants",
    value: "34",
    change: "+2",
    icon: Store,
    positive: true,
  },
  {
    label: "Footfall Today",
    value: "15,420",
    change: "-3.2%",
    icon: Users,
    positive: false,
  },
  {
    label: "Open Maintenance",
    value: "7",
    change: "+1",
    icon: Wrench,
    positive: false,
  },
  {
    label: "Discrepancies Found",
    value: "5",
    change: "+2",
    icon: AlertTriangle,
    positive: false,
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">
          Custis &mdash; Senzo Mall, Hurghada
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Property overview and key metrics
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="flex items-start justify-between py-5">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
                    {stat.label}
                  </p>
                  <p className="text-2xl font-bold text-text-primary font-mono">
                    {stat.value}
                  </p>
                  <p
                    className={`text-xs font-medium ${
                      stat.positive ? "text-status-success" : "text-status-error"
                    }`}
                  >
                    {stat.change} from last month
                  </p>
                </div>
                <div className="p-2.5 rounded-lg bg-custis-gold-muted">
                  <Icon size={20} className="text-custis-gold" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Placeholder sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-text-muted text-sm">
              Revenue trends chart &mdash; coming soon
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-text-muted text-sm">
              Footfall heatmap &mdash; coming soon
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-text-muted text-sm">
              Top discrepancies &mdash; coming soon
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-text-muted text-sm">
              AI insights &mdash; coming soon
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
