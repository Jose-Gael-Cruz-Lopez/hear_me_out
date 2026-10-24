/** Local development links must work on phones too, not point at the phone's localhost. */
export function browserDatabaseUri(configured: string, pageHost: string, development: boolean): string {
  if (!development || !pageHost) return configured;
  try {
    const uri = new URL(configured);
    const loopback = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'];
    if (!loopback.includes(uri.hostname) || loopback.includes(pageHost)) return configured;
    uri.hostname = pageHost;
    return configured.endsWith('/') ? uri.toString() : uri.toString().replace(/\/$/, '');
  } catch { return configured; }
}
