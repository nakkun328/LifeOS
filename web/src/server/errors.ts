export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (m: string) => new HttpError(400, m);
export const forbidden = (m: string) => new HttpError(403, m);
export const conflict = (m: string) => new HttpError(409, m);
export const notFound = (m: string) => new HttpError(404, m);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

export function asObject(v: unknown): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw badRequest('JSON オブジェクトを送ってください');
  return v as Record<string, unknown>;
}

export function str(v: unknown, name: string, min = 1, max = 200): string {
  if (typeof v !== 'string') throw badRequest(`${name} が必要です`);
  const t = v.trim();
  if (t.length < min || t.length > max) throw badRequest(`${name} は ${min}〜${max} 文字にしてください`);
  return t;
}

export function optStr(v: unknown, name: string, max = 2000): string | null {
  if (v === undefined || v === null || v === '') return null;
  return str(v, name, 1, max);
}
