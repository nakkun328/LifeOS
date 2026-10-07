export type SessionKind = 'study' | 'club';
export type SleepSource = 'button' | 'auto';

export type SubjectRow = { id: string; name: string; archived: boolean; created_at: string };

export type SessionRow = {
  id: string;
  kind: SessionKind;
  subject_id: string | null;
  started_at: string;
  ended_at: string | null;
  efficiency: number | null;
  progress: string | null;
  note: string | null;
};

export type SleepRow = {
  id: string;
  sleep_at: string;
  wake_at: string | null;
  source: SleepSource;
};

export type UsageRow = {
  device: 'mac' | 'iphone';
  /** バケットの開始時刻（Mac は1分単位、iPhone は利用区間の開始） */
  start: string;
  category: string;
  seconds: number;
};

export type GuardEventRow = {
  id: string;
  at: string;
  kind: 'blocked' | 'unlocked';
  site: string;
  reason: string | null;
};

export type AppEventRow = { app: string; event: 'open' | 'close'; at: string };

export type TaskStatus = 'todo' | 'doing' | 'done';
export type TaskCategory = 'school' | 'club' | 'personal';
export type TaskRow = {
  id: string;
  title: string;
  due_date: string;
  status: TaskStatus;
  created_at: string;
  done_at: string | null;
  /** 以下はすべて任意（課題名と期限だけで登録できる）。既存の行では null / undefined */
  subject_id?: string | null;
  category?: TaskCategory | null;
  /** 1=高 2=中 3=低 */
  priority?: number | null;
  memo?: string | null;
};

export type LogTag = '趣味' | '部活' | '日記';
export type LogKind = 'log' | 'decision';
export type LogRow = {
  id: string;
  body: string;
  tag: LogTag;
  created_at: string;
  log_date: string;
  /** 既存の行は 'log'（未設定でも 'log' として扱う） */
  kind?: LogKind;
  /** 決定事項の件名（任意。例：文化祭2027） */
  title?: string | null;
};
