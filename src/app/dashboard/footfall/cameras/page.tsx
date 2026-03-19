"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Camera,
  Plus,
  ArrowLeft,
  Edit2,
  Trash2,
  Wifi,
  WifiOff,
  AlertTriangle,
  X,
  Video,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface CameraFeed {
  id: string;
  name: string;
  location_description: string;
  zone_id: string | null;
  rtsp_url: string | null;
  status: string;
  resolution: string;
  angle_type: string;
  zone: {
    id: string;
    name: string;
    type: string;
    floor: number;
  } | null;
}

interface Zone {
  id: string;
  name: string;
  type: string;
  floor: number;
}

export default function CamerasPage() {
  const [cameras, setCameras] = useState<CameraFeed[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCamera, setEditingCamera] = useState<CameraFeed | null>(null);

  // Stats
  const activeCount = cameras.filter((c) => c.status === "active").length;
  const offlineCount = cameras.filter((c) => c.status === "offline").length;
  const maintenanceCount = cameras.filter(
    (c) => c.status === "maintenance"
  ).length;

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [camRes, zoneRes] = await Promise.all([
        fetch("/api/v1/cameras"),
        fetch("/api/v1/zones"),
      ]);
      const camData = await camRes.json();
      const zoneData = await zoneRes.json();
      setCameras(Array.isArray(camData) ? camData : []);
      setZones(Array.isArray(zoneData) ? zoneData : []);
    } catch (err) {
      console.error("Failed to load cameras:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(cam: CameraFeed) {
    setEditingCamera(cam);
    setShowForm(true);
  }

  function handleAdd() {
    setEditingCamera(null);
    setShowForm(true);
  }

  function handleFormClose() {
    setShowForm(false);
    setEditingCamera(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this camera?")) return;
    try {
      // Use PUT to set status to maintenance (soft delete)
      await fetch("/api/v1/cameras", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "offline" }),
      });
      loadData();
    } catch (err) {
      console.error("Failed to delete camera:", err);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/dashboard/footfall"
              className="text-text-muted hover:text-text-primary transition-colors"
            >
              <ArrowLeft size={18} />
            </Link>
            <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
              <Camera size={28} className="text-custis-gold" />
              Camera Management
            </h1>
          </div>
          <p className="text-sm text-text-muted ml-7">
            Register and manage IP cameras for footfall counting
          </p>
        </div>
        <Button onClick={handleAdd}>
          <Plus size={14} />
          Add Camera
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Wifi size={18} className="text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary tabular-nums">
                {activeCount}
              </p>
              <p className="text-xs text-text-muted">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
              <WifiOff size={18} className="text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary tabular-nums">
                {offlineCount}
              </p>
              <p className="text-xs text-text-muted">Offline</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <AlertTriangle size={18} className="text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary tabular-nums">
                {maintenanceCount}
              </p>
              <p className="text-xs text-text-muted">Maintenance</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Camera List */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Video size={16} className="text-custis-gold" />
            <h2 className="text-sm font-semibold text-text-primary">
              Registered Cameras
            </h2>
            <Badge variant="default">{cameras.length} total</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-text-muted text-sm">
              Loading cameras...
            </div>
          ) : cameras.length === 0 ? (
            <div className="p-12 text-center">
              <Camera size={48} className="mx-auto text-text-muted mb-4" />
              <p className="text-text-muted text-sm mb-3">
                No cameras registered yet
              </p>
              <Button onClick={handleAdd} size="sm">
                <Plus size={14} />
                Register First Camera
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-custis-border text-text-muted text-xs">
                    <th className="text-left px-4 py-2.5 font-medium w-8">
                      Status
                    </th>
                    <th className="text-left px-2 py-2.5 font-medium">
                      Name
                    </th>
                    <th className="text-left px-2 py-2.5 font-medium">
                      Location
                    </th>
                    <th className="text-left px-2 py-2.5 font-medium">
                      Zone
                    </th>
                    <th className="text-left px-2 py-2.5 font-medium">
                      Type
                    </th>
                    <th className="text-left px-2 py-2.5 font-medium">
                      Resolution
                    </th>
                    <th className="text-left px-2 py-2.5 font-medium">
                      RTSP URL
                    </th>
                    <th className="text-right px-4 py-2.5 font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cameras.map((cam) => (
                    <tr
                      key={cam.id}
                      className="border-b border-custis-border/50 hover:bg-custis-border/20 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div
                          className={cn(
                            "w-2.5 h-2.5 rounded-full",
                            cam.status === "active"
                              ? "bg-emerald-500"
                              : cam.status === "offline"
                              ? "bg-red-500"
                              : "bg-amber-500"
                          )}
                          title={cam.status}
                        />
                      </td>
                      <td className="px-2 py-3 font-medium text-text-primary">
                        {cam.name}
                      </td>
                      <td className="px-2 py-3 text-text-secondary text-xs max-w-[200px] truncate">
                        {cam.location_description || "-"}
                      </td>
                      <td className="px-2 py-3 text-text-secondary">
                        {cam.zone?.name || (
                          <span className="text-text-muted">Unassigned</span>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        <Badge variant="default">
                          {cam.angle_type || "N/A"}
                        </Badge>
                      </td>
                      <td className="px-2 py-3 text-text-secondary text-xs font-mono">
                        {cam.resolution || "-"}
                      </td>
                      <td className="px-2 py-3 text-text-muted text-xs font-mono max-w-[180px] truncate">
                        {cam.rtsp_url || "-"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleEdit(cam)}
                            className="p-1.5 rounded-lg hover:bg-custis-border/50 text-text-muted hover:text-text-primary transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(cam.id)}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-text-muted hover:text-red-500 transition-colors"
                            title="Remove"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Banner */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="py-4 flex items-start gap-3">
          <AlertTriangle
            size={18}
            className="text-amber-500 flex-shrink-0 mt-0.5"
          />
          <div>
            <p className="text-sm font-medium text-text-primary">
              Phase 1: Camera Registration
            </p>
            <p className="text-xs text-text-secondary mt-1">
              Cameras are registered for future computer vision integration.
              Actual RTSP stream processing and real-time people counting will be
              enabled when the CV service is deployed. Until then, use the manual
              footfall entry on the main footfall page.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Camera Form Modal */}
      {showForm && (
        <CameraFormModal
          camera={editingCamera}
          zones={zones}
          onClose={handleFormClose}
          onSaved={() => {
            handleFormClose();
            loadData();
          }}
        />
      )}
    </div>
  );
}

