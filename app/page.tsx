"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import type { HutMapSummary } from "@/components/HutMap";
import type { Hut, HutAvailabilitySummary, MultiHutAvailabilityResponse, UnitAvailability } from "@/types/availability";
import styles from "./page.module.css";

const HutMap = dynamic(() => import("@/components/HutMap").then((m) => m.HutMap), { ssr: false, loading: () => <div className={styles.mapLoading}>Loading map…</div> });
type Tab = "map" | "week";
const format = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const addDays = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return iso(d); };

export default function Home() {
  const [tab, setTab] = useState<Tab>("map");
  const [huts, setHuts] = useState<Hut[]>([]);
  const [arrival, setArrival] = useState(addDays(1));
  const [departure, setDeparture] = useState(addDays(2));
  const [availability, setAvailability] = useState<MultiHutAvailabilityResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bounds, setBounds] = useState<{ north: number; south: number; east: number; west: number } | null>(null);

  useEffect(() => { void fetch("/api/huts").then((r) => r.json()).then((data) => setHuts(data.huts ?? [])); }, []);
  useEffect(() => {
    if (!huts.length) return;
    const controller = new AbortController();
    void fetch("/api/huts/availability", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ arrivalDate: arrival, departureDate: departure, adults: 1, children: [], hutIds: huts.map((hut) => hut.id), mode: "quick" }) }).then(async (r) => { if (r.ok) setAvailability(await r.json()); }).catch(() => undefined);
    return () => controller.abort();
  }, [arrival, departure, huts]);

  const byId = useMemo(() => new Map((availability?.huts ?? []).map((result) => [result.hut.id, result])), [availability]);
  const summaries = useMemo<HutMapSummary[]>(() => huts.map((hut) => { const result = byId.get(hut.id); return { hut, status: !result ? "unknown" : result.status === "error" ? "error" : result.availableCount ? "available" : "unavailable", availableCount: result?.availableCount }; }), [byId, huts]);
  const visible = huts.filter((hut) => !bounds || (hut.lat <= bounds.north && hut.lat >= bounds.south && hut.lng <= bounds.east && hut.lng >= bounds.west));
  const selectedHut = huts.find((hut) => hut.id === selectedId);
  const selected = selectedHut ? byId.get(selectedHut.id) : undefined;

  return <main className={styles.app}>
    <header className={styles.topbar}><div><p>PZS Hut Availability Finder</p><h1>Mountain huts</h1></div>
      {tab === "map" && <DateRange arrival={arrival} departure={departure} onChange={(start, end) => { setArrival(start); setDeparture(end); }} />}
      <nav aria-label="Views"><button className={tab === "map" ? styles.activeTab : ""} onClick={() => setTab("map")}>Map</button><button className={tab === "week" ? styles.activeTab : ""} onClick={() => setTab("week")}>7-day availability</button></nav>
    </header>
    {tab === "map" ? <section className={styles.mapView}>
      <aside className={styles.listPane}><div className={styles.listHeader}><strong>Huts in this area</strong><span>{visible.length} huts</span></div><div className={styles.hutList}>{visible.map((hut) => <HutCard key={hut.id} hut={hut} result={byId.get(hut.id)} onClick={() => setSelectedId(hut.id)} />)}</div>{selectedHut && <HutDetail hut={selectedHut} result={selected} onClose={() => setSelectedId(null)} />}</aside>
      <section className={styles.mapStage}><HutMap summaries={summaries} selectedHutId={selectedId ?? ""} onSelectHut={setSelectedId} onBoundsChange={setBounds} /></section>
    </section> : <WeekView huts={huts} />}
  </main>;
}

