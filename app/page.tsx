"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import type { HutMapSummary } from "@/components/HutMap";
import type { Hut, HutAvailabilitySummary, MultiHutAvailabilityResponse, UnitAvailability } from "@/types/availability";
import styles from "./page.module.css";

const HutMap = dynamic(() => import("@/components/HutMap").then((m) => m.HutMap), { ssr: false, loading: () => <div className={styles.mapLoading}>Nalaganje zemljevida …</div> });
type Tab = "map" | "week";
type Language = "sl" | "en";
const dateLocale = (language: Language) => language === "sl" ? "sl-SI" : "en-GB";
const format = (value: string, language: Language) => new Date(`${value}T12:00:00`).toLocaleDateString(dateLocale(language), { day: "numeric", month: "short", year: "numeric" });
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const addDays = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return iso(d); };
const todayIso = () => iso(new Date());
const horizonEndIso = () => { const d = new Date(); d.setMonth(d.getMonth() + 3); return iso(d); };

export default function Home() {
  const [tab, setTab] = useState<Tab>("map");
  const [huts, setHuts] = useState<Hut[]>([]);
  const [arrival, setArrival] = useState(addDays(1));
  const [departure, setDeparture] = useState(addDays(2));
  const [availability, setAvailability] = useState<MultiHutAvailabilityResponse | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bounds, setBounds] = useState<{ north: number; south: number; east: number; west: number } | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [language, setLanguage] = useState<Language>("sl");

  useEffect(() => { void fetch("/api/huts").then((r) => r.json()).then((data) => setHuts(data.huts ?? [])); }, []);
  const loadAvailability = useCallback(async () => {
    if (!huts.length) return;
    setAvailabilityLoading(true);
    try {
      const response = await fetch("/api/huts/availability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ arrivalDate: arrival, departureDate: departure, adults: 1, children: [], hutIds: huts.map((hut) => hut.id), mode: "quick" }) });
      if (response.ok) setAvailability(await response.json());
    } catch {
      // Leave the last stored result visible and retry while a refresh is pending.
    } finally {
      setAvailabilityLoading(false);
    }
  }, [arrival, departure, huts]);
  useEffect(() => {
    if (!huts.length) return;
    const controller = new AbortController();
    void loadAvailability();
    return () => controller.abort();
  }, [loadAvailability, huts]);

  const byId = useMemo(() => new Map((availability?.huts ?? []).map((result) => [result.hut.id, result])), [availability]);
  const summaries = useMemo<HutMapSummary[]>(() => huts.map((hut) => { const result = byId.get(hut.id); return { hut, status: !result ? "unknown" : result.status === "error" ? "error" : result.availableCount ? "available" : "unavailable", availableCount: result?.availableCount }; }), [byId, huts]);
  const visible = huts.filter((hut) => !bounds || (hut.lat <= bounds.north && hut.lat >= bounds.south && hut.lng <= bounds.east && hut.lng >= bounds.west));
  const selectedHut = huts.find((hut) => hut.id === selectedId);
  const selected = selectedHut ? byId.get(selectedHut.id) : undefined;
  const refreshPending = !availability || availability.huts.some((result) => result.status === "pending" || (result.stale && result.status !== "error"));
  useEffect(() => {
    if (!refreshPending) return;
    const timer = window.setTimeout(() => { void loadAvailability(); }, 5000);
    return () => window.clearTimeout(timer);
  }, [loadAvailability, refreshPending]);

  return <main className={`${styles.app} ${tab === "map" ? styles.mapApp : ""}`}>
    <header className={styles.topbar}><div><h1>Proste koče PZS</h1><button className={styles.aboutLink} type="button" onClick={() => setAboutOpen(true)}>{language === "sl" ? "O tej aplikaciji" : "About this app"}</button></div>
      {tab === "map" && <DateRange language={language} arrival={arrival} departure={departure} onChange={(start, end) => { setArrival(start); setDeparture(end); }} />}
      <div className={styles.headerControls}><nav aria-label={language === "sl" ? "Pogledi" : "Views"}><button className={tab === "map" ? styles.activeTab : ""} onClick={() => setTab("map")}>{language === "sl" ? "Zemljevid" : "Map"}</button><button className={tab === "week" ? styles.activeTab : ""} onClick={() => setTab("week")}>{language === "sl" ? "Teden" : "Week"}</button></nav><div className={styles.languageSwitch} aria-label={language === "sl" ? "Jezik" : "Language"}><button className={language === "sl" ? styles.activeLanguage : ""} onClick={() => setLanguage("sl")}>SLO</button><button className={language === "en" ? styles.activeLanguage : ""} onClick={() => setLanguage("en")}>ENG</button></div></div>
    </header>
    {tab === "map" ? <section className={styles.mapView}>
      <aside className={styles.listPane}>
        <div className={styles.listHeader}>
          <span>{visible.length} {language === "en" ? "huts" : visible.length === 1 ? "koča" : visible.length === 2 ? "koči" : visible.length < 5 ? "koče" : "koč"}</span>
        </div>
        {(refreshPending || availabilityLoading) && <div className={styles.listLoading}><span className={styles.spinner} aria-hidden="true" />{language === "sl" ? "Razpoložljivost se nalaga v ozadju …" : "Availability is loading in the background …"}</div>}
        <div className={styles.hutList} id="hut-results">{visible.map((hut) => <HutCard key={hut.id} hut={hut} result={byId.get(hut.id)} language={language} onClick={() => setSelectedId(hut.id)} />)}</div>
        {selectedHut && <HutDetail hut={selectedHut} result={selected} language={language} onClose={() => setSelectedId(null)} />}
      </aside>
      <section className={styles.mapStage}><HutMap summaries={summaries} selectedHutId={selectedId ?? ""} onSelectHut={setSelectedId} onBoundsChange={setBounds} /></section>
    </section> : <WeekView huts={huts} language={language} />}
    {aboutOpen && <AboutDialog language={language} onClose={() => setAboutOpen(false)} />}
  </main>;
}

