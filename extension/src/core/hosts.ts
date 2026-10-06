export function isHost(host: string, domain: string): boolean {
  return host === domain || host.endsWith('.' + domain);
}
