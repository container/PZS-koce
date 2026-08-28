import Link from "next/link";
import { connection } from "next/server";
import { getAdminMetrics } from "@/lib/admin-metrics";
import { AutoRefresh } from "./AutoRefresh";
import styles from "./page.module.css";

function formatDate(value: string | Date | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function formatDay(value: string | Date | null) {
  return value ? new Date(value).toLocaleDateString() : "—";
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
            <p className={styles.eyebrow}>Internal monitoring</p>
            <h1>Bentral request dashboard</h1>
          </div>
          <Link href="/">Back to availability</Link>
        </header>
        <section className={styles.setup}>
          <h2>Database connection needed</h2>
          <p>
            This dashboard reads the shared cache and request log from PostgreSQL. Connect
            the app to your remote database, then run the migrations there once.
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
          <p className={styles.eyebrow}>Internal monitoring</p>
          <h1>Bentral request dashboard</h1>
          <p>
            Counts below are outbound calls to Bentral only. Browser requests that only
            read Postgres are not counted.
          </p>
          <AutoRefresh />
        </div>
        <Link href="/">Back to availability</Link>
      </header>

      <section className={styles.cards} aria-label="Bentral request summary">
        <Metric label="Last hour" value={metrics.requestCounts.last_hour} />
        <Metric label="Last 24 hours" value={metrics.requestCounts.last_day} />
        <Metric label="All time" value={metrics.requestCounts.total} />
        <Metric label="Failed calls" value={metrics.requestCounts.failed} danger />
      </section>

      <section className={styles.grid}>
        <Panel title="Request types">
          <dl className={styles.definitionList}>
            {metrics.requestTypes.map((request) => (
              <div key={request.request_type}>
                <dt>{request.request_type === "iframe" ? "Hut iframe loads" : "Unit pricing checks"}</dt>
                <dd>{request.total} total · {request.last_day} today</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel title="Cache health">
          <dl className={styles.definitionList}>
            <div><dt>Fresh availability snapshots</dt><dd>{metrics.caches.availability_fresh}</dd></div>
            <div><dt>Stale availability snapshots</dt><dd>{metrics.caches.availability_stale}</dd></div>
            <div><dt>All availability snapshots</dt><dd>{metrics.caches.availability_total}</dd></div>
            <div><dt>Fresh unit-price entries</dt><dd>{metrics.caches.price_fresh}</dd></div>
          </dl>
        </Panel>

        <Panel title="Refresh queue">
          <dl className={styles.definitionList}>
            <div><dt>Queued</dt><dd>{countForStatus(metrics.jobs, "queued")}</dd></div>
            <div><dt>Running</dt><dd>{countForStatus(metrics.jobs, "running")}</dd></div>
            <div><dt>Succeeded</dt><dd>{countForStatus(metrics.jobs, "succeeded")}</dd></div>
            <div><dt>Failed</dt><dd>{countForStatus(metrics.jobs, "failed")}</dd></div>
          </dl>
        </Panel>
      </section>

      <section className={styles.section}>
        <h2>Recent Bentral calls</h2>
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>Time</th><th>Hut</th><th>Call</th><th>Stay</th><th>Status</th><th>Duration</th></tr></thead>
            <tbody>
              {metrics.recentRequests.length === 0 ? (
                <tr><td colSpan={6}>No outbound Bentral calls recorded yet.</td></tr>
              ) : metrics.recentRequests.map((request, index) => (
                <tr key={`${request.created_at}-${request.hut_id}-${index}`}>
                  <td>{formatDate(request.created_at)}</td>
                  <td>{request.hut_id}</td>
                  <td>{request.request_type}{request.unit_id ? ` · ${request.unit_id}` : ""}</td>
                  <td>{request.arrival_date ? `${formatDay(request.arrival_date)} → ${formatDay(request.departure_date)}` : "—"}</td>
                  <td className={request.error_message || (request.response_status ?? 0) >= 400 ? styles.failure : ""}>
                    {request.error_message ?? request.response_status ?? "network error"}
                  </td>
                  <td>{request.duration_ms} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Latest cached availability</h2>
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>Hut</th><th>Stay</th><th>Guests</th><th>Units</th><th>Checked</th><th>Fresh until</th></tr></thead>
            <tbody>
              {metrics.recentSnapshots.length === 0 ? (
                <tr><td colSpan={6}>No availability snapshots stored yet.</td></tr>
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