function DateRange({ arrival, departure, onChange }: { arrival: string; departure: string; onChange: (arrival: string, departure: string) => void }) {
  const [open, setOpen] = useState(false); const [month, setMonth] = useState(() => new Date(`${arrival}T12:00:00`)); const [draft, setDraft] = useState<string | null>(null);
  const choose = (date: string) => { if (!draft || date <= draft) { setDraft(date); return; } onChange(draft, date); setDraft(null); setOpen(false); };
  return <div className={styles.dateRange}><button className={styles.dateTrigger} onClick={() => setOpen((value) => !value)}><span><small>Arrival</small>{format(arrival)}</span><span><small>Departure</small>{format(departure)}</span></button>{open && <div className={styles.calendarPopover}><button className={styles.monthNav} onClick={() => setMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>‹</button><Calendar month={month} selectedStart={draft ?? arrival} selectedEnd={draft ? undefined : departure} onChoose={choose} /><Calendar month={new Date(month.getFullYear(), month.getMonth() + 1, 1)} selectedStart={draft ?? arrival} selectedEnd={draft ? undefined : departure} onChoose={choose} /><button className={styles.monthNav} onClick={() => setMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>›</button><p>{draft ? "Choose departure date" : "Choose arrival date"}</p></div>}</div>;
}

function Calendar({ month, selectedStart, selectedEnd, onChoose }: { month: Date; selectedStart: string; selectedEnd?: string; onChoose: (date: string) => void }) { const first = new Date(month.getFullYear(), month.getMonth(), 1); const days = Array.from({ length: new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)); return <section className={styles.calendar}><strong>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</strong><div className={styles.weekdays}>{["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((day) => <span key={day}>{day}</span>)}</div><div className={styles.calendarDays}>{Array.from({ length: (first.getDay() + 6) % 7 }).map((_, i) => <span key={`empty-${i}`} />)}{days.map((day) => { const value = iso(day); const selected = value === selectedStart || value === selectedEnd; const inRange = selectedEnd && value > selectedStart && value < selectedEnd; return <button key={value} className={`${selected ? styles.selectedDay : ""} ${inRange ? styles.rangeDay : ""}`} onClick={() => onChoose(value)}>{day.getDate()}</button>; })}</div></section>; }

function HutCard({ hut, result, onClick }: { hut: Hut; result?: HutAvailabilitySummary; onClick: () => void }) { const note = !result ? "Checking availability…" : result.status === "pending" ? "Availability refresh queued" : result.availableCount ? `${result.availableCount} available option${result.availableCount === 1 ? "" : "s"}` : "No availability found"; return <button className={styles.hutCard} onClick={onClick}>{hut.photoUrl && <Image src={hut.photoUrl} alt="" width={92} height={76} className={styles.hutPhoto} unoptimized />}<span><strong>{hut.name}</strong><small>{hut.region}</small><em className={result?.availableCount ? styles.availableNote : ""}>{note}</em></span></button>; }
function HutDetail({ hut, result, onClose }: { hut: Hut; result?: HutAvailabilitySummary; onClose: () => void }) { const units = result?.results ?? []; return <section className={styles.detailPanel}><button className={styles.closeButton} onClick={onClose}>×</button>{hut.photoUrl && <Image src={hut.photoUrl} alt="" width={560} height={300} className={styles.detailPhoto} unoptimized />}<p className={styles.detailRegion}>{hut.region}</p><h2>{hut.name}</h2><p>{!result || result.status === "pending" ? "Checking availability for the selected dates…" : result.availableCount ? `${result.availableCount} accommodation options available for the selected dates.` : "No availability found for the selected dates."}</p><h3>Availability by unit</h3><div className={styles.unitTable}>{units.map((unit) => <UnitRow key={unit.bentralUnitId} unit={unit} />)}</div><div className={styles.detailActions}><a href={hut.bentralIframeUrl} target="_blank" rel="noreferrer">Make a reservation</a><a href={hut.pzsUrl} target="_blank" rel="noreferrer">PZS hut page</a></div></section>; }
function UnitRow({ unit }: { unit: UnitAvailability }) { return <div><strong>{unit.unitName}</strong><span className={unit.status === "available" ? styles.availableNote : unit.status === "unavailable" ? styles.unavailableNote : ""}>{unit.status === "available" ? "Available" : unit.status === "unavailable" ? "Unavailable" : "Unknown"}{unit.priceDisplay ? ` · ${unit.priceDisplay}` : ""}</span></div>; }
function WeekView({ huts }: { huts: Hut[] }) { return <section className={styles.overview}><h2>7-day availability</h2><p>Regional comparison remains available here; choose a hut from the Map to inspect its booking options.</p><div className={styles.weekBoard}>{huts.map((hut) => <div className={styles.weekRow} key={hut.id}>{hut.name}</div>)}</div></section>; }
