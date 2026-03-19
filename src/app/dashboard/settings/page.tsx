import { Settings } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Settings size={28} className="text-custis-gold" />
          Settings
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Property configuration, users, and system settings
        </p>
      </div>
      <Card>
        <CardContent className="py-16 text-center">
          <Settings size={48} className="mx-auto text-text-muted mb-4" />
          <p className="text-text-muted text-sm">Settings — coming soon</p>
        </CardContent>
      </Card>
    </div>
  );
}
