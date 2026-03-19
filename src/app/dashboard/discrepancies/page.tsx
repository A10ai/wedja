import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function DiscrepanciesPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <AlertTriangle size={28} className="text-custis-gold" />
          Discrepancies
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Revenue verification and underreporting detection
        </p>
      </div>
      <Card>
        <CardContent className="py-16 text-center">
          <AlertTriangle size={48} className="mx-auto text-text-muted mb-4" />
          <p className="text-text-muted text-sm">Discrepancies — coming soon</p>
        </CardContent>
      </Card>
    </div>
  );
}
