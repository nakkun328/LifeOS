'use client';
import { useState } from 'react';
import { apiFetch } from '@/lib/client';
import { dueMessage } from '@/lib/messages';
import { CATEGORY_LABEL, NEXT_STATUS, PRIORITY_LABEL, STATUS_LABEL } from '@/lib/tasks';
import type { TaskCategory } from '@/lib/types';
import { useApi, type Act } from '@/lib/useApi';
import type { TaskView } from '@/server/handlers/tasks';
import { AppShell } from './AppShell';

/** 進捗は1タップで 未着手 → 途中 → 完了。期限切れは、色と印ではっきり区別する（責める言葉は使わない） */
export function TaskRow({ task, act, compact = false }: { task: TaskView; act: Act; compact?: boolean }) {
  const overdue = task.days_left < 0 && task.status !== 'done';
  return (
    <li className={overdue ? 'overdue' : ''}>
      <span className="grow" style={{ opacity: task.status === 'done' ? 0.55 : 1 }}>
        {task.title}
        {overdue && <span className="badge warn">期限切れ</span>}
        {!compact && task.category && <span className="badge">{CATEGORY_LABEL[task.category]}</span>}
        {!compact && task.subject_name && <span className="badge">{task.subject_name}</span>}
        {!compact && task.priority === 1 && <span className="badge">優先 {PRIORITY_LABEL[1]}</span>}
        <div className="sub">
          {task.status === 'done' ? `完了（期限 ${task.due_date}）` : `${dueMessage(task.days_left)}（${task.due_date}）`}
        </div>
        {!compact && task.memo && <div className="sub">{task.memo}</div>}
      </span>
      <button onClick={() => act(() => apiFetch(`/api/tasks/${task.id}`, { method: 'PATCH', body: { status: NEXT_STATUS[task.status] } }))}>
        {STATUS_LABEL[task.status]}
      </button>
    </li>
  );
}

type Subject = { id: string; name: string };

/** 必須は課題名と期限だけ。科目・カテゴリ・優先度・メモは、すべて任意（入れなくても登録できる） */
function TaskForm({ subjects, act }: { subjects: Subject[]; act: Act }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [category, setCategory] = useState<TaskCategory | ''>('');
  const [priority, setPriority] = useState('');
  const [memo, setMemo] = useState('');
  const reset = () => { setTitle(''); setDue(''); setSubjectId(''); setCategory(''); setPriority(''); setMemo(''); };
  return (
    <div className="form-grid">
      <div className="row">
        <input className="grow" placeholder="課題名" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="期限" />
      </div>
      <details>
        <summary className="sub">詳細（任意）</summary>
        <div className="form-grid" style={{ marginTop: 8 }}>
          <div className="row">
            <select value={category} onChange={(e) => setCategory(e.target.value as TaskCategory | '')} aria-label="カテゴリ">
              <option value="">カテゴリ</option>
              {(Object.keys(CATEGORY_LABEL) as TaskCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} aria-label="科目">
              <option value="">科目</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="優先度">
              <option value="">優先度</option>
              <option value="1">高</option><option value="2">中</option><option value="3">低</option>
            </select>
          </div>
          <input placeholder="メモ" value={memo} maxLength={1000} onChange={(e) => setMemo(e.target.value)} />
        </div>
      </details>
      <div>
        <button
          className="primary"
          disabled={!title.trim() || !due}
          onClick={() =>
            act(async () => {
              const body: Record<string, unknown> = { title, due_date: due };
              if (subjectId) body.subject_id = subjectId;
              if (category) body.category = category;
              if (priority) body.priority = Number(priority);
              if (memo.trim()) body.memo = memo;
              await apiFetch('/api/tasks', { body });
              reset();
            })
          }
        >
          追加
        </button>
      </div>
    </div>
  );
}

type Filter = 'all' | TaskCategory;

export function TasksPage() {
  const { data: tasks, error, act } = useApi<TaskView[]>('/api/tasks');
  const { data: subjects } = useApi<Subject[]>('/api/subjects');
  const [filter, setFilter] = useState<Filter>('all');

  const shown = (tasks ?? []).filter((t) => filter === 'all' || t.category === filter);
  const open = shown.filter((t) => t.status !== 'done');
  const done = shown.filter((t) => t.status === 'done');
  const overdueCount = open.filter((t) => t.days_left < 0).length;

  return (
    <AppShell title="Tasks">
      <div className="cards">
        <section className="card span-all">
          <TaskForm subjects={subjects ?? []} act={act} />
          <div className="err">{error}</div>
        </section>
        <section className="card span-all">
          <div className="seg">
            <button className={filter === 'all' ? 'primary' : ''} onClick={() => setFilter('all')}>すべて</button>
            {(Object.keys(CATEGORY_LABEL) as TaskCategory[]).map((c) => (
              <button key={c} className={filter === c ? 'primary' : ''} onClick={() => setFilter(c)}>{CATEGORY_LABEL[c]}</button>
            ))}
          </div>
        </section>
        <section className="card">
          <h2>進行中{overdueCount > 0 && <span className="badge warn">期限切れ {overdueCount}</span>}</h2>
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
      </div>
    </AppShell>
  );
}