function AboutDialog({ language, onClose }: { language: Language; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return <div className={styles.aboutOverlay} role="presentation" onMouseDown={onClose}>
    <section className={styles.aboutDialog} role="dialog" aria-modal="true" aria-labelledby="about-title" onMouseDown={(event) => event.stopPropagation()}>
      <button ref={closeRef} className={styles.aboutClose} type="button" onClick={onClose} aria-label={language === "sl" ? "Zapri okno" : "Close dialog"}>×</button>
      <p className={styles.aboutEyebrow}>Proste koče PZS</p>
      <h2 id="about-title">{language === "sl" ? "O tej aplikaciji" : "About this app"}</h2>
      <p>{language === "sl" ? "To aplikacijo sem razvil iz lastne frustracije: na spletnih straneh PZS je bilo treba za preverjanje razpoložljivosti vsako kočo posebej odpreti in preveriti rezultate rezervacije." : "I developed this app out of personal frustration: on the PZS reservation pages, every hut had to be opened separately to check availability."}</p>
      <p>{language === "sl" ? "Tu so na enem mestu prikazane koče PZS, ki jih je mogoče rezervirati prek spleta." : "It brings together PZS huts that can be booked online."}</p>
      <p>{language === "sl" ? "Predloge, opažanja ali popravke mi lahko pošljete na " : "Send suggestions, feedback, or corrections to "}<a href="mailto:danijel@guitwist.com">danijel@guitwist.com</a>.</p>
    </section>
  </div>;
}

function DateRange({ language, arrival, departure, onChange }: { language: Language; arrival: string; departure: string; onChange: (arrival: string, departure: string) => void }) {
  const [open, setOpen] = useState(false); const [month, setMonth] = useState(() => new Date(`${arrival}T12:00:00`)); const [draftStart, setDraftStart] = useState<string | null>(null); const [draftEnd, setDraftEnd] = useState<string | null>(null); const [loadedDates, setLoadedDates] = useState<Set<string>>(new Set());
  const minDate = todayIso(); const maxDate = horizonEndIso(); const firstAllowedMonth = minDate.slice(0, 7); const lastAllowedMonth = maxDate.slice(0, 7); const shownMonth = iso(new Date(month.getFullYear(), month.getMonth(), 1)).slice(0, 7);
  useEffect(() => { if (!open) return; const start = new Date(month.getFullYear(), month.getMonth(), 1); const dates = Array.from({ length: 62 }, (_, index) => iso(new Date(start.getFullYear(), start.getMonth(), index + 1))); let active = true; void fetch("/api/huts/calendar-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dates }) }).then(async (response) => { if (response.ok && active) { const data = await response.json(); setLoadedDates(new Set(data.dates)); } }).catch(() => undefined); return () => { active = false; }; }, [month, open]);
  const close = () => { setDraftStart(null); setDraftEnd(null); setOpen(false); };
  const openPicker = () => { setMonth(new Date(`${arrival}T12:00:00`)); setDraftStart(arrival); setDraftEnd(departure); setOpen(true); };
  const choose = (date: string) => { if (!draftStart || draftEnd || date <= draftStart) { setDraftStart(date); setDraftEnd(null); return; } setDraftEnd(date); };
  const apply = () => { if (!draftStart || !draftEnd) return; onChange(draftStart, draftEnd); close(); };
  return <div className={styles.dateRange}><button className={styles.dateTrigger} type="button" onClick={openPicker} aria-expanded={open} aria-haspopup="dialog"><span><small>{language === "sl" ? "Prihod" : "Arrival"}</small>{format(arrival, language)}</span><span><small>{language === "sl" ? "Odhod" : "Departure"}</small>{format(departure, language)}</span></button>{open && <div className={styles.calendarOverlay} role="presentation" onMouseDown={close}><section className={styles.calendarPopover} role="dialog" aria-modal="true" aria-label={language === "sl" ? "Izberite datuma bivanja" : "Choose stay dates"} onMouseDown={(event) => event.stopPropagation()}><div className={styles.calendarTitle}><strong>{language === "sl" ? "Izberite datuma bivanja" : "Choose stay dates"}</strong><button type="button" className={styles.calendarClose} onClick={close} aria-label={language === "sl" ? "Zapri izbirnik datumov" : "Close date picker"}>×</button></div><button type="button" className={styles.monthNav} disabled={shownMonth <= firstAllowedMonth} onClick={() => setMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))} aria-label={language === "sl" ? "Prejšnji mesec" : "Previous month"}>‹</button><Calendar language={language} month={month} minDate={minDate} maxDate={maxDate} selectedStart={draftStart ?? arrival} selectedEnd={draftEnd ?? undefined} loadedDates={loadedDates} onChoose={choose} /><div className={styles.secondCalendar}><Calendar language={language} month={new Date(month.getFullYear(), month.getMonth() + 1, 1)} minDate={minDate} maxDate={maxDate} selectedStart={draftStart ?? arrival} selectedEnd={draftEnd ?? undefined} loadedDates={loadedDates} onChoose={choose} /></div><button type="button" className={styles.monthNav} disabled={shownMonth >= lastAllowedMonth} onClick={() => setMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))} aria-label={language === "sl" ? "Naslednji mesec" : "Next month"}>›</button><div className={styles.calendarActions}><p>{draftEnd ? `${format(draftStart!, language)} ${language === "sl" ? "do" : "to"} ${format(draftEnd, language)}` : language === "sl" ? "Izberite datum prihoda in odhoda" : "Choose an arrival and departure date"}</p><button type="button" onClick={close}>{language === "sl" ? "Prekliči" : "Cancel"}</button><button type="button" className={styles.applyDates} onClick={apply} disabled={!draftStart || !draftEnd}>{language === "sl" ? "Potrdi datuma" : "Apply dates"}</button></div></section></div>}</div>;
}

