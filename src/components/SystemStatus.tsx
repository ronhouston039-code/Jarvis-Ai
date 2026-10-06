import { useSystemHealth } from "./SystemHealthProvider";
import { healthSummary } from "./system-health";
export function SystemStatus({ details = false }: { details?: boolean }) {
  const { services } = useSystemHealth();
  const summary = healthSummary(services);
  return <section aria-label="System health" className={details ? "personal-card" : undefined}>
    {details && <h2>System Status</h2>}
    <p className="system-summary" role="status">
      <span className={`hud-dot ${summary.state === "online" ? "" : "dim"}`} style={summary.state === "affected" ? { background: "#e4ad51" } : undefined} aria-hidden="true" />
      {summary.text}
    </p>
    {summary.affected.length > 0 && <ul aria-label="Affected systems">{summary.affected.map(s => <li key={s.id}>{s.label.toUpperCase()} · {s.status.toUpperCase()}</li>)}</ul>}
    {details && <ul>{services.map(s => <li key={s.id}><strong>{s.label}</strong> · {s.status}<p>{s.message}</p>{s.checkedAt && <time dateTime={s.checkedAt}>Checked {new Date(s.checkedAt).toLocaleString()}</time>}</li>)}</ul>}
  </section>;
}
export function SystemHealthActivity({ compact = false }: { compact?: boolean }) {
  const { activity } = useSystemHealth();
  return <section aria-label="System health activity">{!compact && <h2>System activity</h2>}{(compact ? activity.slice(0, 3) : activity).map(entry => <article className="hud-shortcut-activity" key={entry.id}><h3>{entry.message}</h3><time dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleString()}</time></article>)}{!compact && !activity.length && <p>No system health transitions recorded.</p>}</section>;
}
