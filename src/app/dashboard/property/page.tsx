import { Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function PropertyPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Building2 size={28} className="text-custis-gold" />
          Property
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Zones, units, and property details
        </p>
      </div>
      <Card>
        <CardContent className="py-16 text-center">
          <Building2 size={48} className="mx-auto text-text-muted mb-4" />
          <p className="text-text-muted text-sm">Property — coming soon</p>
        </CardContent>
      </Card>
    </div>
  );
}
