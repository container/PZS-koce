"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import type { Hut } from "@/types/availability";

export type HutMapStatus = "available" | "unavailable" | "unknown" | "error";

export type HutMapSummary = {
  hut: Hut;
  status: HutMapStatus;
  availableCount?: number;
  lowestPriceDisplay?: string;
  stale?: boolean;
};

type HutMapProps = {
  summaries: HutMapSummary[];
  selectedHutId: string;
  onSelectHut: (hutId: string) => void;
  onBoundsChange?: (bounds: { north: number; south: number; east: number; west: number }) => void;
};

const SLOVENIA_CENTER: L.LatLngTuple = [46.15, 14.8];

function markerIcon(status: HutMapStatus, selected: boolean, stale?: boolean) {
  return L.divIcon({
    className: "",
    html: `<span class="hut-marker hut-marker--${status}${selected ? " hut-marker--selected" : ""}${stale ? " hut-marker--stale" : ""}"></span>`,
    iconSize: selected ? [28, 28] : [22, 22],
    iconAnchor: selected ? [14, 14] : [11, 11],
    popupAnchor: [0, selected ? -14 : -11],
  });
}

function FitMap({
  summaries,
  selectedHutId,
}: {
  summaries: HutMapSummary[];
  selectedHutId: string;
}) {
  const map = useMap();
  const fitted = useRef(false);
  const boundsKey = summaries
    .map((summary) => `${summary.hut.id}:${summary.hut.lat}:${summary.hut.lng}`)
    .join("|");

  useEffect(() => {
    const resizeTimer = window.setTimeout(() => map.invalidateSize(), 80);

    return () => window.clearTimeout(resizeTimer);
  }, [map, boundsKey]);

  useEffect(() => {
    const selected = summaries.find((summary) => summary.hut.id === selectedHutId);

    if (selected) {
      map.flyTo([selected.hut.lat, selected.hut.lng], Math.max(map.getZoom(), 12), {
        duration: 0.35,
      });
      return;
    }

    if (fitted.current) return;

    if (summaries.length === 1) {
      const [summary] = summaries;
      map.setView([summary.hut.lat, summary.hut.lng], 12);
      return;
    }

    if (summaries.length > 1) {
      const bounds = L.latLngBounds(
        summaries.map((summary) => [summary.hut.lat, summary.hut.lng]),
      );
      map.fitBounds(bounds, { maxZoom: 12, padding: [28, 28] });
      fitted.current = true;
    }
  }, [boundsKey, map, selectedHutId, summaries]);

  return null;
}

function MapViewportListener({ onBoundsChange }: Pick<HutMapProps, "onBoundsChange">) {
  const map = useMap();

  useEffect(() => {
    if (!onBoundsChange) return;
    const report = () => {
      const bounds = map.getBounds();
      onBoundsChange({ north: bounds.getNorth(), south: bounds.getSouth(), east: bounds.getEast(), west: bounds.getWest() });
    };
    report();
    map.on("moveend", report);
    return () => {
      map.off("moveend", report);
    };
  }, [map, onBoundsChange]);

  return null;
}

export function HutMap({ summaries, selectedHutId, onSelectHut, onBoundsChange }: HutMapProps) {
  const mapCenter = useMemo<L.LatLngTuple>(() => {
    const selected = summaries.find((summary) => summary.hut.id === selectedHutId);

    if (selected) {
      return [selected.hut.lat, selected.hut.lng];
    }

    return summaries[0]
      ? [summaries[0].hut.lat, summaries[0].hut.lng]
      : SLOVENIA_CENTER;
  }, [selectedHutId, summaries]);

  return (
    <MapContainer
      center={mapCenter}
      className="hut-map"
      maxZoom={18}
      minZoom={7}
      scrollWheelZoom
      zoom={10}
    >
      <TileLayer
        attribution='Podatki zemljevida: &copy; sodelavci <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, <a href="https://viewfinderpanoramas.org/">SRTM</a> | Slog zemljevida: &copy; <a href="https://opentopomap.org/">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
        url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
      />
      <FitMap summaries={summaries} selectedHutId={selectedHutId} />
      <MapViewportListener onBoundsChange={onBoundsChange} />
      {summaries.map((summary) => {
        const selected = summary.hut.id === selectedHutId;

        return (
          <Marker
            key={summary.hut.id}
            eventHandlers={{
              click: () => onSelectHut(summary.hut.id),
            }}
            icon={markerIcon(summary.status, selected, summary.stale)}
            position={[summary.hut.lat, summary.hut.lng]}
          />
        );
      })}
    </MapContainer>
  );
}
