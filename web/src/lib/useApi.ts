'use client';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch } from './client';

/** 操作（保存など）を実行し、エラーは画面に出し、終わったら再読み込みする */
export type Act = (fn: () => Promise<unknown>) => Promise<void>;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** API から取得して、一定間隔で更新する。未ログインならログイン画面へ */
export function useApi<T>(path: string, pollMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<T>(path));
      setError('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) window.location.href = '/login';
      else setError(message(e));
    }
  }, [path]);

  useEffect(() => {
    void load();
    if (!pollMs) return;
    const id = setInterval(() => void load(), pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);

  const act: Act = useCallback(
    async (fn) => {
      try {
        await fn();
        setError('');
      } catch (e) {
        setError(message(e));
      }
      await load();
    },
    [load],
  );

  return { data, error, reload: load, act };
}

export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
