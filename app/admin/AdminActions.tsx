"use client";

import { useState } from "react";
import styles from "./page.module.css";

type Action = "calendars" | "units" | "prices";

export function AdminActions() {
  const [running, setRunning] = useState<Action | null>(null);
  const [message, setMessage] = useState("");

  const run = async (action: Action) => {
    setRunning(action);
    setMessage("");
    try {
      const response = await fetch("/api/admin/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json() as { queued?: number; error?: string };
      setMessage(response.ok ? `V čakalno vrsto dodano: ${data.queued ?? 0}.` : data.error ?? "Osveževanje ni uspelo.");
    } catch {
      setMessage("Osveževanje ni uspelo.");
    } finally {
      setRunning(null);
    }
  };

  return <section className={styles.adminActions} aria-label="Ročno osveževanje">
    <div>
      <h2>Ročno osveževanje</h2>
      <p>Koledar se ob uporabi osveži, ko je starejši od 15 minut. Enote in cene se ročno osvežijo tukaj.</p>
    </div>
    <div className={styles.actionButtons}>
      <button type="button" disabled={running !== null} onClick={() => run("calendars")}>{running === "calendars" ? "Dodajam …" : "Osveži koledarje"}</button>
      <button type="button" disabled={running !== null} onClick={() => run("units")}>{running === "units" ? "Dodajam …" : "Osveži enote"}</button>
      <button type="button" disabled={running !== null} onClick={() => run("prices")}>{running === "prices" ? "Dodajam …" : "Osveži cene"}</button>
    </div>
    {message && <p className={styles.actionMessage} role="status">{message}</p>}
  </section>;
}
