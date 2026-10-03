/** MusicKit's browser SDK consumes this public developer JWT; never return a signing key. */
export function usableAppleMusicToken(token: string | undefined): boolean {
  if (!token || !/^[-\w]+\.[-\w]+\.[-\w]+$/.test(token)) return false;
  try {
    const decode = (part: string) =>
      JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    const [header, payload] = token.split(".").slice(0, 2).map(decode);
    return (
      header.alg === "ES256" &&
      typeof payload.iss === "string" &&
      payload.iss.length > 0 &&
      typeof payload.exp === "number" &&
      payload.exp > Date.now() / 1000
    );
  } catch {
    return false;
  }
}
