import { Store } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function TenantsPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Store size={28} className="text-custis-gold" />
          Tenants
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Tenant directory, brands, and contact information
        </p>
      </div>
      <Card>
        <CardContent className="py-16 text-center">
          <Store size={48} className="mx-auto text-text-muted mb-4" />
          <p className="text-text-muted text-sm">Tenants — coming soon</p>
        </CardContent>
      </Card>
    </div>
  );
}
