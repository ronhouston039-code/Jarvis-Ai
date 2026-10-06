import { useEffect, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";
import { Map as LibreMap, NavigationControl, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { useSystemHealth } from "../SystemHealthProvider";
import { serviceHealth } from "../system-health";
import { authenticatedFetch } from "../../jarvis/client";
import { Button, Input } from "../ui";
import { accuracyArea, MAP_HOME, MapLocationSession, SHARING_OFF, type MapIntent } from "./map-location";
import { tacticalStyle } from "./map-style";
import type { MapActions } from "./TacticalMapProvider";
// Let Vite emit the worker and its dependencies in both dev and production.
setWorkerUrl(mapWorkerUrl);
type Place = { id: number; name: string; label: string; latitude: number; longitude: number };
const empty = () => ({ type: "FeatureCollection" as const, features: [] });
export default function TacticalMap({ command, close, register, embedded = false, expand }: { command: { type: MapIntent; sequence: number }; close: () => void; register: (actions: MapActions | null) => void; embedded?: boolean; expand?: () => void }) {
  const { controller, services } = useSystemHealth();
  const mapHealth = services.find(service => service.id === "map")!;
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LibreMap | null>(null);
  const location = useRef<MapLocationSession | null>(null);
  const searchRequest = useRef<AbortController | null>(null);
  const [locationStatus, setLocationStatus] = useState(SHARING_OFF);
  const [placeName, setPlaceName] = useState("Goldsboro, North Carolina");
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [searchStatus, setSearchStatus] = useState("");
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    let active = true, loaded = false;
    let instance: LibreMap | null = null;
    let resize: ResizeObserver | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    controller.update(serviceHealth("map", true, "checking", "awaiting-check", true));
    const dispose = () => {
      if (!active) return;
      active = false; clearTimeout(timer); resize?.disconnect(); resize = null;
      setPlaceName(MAP_HOME.label); setSearching(false);
      searchRequest.current?.abort("map-closed"); searchRequest.current = null;
      location.current?.dispose(); location.current = null;
      map.current = null;
      instance?.remove(); instance = null;
    };
    const fail = (renderer = false) => {
      if (!active) return;
      dispose();
      controller.update(serviceHealth("map", true, "offline", renderer ? "renderer-unavailable" : "provider-unavailable", true, new Date().toISOString()));
    };
    try {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      instance = new LibreMap({ container: container.current, style: tacticalStyle(), center: [MAP_HOME.longitude, MAP_HOME.latitude], zoom: MAP_HOME.zoom, attributionControl: { compact: false }, fadeDuration: reduced ? 0 : 200, dragRotate: false, pitchWithRotate: false, touchPitch: false });
      map.current = instance;
      instance.addControl(new NavigationControl({ showCompass: false }), "top-right");
      resize = new ResizeObserver(() => { if (active) instance?.resize(); }); resize.observe(container.current);
      register({ dispose, stopSharing: () => { location.current?.stop(); searchRequest.current?.abort("map-closed"); searchRequest.current = null; setSearching(false); setPlaces([]); setSearchStatus(""); } });
      instance.on("error", () => fail());
      instance.once("load", () => {
        if (!active || !instance) return;
        loaded = true; clearTimeout(timer);
        instance.addSource("local-accuracy", { type: "geojson", data: empty() });
        instance.addSource("local-position", { type: "geojson", data: empty() });
        instance.addLayer({ id: "local-accuracy", type: "fill", source: "local-accuracy", paint: { "fill-color": "#18b7ff", "fill-opacity": 0.16 } });
        instance.addLayer({ id: "local-position", type: "circle", source: "local-position", paint: { "circle-radius": 7, "circle-color": "#00d2ff", "circle-stroke-width": 3, "circle-stroke-color": "#ffffff" } });
        controller.update(serviceHealth("map", true, "online", "verified", true, new Date().toISOString()));
      });
      location.current = new MapLocationSession(navigator.geolocation, position => {
        if (!active || !loaded || !instance) return;
        (instance.getSource("local-position") as GeoJSONSource).setData(position ? { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [position.longitude, position.latitude] } } : empty());
        (instance.getSource("local-accuracy") as GeoJSONSource).setData(position ? accuracyArea(position) : empty());
        if (position) { setPlaceName("Your location · Sharing locally"); instance.jumpTo({ center: [position.longitude, position.latitude], zoom: 14 }); }
        else { setPlaceName(MAP_HOME.label); instance.jumpTo({ center: [MAP_HOME.longitude, MAP_HOME.latitude], zoom: MAP_HOME.zoom }); }
      }, setLocationStatus);
      timer = setTimeout(() => fail(), 15000);
      const background = () => { if (document.hidden) close(); };
      document.addEventListener("visibilitychange", background); window.addEventListener("pagehide", close);
      return () => { document.removeEventListener("visibilitychange", background); window.removeEventListener("pagehide", close); dispose(); register(null); };
    } catch { fail(true); register({ dispose, stopSharing: () => {} }); return () => { dispose(); register(null); }; }
  }, [controller, close, register]);
  useEffect(() => {
    if (command.type === "home") location.current?.stop();
    if (command.type === "location") setLocationStatus("Tap Show My Location to share only while this map is open.");
  }, [command]);
  async function searchPlace() {
    searchRequest.current?.abort("replacement");
    const request = new AbortController(); searchRequest.current = request;
    setSearching(true); setSearchStatus("Searching places…"); setPlaces([]);
    try {
      const response = await authenticatedFetch(`/api/jarvis/connections/cities?q=${encodeURIComponent(query.trim())}`, undefined, AbortSignal.any([request.signal, AbortSignal.timeout(10000)]));
      if (!response.ok) throw new Error();
      const result = await response.json() as { places?: Place[] };
      if (request.signal.aborted) return;
      if (!Array.isArray(result.places)) throw new Error();
      const valid = result.places.filter(place => typeof place.label === "string" && place.label.length <= 200 && Number.isFinite(place.latitude) && Math.abs(place.latitude) <= 85 && Number.isFinite(place.longitude) && Math.abs(place.longitude) <= 180).slice(0, 6);
      setPlaces(valid); setSearchStatus(valid.length ? "Choose a place to view. This does not save your location." : "No matching places found.");
    } catch { if (!request.signal.aborted) setSearchStatus("Place search is temporarily unavailable. The map can still be used."); }
    finally { if (searchRequest.current === request) { searchRequest.current = null; setSearching(false); } }
  }
  return <div className={`tactical-map-content ${embedded ? "tactical-map-preview" : ""}`}>
    {!embedded && <>
    <div className="tactical-map-controls">
      <Button disabled={mapHealth.status !== "online"} onClick={() => location.current?.start()}>Show My Location</Button>
      <Button onClick={() => location.current?.stop()}>Goldsboro</Button>
      <Button onClick={() => location.current?.stop()}>Stop Sharing</Button>
    </div>
    <form className="tactical-place-search" onSubmit={event => { event.preventDefault(); void searchPlace(); }}>
      <Input aria-label="Search Place" placeholder="City or place name" value={query} maxLength={120} onChange={event => setQuery(event.target.value)} />
      <Button type="submit" disabled={searching || query.trim().length < 2}>Search Place</Button>
    </form>
    {searchStatus && <p role="status">{searchStatus}</p>}
    {places.length > 0 && <div className="tactical-place-results">{places.map((place, index) => <Button key={`${place.id}:${index}`} disabled={mapHealth.status !== "online"} onClick={() => { location.current?.stop(); map.current?.jumpTo({ center: [place.longitude, place.latitude], zoom: 13 }); setPlaceName(place.label); setPlaces([]); setLocationStatus("Location sharing is off. Viewing the selected place."); }}>{place.label}</Button>)}</div>}
    <p className="tactical-map-location" aria-live="polite">{placeName}</p>
    <p role="status">{locationStatus}</p>
    <p role="status">{mapHealth.status === "online" ? "Map tiles loaded." : mapHealth.status === "checking" ? "Loading map tiles…" : mapHealth.reason === "renderer-unavailable" ? "Map rendering is unavailable in this browser." : "Map is temporarily unavailable. Close and reopen to retry."}</p>
    </>}
    <div className="tactical-map-canvas" ref={container} aria-label="Interactive tactical map" onDoubleClick={embedded ? expand : undefined} />
    {embedded && <><button className="map-expand-control" aria-label="Open tactical map" onClick={expand}><Maximize2 size={20} /></button><p className="map-preview-status" role="status">{mapHealth.status === "online" ? "Goldsboro · Live map" : mapHealth.status === "checking" ? "Loading map…" : "Map temporarily unavailable"}</p></>}
    {!embedded && <p className="tactical-map-privacy">No location history is saved. Map tiles share the viewed area with OpenFreeMap; GPS coordinates stay on this device.</p>}
  </div>;
}
