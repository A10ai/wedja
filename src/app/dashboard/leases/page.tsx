import { FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function LeasesPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <FileText size={28} className="text-custis-gold" />
          Leases
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Active leases, terms, and rent schedules
        </p>
      </div>
      <Card>
        <CardContent className="py-16 text-center">
          <FileText size={48} className="mx-auto text-text-muted mb-4" />
          <p className="text-text-muted text-sm">Leases — coming soon</p>
        </CardContent>
      </Card>
    </div>
  );
}
