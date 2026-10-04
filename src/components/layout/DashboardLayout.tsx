import { useEffect, useState, type ReactNode } from "react";
import "./dashboard-layout.css";
/** Keep panels only through their exit transition; hidden scenes then release their GPU. */
export function DashboardLayout({
  dashboard,
  focus,
}: {
  dashboard: ReactNode;
  focus: ReactNode | null;
}) {
  const active = focus !== null;
  const [retainDashboard, setRetainDashboard] = useState(!active);
  useEffect(() => {
    if (!active) {
      setRetainDashboard(true);
      return;
    }
    const timer = setTimeout(() => setRetainDashboard(false), 400);
    return () => clearTimeout(timer);
  }, [active]);
  return (
    <div
      className="dashboard-layout"
      data-mode={active ? "focus" : "dashboard"}
    >
      {(!active || retainDashboard) && (
        <div
          className="dashboard-layer"
          aria-hidden={active}
          inert={active || undefined}
        >
          {dashboard}
        </div>
      )}
      {focus}
    </div>
  );
}
