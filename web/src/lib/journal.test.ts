import { describe, expect, it } from 'vitest';
import { composeJournal, type JournalInput } from './journal';

const empty: JournalInput = { inProgress: false, study: [], clubMinutes: 0, tasksDone: [], digital: null, sleep: null, logs: [], decisions: [] };
const make = (over: Partial<JournalInput>): JournalInput => ({ ...empty, ...over });

describe('composeJournal', () => {
  it('データが何もなければ、本文は空', () => {
    expect(composeJournal(empty)).toEqual({ body: '', hasData: false });
  });

  it('例のような日記が組み立てられる（勉強・部活のメモ・Digital・就寝）', () => {
    const r = composeJournal(make({
      study: [{ name: '数学', minutes: 52 }, { name: '英語', minutes: 34 }],
      logs: [{ tag: '部活', body: 'メダルゲームの配線作業が進み、モーター部分まで完成した' }],
      digital: { minutes: 28, diffMinutes: -32 },
      sleep: { bed: '23:23', bedDiffMinutes: -18, durationMin: null },
    }));
    expect(r.body).toBe([
      '今日は数学を52分、英語を34分勉強した。',
      'SNSなどの利用時間は昨日より32分短かった。',
      '就寝は昨日より18分早かった。',
      '部活：メダルゲームの配線作業が進み、モーター部分まで完成した。',
    ].join('\n'));
    expect(r.hasData).toBe(true);
  });

  it('データがない項目の文は出さない', () => {
    const r = composeJournal(make({ study: [{ name: '数学', minutes: 52 }] }));
    expect(r.body).toBe('今日は数学を52分勉強した。');
  });

  it('勉強：1時間以上は「1時間5分」。多い順。5科目以上は「ほか◯科目」。1分未満は出さない', () => {
    expect(composeJournal(make({ study: [{ name: '英語', minutes: 10 }, { name: '数学', minutes: 65 }, { name: '国語', minutes: 0.3 }] })).body)
      .toBe('今日は数学を1時間5分、英語を10分勉強した。');
    const many = ['a', 'b', 'c', 'd', 'e', 'f'].map((n, i) => ({ name: n, minutes: 60 - i }));
    expect(composeJournal(make({ study: many })).body).toBe('今日はaを1時間0分、bを59分、cを58分、dを57分、ほか2科目も勉強した。');
  });

  it('部活の時間・完了した課題', () => {
    const r = composeJournal(make({ clubMinutes: 80, tasksDone: ['数学レポート'] }));
    expect(r.body).toBe('部活に1時間20分取り組んだ。\n課題「数学レポート」を終えた。');
    expect(composeJournal(make({ tasksDone: ['A', 'B', 'C', 'D', 'E'] })).body).toBe('課題「A」「B」「C」ほか2件を終えた。');
  });

  it('Digital：前日との差を、評価の言葉なしで書く（短い・長い・同じ）', () => {
    expect(composeJournal(make({ digital: { minutes: 30, diffMinutes: 12 } })).body).toBe('SNSなどの利用時間は昨日より12分長かった。');
    expect(composeJournal(make({ digital: { minutes: 30, diffMinutes: -72 } })).body).toBe('SNSなどの利用時間は昨日より1時間12分短かった。');
    expect(composeJournal(make({ digital: { minutes: 30, diffMinutes: 0 } })).body).toBe('SNSなどの利用時間は昨日と同じだった。');
    expect(composeJournal(make({ digital: { minutes: 30, diffMinutes: null } })).body).toBe('SNSなどの利用時間は30分だった。');
  });

  it('当日（途中）は、前日の1日ぶんと比べず、「ここまで」の時間を書く', () => {
    expect(composeJournal(make({ inProgress: true, digital: { minutes: 20, diffMinutes: 500 } })).body).toBe('ここまでのSNSなどの利用時間は20分だった。');
  });

  it('就寝・睡眠時間（遅い日・同じ日・前日がない日）', () => {
    expect(composeJournal(make({ sleep: { bed: '00:20', bedDiffMinutes: 30, durationMin: 407 } })).body).toBe('就寝は昨日より30分遅かった。\n睡眠は6時間47分だった。');
    expect(composeJournal(make({ sleep: { bed: '23:30', bedDiffMinutes: 0, durationMin: null } })).body).toBe('就寝は昨日と同じ時刻だった。');
    expect(composeJournal(make({ sleep: { bed: '23:30', bedDiffMinutes: null, durationMin: null } })).body).toBe('就寝は23:30だった。');
  });

  it('決定事項（件名つき・なし）', () => {
    const r = composeJournal(make({ decisions: [{ title: '文化祭2027', body: '展示のPC更新は保留。工具更新を優先' }, { title: null, body: '次回は来週' }] }));
    expect(r.body).toBe('部活の決定事項：（文化祭2027）展示のPC更新は保留。工具更新を優先。\n部活の決定事項：次回は来週。');
  });

  it('「日記」タグのログは、自由メモとして、そのまま末尾に入れる（句点も足さない）', () => {
    const r = composeJournal(make({
      study: [{ name: '数学', minutes: 30 }],
      logs: [{ tag: '日記', body: '今日は少し眠かった' }, { tag: '趣味', body: 'ギターを30分' }, { tag: '日記', body: 'でも楽しかった！' }],
    }));
    expect(r.body).toBe(['今日は数学を30分勉強した。', '趣味：ギターを30分。', '今日は少し眠かった', 'でも楽しかった！'].join('\n'));
  });

  it('日記のログだけでも、データのある日になる', () => {
    expect(composeJournal(make({ logs: [{ tag: '日記', body: 'ひとこと' }] }))).toEqual({ body: 'ひとこと', hasData: true });
  });

  it('責める言葉を使わない', () => {
    const r = composeJournal(make({
      study: [{ name: '数学', minutes: 5 }], digital: { minutes: 300, diffMinutes: 200 }, sleep: { bed: '03:00', bedDiffMinutes: 180, durationMin: 200 },
    }));
    expect(r.body).not.toMatch(/ダメ|だらし|怠|サボ|悪|失敗|反省|もっと/);
  });
});

describe('composeJournal：モチベ', () => {
  it('その日のモチベを1行入れる（記録した項目だけ。欠けは欠けのまま）', () => {
    const r = composeJournal(make({ motivation: { scores: { game: 3, phys: 7 }, comment: '配線が進んだ。' } }));
    expect(r.body).toBe('モチベーションは 物理部関連7・その他ゲーム3 だった（一言：配線が進んだ）。');
    expect(r.hasData).toBe(true);
  });
  it('一言がなければ点数だけ。未記録・点数のない記録なら出さない', () => {
    expect(composeJournal(make({ motivation: { scores: { phys: 7, photo: 5 }, comment: null } })).body).toBe('モチベーションは 物理部関連7・写真5 だった。');
    expect(composeJournal(make({ motivation: null })).body).toBe('');
    expect(composeJournal(make({ motivation: { scores: {}, comment: 'メモだけ' } })).body).toBe('');
  });
  it('睡眠の文のあと、ログの前に入る', () => {
    const r = composeJournal(make({
      sleep: { bed: '23:30', bedDiffMinutes: null, durationMin: null },
      motivation: { scores: { phys: 6 }, comment: null },
      logs: [{ tag: '趣味', body: 'ギター' }],
    }));
    expect(r.body.split('\n')).toEqual(['就寝は23:30だった。', 'モチベーションは 物理部関連6 だった。', '趣味：ギター。']);
  });
});
