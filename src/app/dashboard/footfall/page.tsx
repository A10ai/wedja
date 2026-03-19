import { Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function FootfallPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Users size={28} className="text-custis-gold" />
          Footfall
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Visitor counting, traffic patterns, and heatmaps
        </p>
      </div>
      <Card>
        <CardContent className="py-16 text-center">
          <Users size={48} className="mx-auto text-text-muted mb-4" />
          <p className="text-text-muted text-sm">Footfall — coming soon</p>
        </CardContent>
      </Card>
    </div>
  );
}
