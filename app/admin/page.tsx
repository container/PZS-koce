import Link from "next/link";
import { connection } from "next/server";
import { getAdminMetrics } from "@/lib/admin-metrics";
import { AutoRefresh } from "./AutoRefresh";
import styles from "./page.module.css";

function formatDate(value: string | Date | null) {
  return value ? new Date(value).toLocaleString("sl-SI") : "—";
}

function formatDay(value: string | Date | null) {
  return value ? new Date(value).toLocaleDateString("sl-SI") : "—";
}

function countForStatus(jobs: { status: string; total: number }[], status: string) {
  return jobs.find((job) => job.status === status)?.total ?? 0;
}

export default async function AdminPage() {
  await connection();
  let metrics;

  try {
    metrics = await getAdminMetrics();
  } catch {
    return (
      <main className={styles.page}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Notranji nadzor</p>
            <h1>Nadzorna plošča zahtevkov Bentral</h1>
          </div>
          <Link href="/">Nazaj na razpoložljivost</Link>
        </header>
        <section className={styles.setup}>
          <h2>Potrebna je povezava z bazo podatkov</h2>
          <p>
            Ta nadzorna plošča bere skupni predpomnilnik in dnevnik zahtevkov iz PostgreSQL.
            Aplikacijo povežite z oddaljeno zbirko podatkov in tam enkrat zaženite migracije.
          </p>
          <code>DATABASE_URL=postgresql://…</code>
          <code>npm run db:migrate</code>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Notranji nadzor</p>
          <h1>Nadzorna plošča zahtevkov Bentral</h1>
          <p>
            Spodnje številke prikazujejo le odhodne klice v Bentral. Zahtevki brskalnika,
            ki samo berejo PostgreSQL, niso vključeni.
          </p>
          <AutoRefresh />
        </div>
        <Link href="/">Nazaj na razpoložljivost</Link>
      </header>

      <section className={styles.cards} aria-label="Povzetek zahtevkov Bentral">
        <Metric label="Zadnja ura" value={metrics.requestCounts.last_hour} />
        <Metric label="Zadnjih 24 ur" value={metrics.requestCounts.last_day} />
        <Metric label="Skupaj" value={metrics.requestCounts.total} />
        <Metric label="Neuspešni klici" value={metrics.requestCounts.failed} danger />
      </section>

      <section className={styles.grid}>
        <Panel title="Vrste zahtevkov">
          <dl className={styles.definitionList}>
            {metrics.requestTypes.map((request) => (
              <div key={request.request_type}>
                <dt>{request.request_type === "iframe" ? "Nalaganja iframea koče" : "Preverjanja cen enot"}</dt>
                <dd>{request.total} skupaj · {request.last_day} danes</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel title="Stanje predpomnilnika">
          <dl className={styles.definitionList}>
            <div><dt>Sveži posnetki razpoložljivosti</dt><dd>{metrics.caches.availability_fresh}</dd></div>
            <div><dt>Zastareli posnetki razpoložljivosti</dt><dd>{metrics.caches.availability_stale}</dd></div>
            <div><dt>Vsi posnetki razpoložljivosti</dt><dd>{metrics.caches.availability_total}</dd></div>
            <div><dt>Sveži vnosi cen enot</dt><dd>{metrics.caches.price_fresh}</dd></div>
          </dl>
        </Panel>

        <Panel title="Čakalna vrsta osveževanja">
          <dl className={styles.definitionList}>
            <div><dt>V čakalni vrsti</dt><dd>{countForStatus(metrics.jobs, "queued")}</dd></div>
            <div><dt>V izvajanju</dt><dd>{countForStatus(metrics.jobs, "running")}</dd></div>
            <div><dt>Uspešno končano</dt><dd>{countForStatus(metrics.jobs, "succeeded")}</dd></div>
            <div><dt>Neuspešno</dt><dd>{countForStatus(metrics.jobs, "failed")}</dd></div>
          </dl>
        </Panel>
      </section>

      <section className={styles.section}>
        <h2>Živi dnevnik odhodnih klicev Bentral</h2>
        <p className={styles.logDescription}>Prikazanih je zadnjih 100 klicev. Nova vrstica se pojavi ob začetku klica in se nato dopolni z odzivom Bentrala ali napako.</p>
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>Čas</th><th>Koča</th><th>Odhodni klic</th><th>Bivanje</th><th>Odgovor</th><th>Trajanje</th></tr></thead>
            <tbody>
              {metrics.recentRequests.length === 0 ? (
                <tr><td colSpan={6}>Odhodni klici Bentral še niso zabeleženi.</td></tr>
              ) : metrics.recentRequests.map((request, index) => (
                <tr key={`${request.created_at}-${request.hut_id}-${index}`}>
                  <td>{formatDate(request.created_at)}</td>
                  <td>{request.hut_id}</td>
                  <td>{request.request_type}{request.unit_id ? ` · ${request.unit_id}` : ""}</td>
                  <td>{request.arrival_date ? `${formatDay(request.arrival_date)} → ${formatDay(request.departure_date)}` : "—"}</td>
                  <td className={request.error_message || (request.response_status ?? 0) >= 400 ? styles.failure : ""}>
                    {request.error_message ?? (request.response_status ? `HTTP ${request.response_status}` : "Čaka na odgovor …")}
                  </td>
                  <td>{request.duration_ms} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Najnovejši predpomnjeni podatki o razpoložljivosti</h2>
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>Koča</th><th>Bivanje</th><th>Gosti</th><th>Enote</th><th>Preverjeno</th><th>Sveže do</th></tr></thead>
            <tbody>
              {metrics.recentSnapshots.length === 0 ? (
                <tr><td colSpan={6}>Posnetki razpoložljivosti še niso shranjeni.</td></tr>
              ) : metrics.recentSnapshots.map((snapshot, index) => (
                <tr key={`${snapshot.hut_id}-${snapshot.checked_at}-${index}`}>
                  <td>{snapshot.hut_id}</td>
                  <td>{formatDay(snapshot.arrival_date)} → {formatDay(snapshot.departure_date)}</td>
                  <td>{snapshot.adults}</td>
                  <td>{snapshot.unit_count}</td>
                  <td>{formatDate(snapshot.checked_at)}</td>
                  <td>{formatDate(snapshot.expires_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return <div className={`${styles.metric} ${danger ? styles.danger : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className={styles.panel}><h2>{title}</h2>{children}</section>;
}
