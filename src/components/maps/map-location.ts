export const MAP_HOME = { longitude: -77.9928, latitude: 35.3849, zoom: 13, label: "Goldsboro, North Carolina" };
export const SHARING_OFF = "Location sharing is off. Showing Goldsboro, North Carolina.";
export type MapPosition = { latitude: number; longitude: number; accuracy: number };
export function validPosition(value: MapPosition): boolean {
  return Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 85 && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180 && Number.isFinite(value.accuracy) && value.accuracy >= 0 && value.accuracy <= 20000000;
}
/** A local geodesic accuracy polygon; never persisted or sent to JARVIS. */
export function accuracyArea(position: MapPosition) {
  const radians = Math.PI / 180, lat = position.latitude * radians, lon = position.longitude * radians;
  const distance = position.accuracy / 6371008.8;
  const ring: number[][] = [];
  for (let i = 0; i <= 64; i++) {
    const bearing = i / 64 * 2 * Math.PI;
    const y = Math.asin(Math.sin(lat) * Math.cos(distance) + Math.cos(lat) * Math.sin(distance) * Math.cos(bearing));
    const x = lon + Math.atan2(Math.sin(bearing) * Math.sin(distance) * Math.cos(lat), Math.cos(distance) - Math.sin(lat) * Math.sin(y));
    ring.push([x / radians, Math.max(-85, Math.min(85, y / radians))]);
  }
  ring[64] = [...ring[0]];
  return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [ring] } };
}

/** Single watch owner; generation guards also reject late permission callbacks. */
export class MapLocationSession {
  private watchId: number | null = null;
  private generation = 0;
  private disposed = false;
  constructor(private geo: Pick<Geolocation, "watchPosition" | "clearWatch"> | undefined, private onPosition: (position: MapPosition | null) => void, private onStatus: (message: string) => void) {}
  start() {
    if (this.disposed) return;
    this.stop();
    const generation = this.generation;
    if (!this.geo) { this.onStatus(SHARING_OFF); return; }
    this.onStatus("Requesting location permission…");
    try {
      const id = this.geo.watchPosition(position => {
        if (this.disposed || generation !== this.generation) return;
        const value = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy };
        if (!validPosition(value)) { this.stop(); return; }
        this.onPosition(value);
        this.onStatus(`Sharing while this map is open · Accuracy ${Math.round(value.accuracy)} m`);
      }, () => { if (!this.disposed && generation === this.generation) this.stop(); }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 15000 });
      if (this.disposed || generation !== this.generation) this.geo.clearWatch(id);
      else this.watchId = id;
    } catch { this.stop(); }
  }
  stop() {
    this.generation++;
    const id = this.watchId; this.watchId = null;
    if (id !== null) this.geo?.clearWatch(id);
    this.onPosition(null); this.onStatus(SHARING_OFF);
  }
  dispose() { if (!this.disposed) { this.stop(); this.disposed = true; } }
}
export type MapIntent = "open" | "location" | "home" | "stop";
export function mapIntent(text: string): MapIntent | null {
  const command = text.trim().replace(/^(?:hey\s+)?jarvis[,\s]+/i, "").replace(/[.!?]+$/, "");
  if (/^stop sharing (?:my )?location$/i.test(command)) return "stop";
  if (/^show my (?:current )?location$/i.test(command)) return "location";
  if (/^show (?:a map of )?Goldsboro(?:,? (?:NC|North Carolina))?$/i.test(command)) return "home";
  if (/^(?:open|show)(?: the| a)?(?: tactical)? map$/i.test(command)) return "open";
  return null;
}
