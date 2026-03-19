import { FileBarChart } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function ReportsPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <FileBarChart size={28} className="text-custis-gold" />
          Reports
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Monthly reports, analytics, and exports
        </p>
      </div>
      <Card>
        <CardContent className="py-16 text-center">
          <FileBarChart size={48} className="mx-auto text-text-muted mb-4" />
          <p className="text-text-muted text-sm">Reports — coming soon</p>
        </CardContent>
      </Card>
    </div>
  );
}
