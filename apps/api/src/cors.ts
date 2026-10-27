// Falls back to the client origin: an empty list would make cors() allow nothing,
// so a stray comma in config would otherwise become a total outage.
export function parseOrigins(corsOrigins: string | undefined, clientOrigin: string): string[] {
  const parsed = (corsOrigins ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : [clientOrigin];
}
