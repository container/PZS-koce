"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
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

function statusText(summary: HutMapSummary) {
  if (summary.status === "available") {
    return `${summary.availableCount ?? 0} available${summary.lowestPriceDisplay ? ` from ${summary.lowestPriceDisplay}` : ""}`;
  }

  if (summary.status === "unavailable") {
    return "No availability found";
  }

  if (summary.status === "error") {
    return "Could not check";
  }

  return "Not checked yet";
}

function FitMap({
  summaries,
  selectedHutId,
}: {
  summaries: HutMapSummary[];
  selectedHutId: string;
}) {
  const map = useMap();
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
    }
  }, [boundsKey, map, selectedHutId, summaries]);

  return null;
}

export function HutMap({ summaries, selectedHutId, onSelectHut }: HutMapProps) {
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
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitMap summaries={summaries} selectedHutId={selectedHutId} />
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
          >
            <Popup>
              <div className="hut-map-popup">
                <strong>{summary.hut.name}</strong>
                <span>{summary.hut.region}</span>
                <span>{statusText(summary)}</span>
                {summary.stale && <span>Cached result is stale</span>}
                <button type="button" onClick={() => onSelectHut(summary.hut.id)}>
                  Show in list
                </button>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
