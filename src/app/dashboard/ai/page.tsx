import { Eye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function AIPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Eye size={28} className="text-custis-gold" />
          AI Centre
        </h1>
        <p className="text-sm text-text-muted mt-1">
          AI-powered insights, decisions, and property intelligence
        </p>
      </div>
      <Card>
        <CardContent className="py-16 text-center">
          <Eye size={48} className="mx-auto text-text-muted mb-4" />
          <p className="text-text-muted text-sm">AI Centre — coming soon</p>
          <p className="text-text-muted text-xs mt-1">
            Chat with Custis, review AI decisions, and get daily briefings
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
