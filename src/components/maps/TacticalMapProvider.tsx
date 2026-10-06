import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Modal } from "../ui";
import { useSystemHealth } from "../SystemHealthProvider";
import { serviceHealth } from "../system-health";
import type { MapIntent } from "./map-location";
import "./tactical-map.css";
const TacticalMap = lazy(() => import("./TacticalMap"));
export type MapActions = { dispose: () => void; stopSharing: () => void };
type MapContext = { request: (intent?: MapIntent) => void; close: () => void; setHomeTarget: (target: HTMLDivElement | null) => void };
const Context = createContext<MapContext | null>(null);
export function useTacticalMap() {
  const value = useContext(Context);
  if (!value) throw new Error("TacticalMapProvider is required");
  return value;
}
/** A mount point for the existing map, never a second map or GPS controller. */
export function HomeTacticalMap() {
  const { setHomeTarget } = useTacticalMap();
  return <div ref={setHomeTarget} className="home-map-target" />;
}
export function TacticalMapProvider({ children }: { children: ReactNode }) {
  const { controller } = useSystemHealth();
  const [command, setCommand] = useState<{ type: MapIntent; sequence: number } | null>(null);
  const [homeTarget, setHomeTarget] = useState<HTMLDivElement | null>(null);
  const [modalTarget, setModalTarget] = useState<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(!document.hidden);
  const [version, setVersion] = useState(0);
  const [host] = useState(() => {
    const element = document.createElement("div");
    element.className = "jarvis-map-host";
    return element;
  });
  const actions = useRef<MapActions | null>(null);
  const home = useRef(homeTarget); home.current = homeTarget;
  const close = useCallback(() => {
    actions.current?.stopSharing();
    setCommand(null);
    if (!home.current) {
      actions.current?.dispose(); actions.current = null;
      controller.update(serviceHealth("map", false, "disabled", "not-enabled"));
    }
  }, [controller]);
  const request = useCallback((type: MapIntent = "open") => {
    if (type === "stop") { actions.current?.stopSharing(); return; }
    if (controller.getSnapshot().services.find(s => s.id === "map")?.status === "offline") setVersion(v => v + 1);
    setCommand(previous => ({ type, sequence: (previous?.sequence ?? 0) + 1 }));
  }, [controller]);
  const register = useCallback((value: MapActions | null) => { actions.current = value; }, []);
  useLayoutEffect(() => {
    const target = command ? modalTarget : homeTarget;
    if (target) target.appendChild(host);
    return () => { host.remove(); };
  }, [host, command, modalTarget, homeTarget]);
  useEffect(() => {
    const background = () => {
      if (document.hidden) {
        actions.current?.stopSharing(); actions.current?.dispose(); actions.current = null;
        setCommand(null); setVisible(false);
      } else setVisible(true); // Public city map only; GPS is never restarted here.
    };
    const pagehide = () => { actions.current?.stopSharing(); actions.current?.dispose(); actions.current = null; setCommand(null); setVisible(false); };
    document.addEventListener("visibilitychange", background); window.addEventListener("pagehide", pagehide);
    return () => { document.removeEventListener("visibilitychange", background); window.removeEventListener("pagehide", pagehide); actions.current?.dispose(); };
  }, []);
  const active = visible && Boolean(homeTarget || command);
  useEffect(() => {
    if (!active) controller.update(serviceHealth("map", false, "disabled", "not-enabled"));
  }, [active, controller]);
  return <Context.Provider value={{ request, close, setHomeTarget }}>
    {children}
    {active && createPortal(<Suspense fallback={<p role="status">Loading map controls…</p>}>
      <TacticalMap key={version} embedded={!command} command={command ?? { type: "open", sequence: 0 }} close={close} register={register} expand={() => request()} />
    </Suspense>, host)}
    <Modal open={command !== null} onClose={close} className="tactical-map-sheet" size="xl">
      <Modal.Header><Modal.Title>JARVIS // TACTICAL MAP</Modal.Title></Modal.Header>
      <Modal.Body><div ref={setModalTarget} className="expanded-map-target" /></Modal.Body>
    </Modal>
  </Context.Provider>;
}
