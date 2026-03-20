"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  MapPin,
  Layers,
  Calendar,
  Loader2,
  Maximize2,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber, formatCurrency } from "@/lib/utils";

interface Property {
  id: string;
  name: string;
  address: string;
  city: string;
  country: string;
  total_area_sqm: number;
  floors: number;
  year_established: number;
  operating_hours: string;
  status: string;
  currency: string;
  zones: Zone[];
}

interface Zone {
  id: string;
  name: string;
  floor: number;
  area_sqm: number;
  type: string;
  status: string;
  unit_count?: number;
  occupied_count?: number;
  vacant_count?: number;
  maintenance_count?: number;
}

interface Unit {
  id: string;
  name: string;
  unit_number: string;
  floor: number;
  area_sqm: number;
  status: string;
  frontage_m: number;
  current_tenant: { brand_name: string; category: string } | null;
}

interface ZoneFootfall {
  zone_id: string;
  zone_name: string;
  total_in: number;
}

interface ZoneEnergy {
  zone_id: string;
  zone_name: string;
  consumption_kwh: number;
  cost_egp: number;
}

const typeColors: Record<string, "gold" | "success" | "warning" | "info" | "error" | "default"> = {
  retail: "gold",
  food: "warning",
  entertainment: "info",
  service: "success",
  parking: "default",
  common: "default",
};

const unitStatusVariant: Record<string, "success" | "warning" | "error" | "default"> = {
  occupied: "success",
  vacant: "warning",
  maintenance: "error",
};

