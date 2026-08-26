"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import type { HutMapSummary } from "@/components/HutMap";
import type {
  Hut,
  HutAvailabilitySummary,
  MultiHutAvailabilityResponse,
  UnitAvailability,
} from "@/types/availability";
import styles from "./page.module.css";

const HutMap = dynamic(
  () => import("@/components/HutMap").then((module) => module.HutMap),
  {
    ssr: false,
    loading: () => <div className={styles.mapLoading}>Loading map...</div>,
  },
);

type LoadState = "idle" | "loading" | "success" | "error";
type WeekendProgress = {
  active: boolean;
  completed: number;
  total: number;
  label: string;
  message: string;
};
type WeekAvailability = Record<
  string,
  Record<string, "available" | "unavailable" | "unknown">
>;

function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isoDate(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return localDateString(date);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatEstimate(hutCount: number) {
  const seconds = Math.max(8, Math.round(hutCount * 1.8));
  return seconds < 60 ? `about ${seconds}s` : `about ${Math.ceil(seconds / 60)} min`;
}

function nextFourWeekends() {
  const today = new Date();
  const day = today.getDay();
  const daysUntilSaturday = (6 - day + 7) % 7 || 7;

  return Array.from({ length: 4 }, (_, index) => {
    const arrival = new Date(today);
    arrival.setDate(today.getDate() + daysUntilSaturday + index * 7);
    const departure = new Date(arrival);
    departure.setDate(arrival.getDate() + 1);

    return {
      arrivalDate: localDateString(arrival),
      departureDate: localDateString(departure),
      label: `${arrival.toLocaleDateString()} - ${departure.toLocaleDateString()}`,
    };
  });
}

function nextSevenOneNightStays(startOffsetDays = 1) {
  return Array.from({ length: 7 }, (_, index) => {
    const arrival = new Date();
    arrival.setDate(arrival.getDate() + startOffsetDays + index);
    const departure = new Date(arrival);
    departure.setDate(arrival.getDate() + 1);
    const dayOfWeek = arrival.getDay();

    return {
      arrivalDate: localDateString(arrival),
      departureDate: localDateString(departure),
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      label: arrival.toLocaleDateString(undefined, {
        weekday: "short",
        month: "numeric",
        day: "numeric",
      }),
    };
  });
}

export default function Home() {
  const [huts, setHuts] = useState<Hut[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [selectedRegion, setSelectedRegion] = useState("");
  const [selectedHutId, setSelectedHutId] = useState("");
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);
  const [arrivalDate, setArrivalDate] = useState(() => isoDate(0));
  const [departureDate, setDepartureDate] = useState(() => isoDate(1));
  const [adults, setAdults] = useState(1);
  const [childCount, setChildCount] = useState(0);
  const [childAges, setChildAges] = useState<number[]>([]);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState("");
  const [availability, setAvailability] =
    useState<MultiHutAvailabilityResponse | null>(null);
  const [checkingHutId, setCheckingHutId] = useState("");
  const [weekendProgress, setWeekendProgress] = useState<WeekendProgress>({
    active: false,
    completed: 0,
    total: 4,
    label: "",
    message: "Weekend cache warmer is idle.",
  });
  const weekendRunId = useRef(0);
  const weekRunId = useRef(0);
  const [weekStartOffset, setWeekStartOffset] = useState(1);
  const [weekAvailability, setWeekAvailability] = useState<WeekAvailability>({});
  const [weekProgress, setWeekProgress] = useState<WeekendProgress>({
    active: false,
    completed: 0,
    total: 7,
    label: "",
    message: "7-day availability is idle.",
  });
  const weekDays = useMemo(() => nextSevenOneNightStays(weekStartOffset), [weekStartOffset]);

  useEffect(() => {
    let cancelled = false;

    async function loadHuts() {
      try {
        const response = await fetch("/api/huts");
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? "Could not load huts.");
        }

        if (!cancelled) {
          setHuts(payload.huts);
          setRegions(payload.regions);
          setSelectedRegion(payload.regions[0] ?? "");
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load huts.");
          setState("error");
        }
      }
    }

    loadHuts();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredHuts = useMemo(
    () => huts.filter((hut) => hut.region === selectedRegion),
    [huts, selectedRegion],
  );

  useEffect(() => {
    if (
      selectedHutId &&
      !filteredHuts.some((hut) => hut.id === selectedHutId)
    ) {
      setSelectedHutId("");
    }
  }, [filteredHuts, selectedHutId]);

  const visibleResults = useMemo(() => {
    const results = availability?.huts ?? [];
    const regionFiltered = results.filter((result) => result.hut.region === selectedRegion);
    const availabilityFiltered = showAvailableOnly
      ? regionFiltered.filter((result) => result.availableCount > 0)
      : regionFiltered;

    return [...availabilityFiltered].sort((a, b) => {
      const aAvailable = a.availableCount > 0 ? 1 : 0;
      const bAvailable = b.availableCount > 0 ? 1 : 0;

      if (aAvailable !== bAvailable) {
        return bAvailable - aAvailable;
      }

      if (a.availableCount !== b.availableCount) {
        return b.availableCount - a.availableCount;
      }

      return a.hut.name.localeCompare(b.hut.name, "sl");
    });
  }, [availability, selectedRegion, showAvailableOnly]);

  const summary = useMemo(() => {
    const results = availability?.huts ?? [];

    return {
      checked: results.length,
      hutsWithAvailability: results.filter((result) => result.availableCount > 0).length,
      availableUnits: results.reduce((sum, result) => sum + result.availableCount, 0),
      stale: results.filter((result) => result.stale).length,
      unresolved: results.filter((result) => result.status === "error").length,
    };
  }, [availability]);

  const resultByHutId = useMemo(
    () =>
      new Map(
        (availability?.huts ?? []).map((result) => [result.hut.id, result]),
      ),
    [availability],
  );

  const mapSummaries = useMemo<HutMapSummary[]>(
    () =>
      filteredHuts.map((hut) => {
        const result = resultByHutId.get(hut.id);

        if (!result) {
          return {
            hut,
            status: "unknown",
          };
        }

        return {
          hut,
          status:
            result.status === "error"
              ? "error"
              : result.availableCount > 0
                ? "available"
                : "unavailable",
          availableCount: result.availableCount,
          lowestPriceDisplay: result.lowestPriceDisplay,
          stale: result.stale,
        };
      }),
    [filteredHuts, resultByHutId],
  );

  function selectHut(hutId: string) {
    setSelectedHutId(hutId);

    window.requestAnimationFrame(() => {
      document
        .getElementById(`hut-${hutId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  function updateChildCount(nextCount: number) {
    const count = Math.max(0, nextCount);
    setChildCount(count);
    setChildAges((current) => {
      const next = current.slice(0, count);

      while (next.length < count) {
        next.push(10);
      }

      return next;
    });
  }

  function requestBody(hutIds: string[], mode: "quick" | "full") {
    return {
      arrivalDate,
      departureDate,
      adults,
      children: childAges.map((age) => ({ age })),
      hutIds,
      mode,
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("loading");
    setError("");

    try {
      const response = await fetch("/api/huts/availability", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody(filteredHuts.map((hut) => hut.id), "quick")),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Availability request failed.");
      }

      setAvailability(payload);
      setState("success");
      startSevenDayPrecheck(filteredHuts);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not check availability.",
      );
      setState("error");
    }
  }

  async function checkThisHut(hutId: string) {
    setCheckingHutId(hutId);
    setError("");

    try {
      const response = await fetch("/api/huts/availability", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody([hutId], "full")),
      });
      const payload = (await response.json()) as MultiHutAvailabilityResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Full hut check failed.");
      }

      const fullResult = payload.huts[0];

      setAvailability((current) => {
        if (!current) {
          return payload;
        }

        const existingIds = new Set(current.huts.map((item) => item.hut.id));
        const hutsWithReplacement = existingIds.has(hutId)
          ? current.huts.map((item) => (item.hut.id === hutId ? fullResult : item))
          : [...current.huts, fullResult];

        return {
          ...current,
          checkedAt: new Date().toISOString(),
          huts: hutsWithReplacement,
        };
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Could not check this hut.",
      );
    } finally {
      setCheckingHutId("");
    }
  }

  async function checkWeekDay(day: ReturnType<typeof nextSevenOneNightStays>[number]) {
    const runId = weekRunId.current + 1;
    weekRunId.current = runId;
    setWeekProgress({
      active: true,
      completed: 0,
      total: 1,
      label: day.label,
      message: `Checking ${day.label} for ${selectedRegion}.`,
    });

    setWeekAvailability((current) => ({
      ...current,
      ...Object.fromEntries(
        filteredHuts.map((hut) => [
          hut.id,
          {
            ...(current[hut.id] ?? {}),
            [day.arrivalDate]: "unknown",
          },
        ]),
      ),
    }));

    try {
      const response = await fetch("/api/huts/availability", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          arrivalDate: day.arrivalDate,
          departureDate: day.departureDate,
          adults: 1,
          children: [],
          hutIds: filteredHuts.map((hut) => hut.id),
          mode: "quick",
        }),
      });
      const payload = (await response.json()) as MultiHutAvailabilityResponse;

      if (!response.ok) {
        throw new Error("Could not check this day.");
      }

      if (weekRunId.current !== runId) {
        return;
      }

      setWeekAvailability((current) => {
        const next = { ...current };

        for (const hutResult of payload.huts) {
          next[hutResult.hut.id] = {
            ...(next[hutResult.hut.id] ?? {}),
            [day.arrivalDate]:
              hutResult.availableCount > 0 ? "available" : "unavailable",
          };
        }

        return next;
      });
      setWeekProgress({
        active: false,
        completed: 1,
        total: 1,
        label: "",
        message: `${day.label} checked for ${selectedRegion}.`,
      });
    } catch (requestError) {
      setWeekProgress({
        active: false,
        completed: 0,
        total: 1,
        label: "",
        message:
          requestError instanceof Error
            ? requestError.message
            : "Could not check this day.",
      });
    }
  }

  async function startWeekendPrecheck(regionHuts: Hut[]) {
    const runId = weekendRunId.current + 1;
    weekendRunId.current = runId;

    const weekends = nextFourWeekends();
    setWeekendProgress({
      active: true,
      completed: 0,
      total: weekends.length,
      label: weekends[0]?.label ?? "",
      message: `Warming next 4 weekends for ${selectedRegion}.`,
    });

    for (let index = 0; index < weekends.length; index += 1) {
      if (weekendRunId.current !== runId) {
        return;
      }

      const weekend = weekends[index];
      setWeekendProgress({
        active: true,
        completed: index,
        total: weekends.length,
        label: weekend.label,
        message: `Checking weekend ${index + 1} of ${weekends.length}.`,
      });

      try {
        await fetch("/api/huts/availability", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            arrivalDate: weekend.arrivalDate,
            departureDate: weekend.departureDate,
            adults: 1,
            children: [],
            hutIds: regionHuts.map((hut) => hut.id),
            mode: "quick",
          }),
        });
      } catch {
        // Background warming is opportunistic; the visible search remains authoritative.
      }

      if (index < weekends.length - 1) {
        await sleep(5000);
      }
    }

    if (weekendRunId.current === runId) {
      setWeekendProgress({
        active: false,
        completed: weekends.length,
        total: weekends.length,
        label: "",
        message: `Next 4 weekends cached for ${selectedRegion}.`,
      });
    }
  }

  async function startSevenDayPrecheck(regionHuts: Hut[]) {
    const runId = weekRunId.current + 1;
    weekRunId.current = runId;

    setWeekAvailability(
      Object.fromEntries(
        regionHuts.map((hut) => [
          hut.id,
          Object.fromEntries(weekDays.map((day) => [day.arrivalDate, "unknown"])),
        ]),
      ),
    );
    setWeekProgress({
      active: true,
      completed: 0,
      total: weekDays.length,
      label: weekDays[0]?.label ?? "",
      message: `Building 7-day view for ${selectedRegion}.`,
    });

    for (let index = 0; index < weekDays.length; index += 1) {
      if (weekRunId.current !== runId) {
        return;
      }

      const day = weekDays[index];
      setWeekProgress({
        active: true,
        completed: index,
        total: weekDays.length,
        label: day.label,
        message: `Checking day ${index + 1} of ${weekDays.length}.`,
      });

      try {
        const response = await fetch("/api/huts/availability", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            arrivalDate: day.arrivalDate,
            departureDate: day.departureDate,
            adults: 1,
            children: [],
            hutIds: regionHuts.map((hut) => hut.id),
            mode: "quick",
          }),
        });
        const payload = (await response.json()) as MultiHutAvailabilityResponse;

        if (response.ok) {
          setWeekAvailability((current) => {
            const next = { ...current };

            for (const hutResult of payload.huts) {
              next[hutResult.hut.id] = {
                ...(next[hutResult.hut.id] ?? {}),
                [day.arrivalDate]:
                  hutResult.availableCount > 0 ? "available" : "unavailable",
              };
            }

            return next;
          });
        }
      } catch {
        // Keep failed background segments gray.
      }

      if (index < weekDays.length - 1) {
        await sleep(2500);
      }
    }

    if (weekRunId.current === runId) {
      setWeekProgress({
        active: false,
        completed: weekDays.length,
        total: weekDays.length,
        label: "",
        message: `7-day view cached for ${selectedRegion}.`,
      });
      startWeekendPrecheck(regionHuts);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.header}>
        <div>
          <p className={styles.eyebrow}>PZS Hut Availability Finder</p>
          <h1>Mountain hut availability</h1>
          <p className={styles.meta}>
            Quick region scans stop at the first available unit per hut. Cached
            availability is marked stale after 15 minutes.
          </p>
        </div>
      </section>

      <nav className={styles.tabs} aria-label="Regions">
        {regions.map((region) => {
          const hutCount = huts.filter((hut) => hut.region === region).length;

          return (
            <button
              key={region}
              type="button"
              className={region === selectedRegion ? styles.activeTab : ""}
              onClick={() => {
                weekendRunId.current += 1;
                weekRunId.current += 1;
                setSelectedRegion(region);
                setSelectedHutId("");
                setAvailability(null);
                setState("idle");
                setWeekStartOffset(1);
                setWeekAvailability({});
                setWeekProgress({
                  active: false,
                  completed: 0,
                  total: 7,
                  label: "",
                  message: "7-day availability is idle.",
                });
                setWeekendProgress({
                  active: false,
                  completed: 0,
                  total: 4,
                  label: "",
                  message: "Weekend cache warmer is idle.",
                });
              }}
            >
              {region}
              <span>{hutCount}</span>
            </button>
          );
        })}
      </nav>

      <SevenDayAvailability
        days={weekDays}
        huts={filteredHuts}
        availability={weekAvailability}
        progress={weekProgress}
        onPrevWeek={() => {
          weekRunId.current += 1;
          setWeekStartOffset((current) => current - 7);
          setWeekAvailability({});
          setWeekProgress({
            active: false,
            completed: 0,
            total: 7,
            label: "",
            message: "7-day availability is idle.",
          });
        }}
        onNextWeek={() => {
          weekRunId.current += 1;
          setWeekStartOffset((current) => current + 7);
          setWeekAvailability({});
          setWeekProgress({
            active: false,
            completed: 0,
            total: 7,
            label: "",
            message: "7-day availability is idle.",
          });
        }}
        onToday={() => {
          weekRunId.current += 1;
          setWeekStartOffset(0);
          setWeekAvailability({});
          setWeekProgress({
            active: false,
            completed: 0,
            total: 7,
            label: "",
            message: "7-day availability is idle.",
          });
        }}
        onDayClick={checkWeekDay}
      />

      <form className={styles.search} onSubmit={handleSubmit}>
        <label>
          Arrival
          <input
            required
            type="date"
            value={arrivalDate}
            onChange={(event) => setArrivalDate(event.target.value)}
          />
        </label>
        <label>
          Departure
          <input
            required
            type="date"
            value={departureDate}
            onChange={(event) => setDepartureDate(event.target.value)}
          />
        </label>
        <label>
          Adults
          <input
            min={1}
            required
            type="number"
            value={adults}
            onChange={(event) => setAdults(Number(event.target.value))}
          />
        </label>
        <label>
          Children
          <input
            min={0}
            type="number"
            value={childCount}
            onChange={(event) => updateChildCount(Number(event.target.value))}
          />
        </label>

        {childAges.map((age, index) => (
          <label key={index}>
            Child {index + 1} age
            <input
              min={0}
              max={17}
              required
              type="number"
              value={age}
              onChange={(event) => {
                const next = [...childAges];
                next[index] = Number(event.target.value);
                setChildAges(next);
              }}
            />
          </label>
        ))}

        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={showAvailableOnly}
            onChange={(event) => setShowAvailableOnly(event.target.checked)}
          />
          Show available only
        </label>

        <button type="submit" disabled={state === "loading" || filteredHuts.length === 0}>
          {state === "loading" ? "Checking..." : `Search ${selectedRegion}`}
        </button>
      </form>

      <div className={styles.loadNote}>
        <span>{filteredHuts.length} huts in this region</span>
        <span>Cold quick check estimate: {formatEstimate(filteredHuts.length)}</span>
        <span>Cached searches are usually much faster.</span>
      </div>

      <WeekendProgress progress={weekendProgress} />

      <div className={styles.resultLayout}>
        <section className={styles.results} aria-live="polite">
          {state === "idle" && (
            <div className={styles.empty}>
              Select a region and search. The first pass stops at the first available
              unit per hut.
            </div>
          )}

          {state === "loading" && (
            <div className={styles.empty}>
              Checking {filteredHuts.length} huts in {selectedRegion}. Cold estimate:{" "}
              {formatEstimate(filteredHuts.length)}.
            </div>
          )}

          {state === "error" && <div className={styles.error}>{error}</div>}

          {error && state !== "error" && <div className={styles.error}>{error}</div>}

          {availability && state === "success" && (
            <>
              <div className={styles.summary}>
                <strong>{summary.hutsWithAvailability}</strong> huts with availability
                <span>{summary.availableUnits} available signals</span>
                <span>{summary.checked} huts checked</span>
                {summary.stale > 0 && <span>{summary.stale} stale cached rows</span>}
                {summary.unresolved > 0 && <span>{summary.unresolved} hut errors</span>}
                <time dateTime={availability.checkedAt}>
                  Checked {new Date(availability.checkedAt).toLocaleString()}
                </time>
              </div>

              {visibleResults.length === 0 ? (
                <div className={styles.empty}>No huts match the current filters.</div>
              ) : (
                <div className={styles.hutRows}>
                  {visibleResults.map((result) => (
                    <HutRow
                      key={result.hut.id}
                      result={result}
                      isChecking={checkingHutId === result.hut.id}
                      selected={selectedHutId === result.hut.id}
                      onCheck={() => checkThisHut(result.hut.id)}
                      onSelect={() => selectHut(result.hut.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        <aside className={styles.mapPane} aria-label="Hut map">
          <div className={styles.mapShell}>
            <div className={styles.mapHeader}>
              <strong>{selectedRegion || "Huts"}</strong>
              <span>{mapSummaries.length} mapped huts</span>
            </div>
            <HutMap
              summaries={mapSummaries}
              selectedHutId={selectedHutId}
              onSelectHut={selectHut}
            />
          </div>
        </aside>
      </div>
    </main>
  );
}

function WeekendProgress({ progress }: { progress: WeekendProgress }) {
  const pct = Math.round((progress.completed / progress.total) * 100);

  return (
    <div className={styles.weekendProgress}>
      <div>
        <strong>Weekend cache warmer</strong>
        <span>{progress.message}</span>
        {progress.label && <span>{progress.label}</span>}
      </div>
      <div className={styles.progressBar} aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SevenDayAvailability({
  days,
  huts,
  availability,
  progress,
  onPrevWeek,
  onNextWeek,
  onToday,
  onDayClick,
}: {
  days: ReturnType<typeof nextSevenOneNightStays>;
  huts: Hut[];
  availability: WeekAvailability;
  progress: WeekendProgress;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onDayClick: (day: ReturnType<typeof nextSevenOneNightStays>[number]) => void;
}) {
  return (
    <section className={styles.weekBoard}>
      <div className={styles.weekBoardHeader}>
        <div>
          <strong>Next 7 days</strong>
          <span>One-night quick signal, first available unit per hut</span>
        </div>
        <div className={styles.weekTools}>
          <button type="button" onClick={onPrevWeek}>
            Prev
          </button>
          <button type="button" onClick={onToday}>
            Today
          </button>
          <button type="button" onClick={onNextWeek}>
            Next
          </button>
          <span>
            {progress.active
              ? `${progress.message} ${progress.label}`
              : progress.message}
          </span>
        </div>
      </div>
      <div className={styles.dayLabels}>
        <span />
        <div className={styles.dayLabelLine}>
          {days.map((day) => (
            <button
              key={day.arrivalDate}
              type="button"
              className={day.isWeekend ? styles.weekendDay : ""}
              onClick={() => onDayClick(day)}
              title={`Check ${day.label} for all huts in this region`}
            >
              {day.label}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.weekRows}>
        {huts.map((hut) => (
          <div key={hut.id} className={styles.weekRow}>
            <span className={styles.weekHutName}>{hut.name}</span>
            <div className={styles.dayLine} aria-label={`${hut.name} next 7 days`}>
              {days.map((day) => {
                const status = availability[hut.id]?.[day.arrivalDate] ?? "unknown";

                return (
                  <span
                    key={day.arrivalDate}
                    className={`${styles.daySegment} ${styles[status]} ${
                      day.isWeekend ? styles.weekendSegment : ""
                    }`}
                    title={`${day.label}: ${status}`}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function HutRow({
  result,
  isChecking,
  selected,
  onCheck,
  onSelect,
}: {
  result: HutAvailabilitySummary;
  isChecking: boolean;
  selected: boolean;
  onCheck: () => void;
  onSelect: () => void;
}) {
  const available = result.results.filter((unit) => unit.status === "available");
  const unavailable = result.results.filter((unit) => unit.status === "unavailable");
  const unresolved = result.results.filter(
    (unit) => unit.status === "unknown" || unit.status === "error",
  );
  const previewUnits = [...available, ...unavailable, ...unresolved].slice(0, 4);
  const rowState =
    result.status === "error"
      ? styles.rowError
      : result.availableCount > 0
        ? styles.rowAvailable
        : styles.rowUnavailable;

  return (
    <article
      id={`hut-${result.hut.id}`}
      className={`${styles.hutRow} ${rowState} ${selected ? styles.selectedRow : ""}`}
      onClick={onSelect}
    >
      {result.hut.photoUrl && (
        <Image
          src={result.hut.photoUrl}
          alt=""
          className={styles.hutPhoto}
          width={144}
          height={108}
          unoptimized
        />
      )}
      <div className={styles.hutContent}>
        <div className={styles.hutMain}>
          <div className={styles.hutTopline}>
            <span>{result.hut.region}</span>
            <span>PZS #{result.hut.pzsId}</span>
            {result.mode === "full" && <span>full check</span>}
            {result.stale && <span>stale cache</span>}
          </div>
          <h2>{result.hut.name}</h2>
          {result.status === "error" ? (
            <p className={styles.reason}>{result.errorMessage ?? "Could not check this hut."}</p>
          ) : (
            <p className={styles.hutStatus}>
              {result.availableCount > 0
                ? `${result.availableCount} available`
                : "No availability found in quick check"}
              {result.lowestPriceDisplay ? ` · from ${result.lowestPriceDisplay}` : ""}
            </p>
          )}
        </div>

        <div className={styles.unitPreview}>
          {previewUnits.map((unit) => (
            <ResultPill key={unit.bentralUnitId} result={unit} />
          ))}
        </div>

        <div className={styles.rowActions}>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onCheck();
            }}
            disabled={isChecking}
          >
            {isChecking ? "Checking..." : "Show all units"}
          </button>
          <a
            href={result.hut.bentralIframeUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
          >
            Reservation
          </a>
          <a
            href={result.hut.pzsUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
          >
            PZS
          </a>
        </div>
      </div>
    </article>
  );
}

function ResultPill({ result }: { result: UnitAvailability }) {
  const label =
    result.status === "available"
      ? "Available"
      : result.status === "unavailable"
        ? "Not available"
        : "Could not check";

  return (
    <div className={`${styles.unitPill} ${styles[result.status]}`}>
      <strong>{result.unitName}</strong>
      <span>
        {label}
        {result.priceDisplay ? ` · ${result.priceDisplay}` : ""}
        {result.stale ? " · stale" : result.cached ? " · cached" : ""}
      </span>
    </div>
  );
}