function Calendar({ language, month, minDate, maxDate, selectedStart, selectedEnd, loadedDates, onChoose }: { language: Language; month: Date; minDate: string; maxDate: string; selectedStart: string; selectedEnd?: string; loadedDates: Set<string>; onChoose: (date: string) => void }) { const first = new Date(month.getFullYear(), month.getMonth(), 1); const days = Array.from({ length: new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)); const weekdays = language === "sl" ? ["Po", "To", "Sr", "Če", "Pe", "So", "Ne"] : ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]; return <section className={styles.calendar}><strong>{month.toLocaleDateString(dateLocale(language), { month: "long", year: "numeric" })}</strong><div className={styles.weekdays}>{weekdays.map((day) => <span key={day} className={day === (language === "sl" ? "So" : "Sa") || day === (language === "sl" ? "Ne" : "Su") ? styles.weekendLabel : ""}>{day}</span>)}</div><div className={styles.calendarDays}>{Array.from({ length: (first.getDay() + 6) % 7 }).map((_, i) => <span key={`empty-${i}`} />)}{days.map((day) => { const value = iso(day); const selected = value === selectedStart || value === selectedEnd; const inRange = selectedEnd && value > selectedStart && value < selectedEnd; const weekend = day.getDay() === 0 || day.getDay() === 6; const disabled = value < minDate || value > maxDate; return <button key={value} disabled={disabled} className={`${weekend ? styles.weekendDay : ""} ${loadedDates.has(value) ? styles.loadedDay : ""} ${selected ? styles.selectedDay : ""} ${inRange ? styles.rangeDay : ""}`} onClick={() => onChoose(value)}>{day.getDate()}</button>; })}</div></section>; }

