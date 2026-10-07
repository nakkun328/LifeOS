'use client';
import { formatDelta } from '@/lib/digital';
import { formatMinutes } from '@/lib/messages';
import { useApi } from '@/lib/useApi';
import type { LogRow, WishRow } from '@/lib/types';
import type { TodayView } from '@/server/handlers/today';
import { AppShell } from './AppShell';
import { Card } from './Card';

/** Life：Sleep・Digital・ログ・決定事項への入口 */
export function LifePage() {
  const { data: v, error } = useApi<TodayView>('/api/today', 60_000);
  const { data: decisions } = useApi<LogRow[]>('/api/decisions?limit=1');
  const { data: wishes } = useApi<WishRow[]>('/api/wishlist');
  const last = v?.sleep.lastNight;
  const d = v?.digital.day;
  return (
    <AppShell title="Life">
      <div className="err">{error}</div>
      <div className="hub">
        <Card href="/life/sleep" title="Sleep">
          {last ? (
            <div className="sub">昨夜 {last.durationMin !== null ? formatMinutes(last.durationMin) : '起床の記録なし'}　{v?.sleep.diffMessage ?? ''}</div>
          ) : <div className="sub">就寝・起床の記録と推移</div>}
        </Card>
        <Card href="/life/digital" title="Digital">
          <div className="sub">
            {d ? `昨日 ${d.minutes}分${d.diffMinutes !== null ? `（昨日より${formatDelta(d.diffMinutes)}）` : ''}` : 'Mac と iPhone の利用時間'}
          </div>
        </Card>
        <Card href="/life/logs" title="ログ">
          <div className="sub">趣味・部活・日記{v ? `　今日 ${v.logsToday.length}件` : ''}</div>
        </Card>
        <Card href="/life/decisions" title="決定事項（部活）">
          <div className="sub">{decisions && decisions[0] ? `最新：${decisions[0].title ? `${decisions[0].title} ／ ` : ''}${decisions[0].body}` : 'キーワードで探せます'}</div>
        </Card>
        <Card href="/life/wishlist" title="Wishlist">
          <div className="sub">{wishes ? `欲しい物 ${wishes.filter((w) => !w.purchased).length}件` : '欲しい物を1か所に'}</div>
        </Card>
      </div>
    </AppShell>
  );
}
