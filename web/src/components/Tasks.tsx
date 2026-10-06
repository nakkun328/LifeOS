'use client';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch } from '@/lib/client';
import { dueMessage } from '@/lib/messages';
import { NEXT_STATUS, STATUS_LABEL } from '@/lib/tasks';
import type { TaskView } from '@/server/handlers/tasks';
import { Nav } from './Nav';

type Act = (fn: () => Promise<unknown>) => Promise<void>;

/** 進捗は1タップで 未着手 → 途中 → 完了 */
export function TaskRow({ task, act }: { task: TaskView; act: Act }) {
  return (
    <li>
      <span className="grow" style={{ opacity: task.status === 'done' ? 0.55 : 1 }}>
        {task.title}
        <div className="muted">{task.status === 'done' ? `完了（期限 ${task.due_date}）` : `${dueMessage(task.days_left)}（${task.due_date}）`}</div>
      </span>
      <button onClick={() => act(() => apiFetch(`/api/tasks/${task.id}`, { method: 'PATCH', body: { status: NEXT_STATUS[task.status] } }))}>
        {STATUS_LABEL[task.status]}
      </button>
    </li>
  );
}

/** Today 用：期限が近い課題を数件 */
export function TasksCard({ tasks, act }: { tasks: TaskView[]; act: Act }) {
  return (
    <section className="card">
      <h2>課題<a href="/tasks" style={{ float: 'right', fontSize: 12 }}>すべて見る</a></h2>
      {tasks.length === 0 ? <div className="muted">期限が近い課題はありません</div> : (
        <ul className="plain">{tasks.map((t) => <TaskRow key={t.id} task={t} act={act} />)}</ul>
      )}
    </section>
  );
}

export function TasksPage() {
  const [tasks, setTasks] = useState<TaskView[] | null>(null);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setTasks(await apiFetch<TaskView[]>('/api/tasks'));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) window.location.href = '/login';
      else setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act: Act = async (fn) => {
    try { await fn(); setError(''); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    await load();
  };

  const open = tasks?.filter((t) => t.status !== 'done') ?? [];
  const done = tasks?.filter((t) => t.status === 'done') ?? [];
  return (
    <main>
      <Nav current="/tasks" />
      <h1>課題</h1>
      <section className="card">
        <div className="row">
          <input className="grow" placeholder="課題名" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          <button className="primary" disabled={!title.trim() || !due}
            onClick={() => act(async () => { await apiFetch('/api/tasks', { body: { title, due_date: due } }); setTitle(''); setDue(''); })}>追加</button>
        </div>
        <div className="err">{error}</div>
      </section>
      <section className="card">
        <h2>進行中</h2>
        {tasks === null ? <div className="muted">読み込み中…</div> : open.length === 0 ? <div className="muted">課題はありません</div> : (
          <ul className="plain">{open.map((t) => <TaskRow key={t.id} task={t} act={act} />)}</ul>
        )}
      </section>
      {done.length > 0 && (
        <section className="card">
          <h2>完了（直近2週間）</h2>
          <ul className="plain">{done.map((t) => <TaskRow key={t.id} task={t} act={act} />)}</ul>
        </section>
      )}
    </main>
  );
}