// ── Camera Form Modal ─────────────────────────────────────────

function CameraFormModal({
  camera,
  zones,
  onClose,
  onSaved,
}: {
  camera: CameraFeed | null;
  zones: Zone[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!camera;
  const [name, setName] = useState(camera?.name || "");
  const [rtspUrl, setRtspUrl] = useState(camera?.rtsp_url || "");
  const [zoneId, setZoneId] = useState(camera?.zone_id || "");
  const [location, setLocation] = useState(
    camera?.location_description || ""
  );
  const [angleType, setAngleType] = useState(camera?.angle_type || "entrance");
  const [resolution, setResolution] = useState(
    camera?.resolution || "1920x1080"
  );
  const [status, setStatus] = useState(camera?.status || "offline");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const payload: any = {
        name,
        rtsp_url: rtspUrl || null,
        zone_id: zoneId || null,
        location_description: location || null,
        angle_type: angleType,
        resolution,
      };

      if (isEdit) {
        payload.id = camera!.id;
        payload.status = status;
      }

      const res = await fetch("/api/v1/cameras", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }

      onSaved();
    } catch (err: any) {
      setError(err.message || "Failed to save camera");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-custis-card border border-custis-border rounded-xl shadow-2xl w-full max-w-lg p-6 animate-fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary">
            {isEdit ? "Edit Camera" : "Register Camera"}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-custis-border/50 text-text-muted"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Camera Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Main Entrance North"
            required
          />

          <Input
            label="RTSP URL"
            value={rtspUrl}
            onChange={(e) => setRtspUrl(e.target.value)}
            placeholder="rtsp://192.168.1.100:554/stream1"
          />

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text-secondary">
              Zone
            </label>
            <select
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm bg-custis-bg border border-custis-border text-text-primary focus:outline-none focus:ring-2 focus:ring-custis-gold focus:border-transparent"
            >
              <option value="">Unassigned</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} (Floor {z.floor})
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Location Description"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g., North entrance doors, ground floor"
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-text-secondary">
                Angle Type
              </label>
              <select
                value={angleType}
                onChange={(e) => setAngleType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm bg-custis-bg border border-custis-border text-text-primary focus:outline-none focus:ring-2 focus:ring-custis-gold focus:border-transparent"
              >
                <option value="entrance">Entrance</option>
                <option value="overhead">Overhead</option>
                <option value="corridor">Corridor</option>
              </select>
            </div>

            <Input
              label="Resolution"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              placeholder="1920x1080"
            />
          </div>

          {isEdit && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-text-secondary">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm bg-custis-bg border border-custis-border text-text-primary focus:outline-none focus:ring-2 focus:ring-custis-gold focus:border-transparent"
              >
                <option value="active">Active</option>
                <option value="offline">Offline</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving
                ? "Saving..."
                : isEdit
                ? "Update Camera"
                : "Register Camera"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