function HutCard({ hut, result, language, onClick }: { hut: Hut; result?: HutAvailabilitySummary; language: Language; onClick: () => void }) { const note = !result || result.status === "pending" ? "" : result.status === "error" ? language === "sl" ? "Preverjanje razpoložljivosti ni uspelo" : "Availability check failed" : result.availableCount ? language === "en" ? `${result.availableCount} free ${result.availableCount === 1 ? "place" : "places"}` : `${result.availableCount} ${result.availableCount === 1 ? "prosto mesto" : result.availableCount === 2 ? "prosti mesti" : result.availableCount < 5 ? "prosta mesta" : "prostih mest"}` : language === "sl" ? "Ni razpoložljivih mest" : "No availability found"; return <button className={styles.hutCard} onClick={onClick}>{hut.photoUrl && <Image src={hut.photoUrl} alt="" width={92} height={76} className={styles.hutPhoto} unoptimized />}<span><strong>{hut.name}</strong><small>{hut.region}</small>{note && <em className={result?.availableCount ? styles.availableNote : result?.status === "error" ? styles.unavailableNote : ""}>{note}</em>}</span></button>; }
function HutDetail({ hut, result, language, onClose }: { hut: Hut; result?: HutAvailabilitySummary; language: Language; onClose: () => void }) { const units = result?.results ?? []; const closeRef = useRef<HTMLButtonElement>(null); useEffect(() => { const previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; closeRef.current?.focus(); const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", onKeyDown); return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); }; }, [onClose]); const summary = !result || result.status === "pending" ? language === "sl" ? "Preverjanje razpoložljivosti za izbrana datuma …" : "Checking availability for the selected dates …" : result.availableCount ? language === "sl" ? `${result.availableCount} prostih mest za izbrana datuma.` : `${result.availableCount} free places for the selected dates.` : language === "sl" ? "Za izbrana datuma ni razpoložljivih mest." : "No availability found for the selected dates."; return <section className={styles.detailPanel} role="dialog" aria-modal="true" aria-labelledby="hut-detail-title"><div className={styles.sheetHandle} aria-hidden="true" /><button ref={closeRef} className={styles.closeButton} type="button" onClick={onClose} aria-label={language === "sl" ? "Zapri podrobnosti koče" : "Close hut details"}>×</button>{hut.photoUrl && <Image src={hut.photoUrl} alt="" width={560} height={300} className={styles.detailPhoto} unoptimized />}<p className={styles.detailRegion}>{hut.region}</p><h2 id="hut-detail-title">{hut.name}</h2><p>{summary}</p><h3>{language === "sl" ? "Razpoložljivost po enotah" : "Availability by unit"}</h3><div className={styles.unitTable}>{units.map((unit) => <UnitRow key={unit.bentralUnitId} unit={unit} language={language} />)}</div><div className={styles.detailActions}>{hut.mapzsUrl && <a href={hut.mapzsUrl} target="_blank" rel="noreferrer">{language === "sl" ? "Več o koči na maPZS" : "More about this hut on maPZS"}</a>}<a href={hut.pzsUrl} target="_blank" rel="noreferrer">{language === "sl" ? "Stran koče na PZS" : "Hut page on PZS"}</a></div></section>; }
function UnitRow({ unit, language }: { unit: UnitAvailability; language: Language }) { return <div><strong>{unit.unitName}</strong><span className={unit.status === "available" ? styles.availableNote : unit.status === "unavailable" ? styles.unavailableNote : ""}>{unit.status === "available" ? language === "sl" ? "Na voljo" : "Available" : unit.status === "unavailable" ? language === "sl" ? "Ni na voljo" : "Unavailable" : language === "sl" ? "Ni podatka" : "Unknown"}{unit.priceDisplay ? ` · ${unit.priceDisplay}` : ""}</span></div>; }
function WeekView({ huts, language }: { huts: Hut[]; language: Language }) {
  const regions = useMemo(() => [...new Set(huts.map((hut) => hut.region))], [huts]);
  const [region, setRegion] = useState("");
  const [offset, setOffset] = useState(1);
  const [grid, setGrid] = useState<Record<string, Record<string, "available" | "unavailable" | "unknown">>>({});
  useEffect(() => { if (!region && regions[0]) setRegion(regions[0]); }, [region, regions]);
  const selectedHuts = useMemo(() => huts.filter((hut) => hut.region === region), [huts, region]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => { const arrivalDate = addDays(offset + index); return { arrivalDate, departureDate: addDays(offset + index + 1), label: new Date(`${arrivalDate}T12:00:00`).toLocaleDateString(dateLocale(language), { weekday: "short", month: "numeric", day: "numeric" }) }; }), [language, offset]);
  useEffect(() => {
    if (!selectedHuts.length) return;
    let active = true;
    void fetch("/api/huts/week-availability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stays: days.map(({ arrivalDate, departureDate }) => ({ arrivalDate, departureDate })), hutIds: selectedHuts.map((hut) => hut.id) }) }).then(async (response) => {
      if (!response.ok || !active) return;
      const data = await response.json(); const next: Record<string, Record<string, "available" | "unavailable" | "unknown">> = {};
      for (const hut of selectedHuts) next[hut.id] = Object.fromEntries(days.map((day) => [day.arrivalDate, "unknown"]));
      for (const item of data.availability) next[item.hutId][item.arrivalDate] = item.status;
      setGrid(next);
    });
    return () => { active = false; };
  }, [days, selectedHuts]);
  const statusLabel = (status: "available" | "unavailable" | "unknown") => status === "available" ? language === "sl" ? "Prosto" : "Available" : status === "unavailable" ? language === "sl" ? "Zasedeno" : "Full" : "—";
  const canGoPrevious = offset > 1; const canGoNext = addDays(offset + 14) <= horizonEndIso();
  return <section className={styles.overview}><div className={styles.overviewTools}><label>{language === "sl" ? "Območje" : "Region"}<select value={region} onChange={(event) => setRegion(event.target.value)}>{regions.map((item) => <option key={item}>{item}</option>)}</select></label><div><button disabled={!canGoPrevious} onClick={() => setOffset((value) => Math.max(1, value - 7))}>{language === "sl" ? "Prejšnji teden" : "Previous week"}</button><button onClick={() => setOffset(1)}>{language === "sl" ? "Danes" : "Today"}</button><button disabled={!canGoNext} onClick={() => setOffset((value) => value + 7)}>{language === "sl" ? "Naslednji teden" : "Next week"}</button></div></div><section className={styles.weekBoard}><div className={styles.weekHeading}><strong>{language === "sl" ? "Razpoložljivost za 7 dni" : "7-day availability"}</strong><span>{language === "sl" ? "Razpoložljivost za eno noč po kočah" : "One-night availability by hut"}</span></div><div className={styles.weekLabels}><span>{language === "sl" ? "Koča" : "Hut"}</span>{days.map((day) => <span key={day.arrivalDate}>{day.label}</span>)}</div>{selectedHuts.map((hut) => <div className={styles.weekRow} key={hut.id}><strong>{hut.name}</strong>{days.map((day) => { const status = grid[hut.id]?.[day.arrivalDate] ?? "unknown"; return <span className={`${styles.dayCell} ${styles[status]}`} key={day.arrivalDate}>{statusLabel(status)}</span>; })}</div>)}</section><section className={styles.weekCards} aria-label={language === "sl" ? "Razpoložljivost koč za 7 dni" : "7-day hut availability"}>{selectedHuts.map((hut) => <article key={hut.id} className={styles.weekCard}><h2>{hut.name}</h2><div>{days.map((day) => { const status = grid[hut.id]?.[day.arrivalDate] ?? "unknown"; return <span className={`${styles.weekDay} ${styles[status]}`} key={day.arrivalDate}><small>{day.label}</small><b>{statusLabel(status)}</b></span>; })}</div></article>)}</section></section>;
}