export default function PropertyPage() {
  const [property, setProperty] = useState<Property | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unitsLoading, setUnitsLoading] = useState(false);

  // Cross-data state
  const [zoneFootfall, setZoneFootfall] = useState<Record<string, number>>({});
  const [zoneEnergy, setZoneEnergy] = useState<Record<string, number>>({});
  const [zoneRevenue, setZoneRevenue] = useState<Record<string, number>>({});

  useEffect(() => {
    async function fetchData() {
      try {
        const [propRes, zonesRes] = await Promise.all([
          fetch("/api/v1/properties"),
          fetch("/api/v1/zones"),
        ]);
        const propData = await propRes.json();
        const zonesData = await zonesRes.json();
        setProperty(propData);
        setZones(zonesData);
      } catch {
        // handled by empty state
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Fetch cross-data for zone enrichment
  useEffect(() => {
    async function fetchCrossData() {
      try {
        const [ffRes, enRes, txRes] = await Promise.all([
          fetch("/api/v1/footfall?type=by_zone").catch(() => null),
          fetch("/api/v1/energy?type=by_zone").catch(() => null),
          fetch("/api/v1/rent-transactions").catch(() => null),
        ]);

        if (ffRes?.ok) {
          const ffData: ZoneFootfall[] = await ffRes.json();
          const map: Record<string, number> = {};
          if (Array.isArray(ffData)) {
            ffData.forEach((z) => { map[z.zone_id] = z.total_in; });
          }
          setZoneFootfall(map);
        }

        if (enRes?.ok) {
          const enData: ZoneEnergy[] = await enRes.json();
          const map: Record<string, number> = {};
          if (Array.isArray(enData)) {
            enData.forEach((z) => { map[z.zone_id] = z.consumption_kwh; });
          }
          setZoneEnergy(map);
        }

        if (txRes?.ok) {
          const txData = await txRes.json();
          const map: Record<string, number> = {};
          if (Array.isArray(txData)) {
            txData.forEach((tx: any) => {
              const zoneName = tx.lease?.unit?.zone?.name;
              const zoneId = tx.lease?.unit?.zone?.id;
              if (zoneId) {
                map[zoneId] = (map[zoneId] || 0) + (tx.amount_paid || 0);
              }
            });
          }
          setZoneRevenue(map);
        }
      } catch {
        // Cross-data optional
      }
    }
    fetchCrossData();
  }, []);

  useEffect(() => {
    if (!selectedZone) {
      setUnits([]);
      return;
    }

    async function fetchUnits() {
      setUnitsLoading(true);
      try {
        const res = await fetch(`/api/v1/units?zone_id=${selectedZone}`);
        const data = await res.json();
        setUnits(data);
      } catch {
        setUnits([]);
      } finally {
        setUnitsLoading(false);
      }
    }
    fetchUnits();
  }, [selectedZone]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-wedja-accent" />
      </div>
    );
  }

  if (!property) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted text-sm">No property data found</p>
      </div>
    );
  }

  // Compute totals from zones data
  const totalUnits = zones.reduce((s, z) => s + (z.unit_count || 0), 0);
  const totalOccupied = zones.reduce((s, z) => s + (z.occupied_count || 0), 0);
  const totalVacant = zones.reduce((s, z) => s + (z.vacant_count || 0), 0);
  const totalMaintenance = zones.reduce((s, z) => s + (z.maintenance_count || 0), 0);

  // Performance color coding for zones
  function getZonePerformanceColor(zoneId: string): string {
    const ff = zoneFootfall[zoneId] || 0;
    const rev = zoneRevenue[zoneId] || 0;
    if (ff > 0 && rev > 0) return "";
    if (ff === 0 && rev === 0) return "bg-red-500/5";
    return "";
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Building2 size={28} className="text-wedja-accent" />
          Property
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Zones, units, and property details
        </p>
      </div>

      {/* Property overview */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text-primary">
            Property Overview
          </h2>
          <Badge variant="success">{property.status}</Badge>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-1">
              <p className="text-xs text-text-muted uppercase tracking-wider">Name</p>
              <p className="text-sm font-semibold text-text-primary">{property.name}</p>
            </div>
            <div className="space-y-1 flex items-start gap-2">
              <MapPin size={14} className="text-text-muted mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider">Address</p>
                <p className="text-sm text-text-primary">
                  {property.address}, {property.city}, {property.country}
                </p>
              </div>
            </div>
            <div className="space-y-1 flex items-start gap-2">
              <Maximize2 size={14} className="text-text-muted mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider">Total Area</p>
                <p className="text-sm font-mono text-text-primary">
                  {formatNumber(property.total_area_sqm)} sqm
                </p>
              </div>
            </div>
            <div className="space-y-1 flex items-start gap-2">
              <Layers size={14} className="text-text-muted mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider">Floors</p>
                <p className="text-sm font-mono text-text-primary">{property.floors}</p>
              </div>
            </div>
            <div className="space-y-1 flex items-start gap-2">
              <Calendar size={14} className="text-text-muted mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider">Established</p>
                <p className="text-sm text-text-primary">{property.year_established}</p>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-text-muted uppercase tracking-wider">Operating Hours</p>
              <p className="text-sm text-text-primary">{property.operating_hours}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-text-muted uppercase tracking-wider">Currency</p>
              <p className="text-sm text-text-primary">{property.currency}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Unit status summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-xl font-bold text-text-primary font-mono">{totalUnits}</p>
            <p className="text-xs text-text-muted">Total Units</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-xl font-bold text-status-success font-mono">{totalOccupied}</p>
            <p className="text-xs text-text-muted">Occupied</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-xl font-bold text-status-warning font-mono">{totalVacant}</p>
            <p className="text-xs text-text-muted">Vacant</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-xl font-bold text-status-error font-mono">{totalMaintenance}</p>
            <p className="text-xs text-text-muted">Maintenance</p>
          </CardContent>
        </Card>
      </div>

      {/* Zone breakdown */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text-primary">
            Zone Breakdown
          </h2>
          {selectedZone && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedZone(null)}
            >
              Clear filter
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-wedja-border">
                  <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Zone</th>
                  <th className="text-center px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Floor</th>
                  <th className="text-center px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Type</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Area (sqm)</th>
                  <th className="text-center px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Units</th>
                  <th className="text-center px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Occupied</th>
                  <th className="text-center px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Vacant</th>
                  <th className="text-right px-3 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden lg:table-cell">Footfall</th>
                  <th className="text-right px-3 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden lg:table-cell">Energy (kWh)</th>
                  <th className="text-right px-3 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden lg:table-cell">Revenue (EGP)</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((zone, i) => (
                  <tr
                    key={zone.id}
                    onClick={() => setSelectedZone(zone.id === selectedZone ? null : zone.id)}
                    className={`border-b border-wedja-border/50 cursor-pointer transition-colors ${
                      zone.id === selectedZone
                        ? "bg-wedja-accent-muted"
                        : getZonePerformanceColor(zone.id) || (i % 2 === 1
                        ? "bg-wedja-border/10"
                        : "")
                    } hover:bg-wedja-border/20`}
                  >
                    <td className="px-5 py-3 font-medium text-text-primary">{zone.name}</td>
                    <td className="px-5 py-3 text-center text-text-secondary font-mono">
                      {zone.floor >= 0 ? `F${zone.floor}` : `B${Math.abs(zone.floor)}`}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <Badge variant={typeColors[zone.type] || "default"}>
                        {zone.type}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-text-secondary">
                      {formatNumber(zone.area_sqm)}
                    </td>
                    <td className="px-5 py-3 text-center font-mono text-text-primary">
                      {zone.unit_count || 0}
                    </td>
                    <td className="px-5 py-3 text-center font-mono text-status-success">
                      {zone.occupied_count || 0}
                    </td>
                    <td className="px-5 py-3 text-center font-mono text-status-warning">
                      {zone.vacant_count || 0}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-text-secondary hidden lg:table-cell">
                      {zoneFootfall[zone.id] ? formatNumber(zoneFootfall[zone.id]) : "-"}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-text-secondary hidden lg:table-cell">
                      {zoneEnergy[zone.id] ? formatNumber(zoneEnergy[zone.id]) : "-"}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-wedja-accent hidden lg:table-cell">
                      {zoneRevenue[zone.id] ? formatCurrency(zoneRevenue[zone.id]) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Units for selected zone */}
      {selectedZone && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary">
              Units in {zones.find((z) => z.id === selectedZone)?.name}
            </h2>
          </CardHeader>
          <CardContent className="p-0">
            {unitsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={24} className="animate-spin text-wedja-accent" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-wedja-border">
                      <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Unit</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Name</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Area</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Frontage</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Tenant</th>
                      <th className="text-center px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {units.map((unit, i) => (
                      <tr
                        key={unit.id}
                        className={`border-b border-wedja-border/50 ${
                          i % 2 === 1 ? "bg-wedja-border/10" : ""
                        } hover:bg-wedja-border/20`}
                      >
                        <td className="px-5 py-3 font-mono text-text-primary font-medium">
                          {unit.unit_number}
                        </td>
                        <td className="px-5 py-3 text-text-primary">{unit.name}</td>
                        <td className="px-5 py-3 text-right font-mono text-text-secondary">
                          {formatNumber(unit.area_sqm)} sqm
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-text-secondary">
                          {unit.frontage_m}m
                        </td>
                        <td className="px-5 py-3 text-text-secondary">
                          {unit.current_tenant?.brand_name || (
                            <span className="text-text-muted italic">Vacant</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <Badge variant={unitStatusVariant[unit.status] || "default"}>
                            {unit.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {units.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-text-muted">
                          No units in this zone
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
