import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Users, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface AttendeeRow {
  id: string;
  organization: string;
  position: string | null;
  name: string;
  phone: string;
  checked_in_at: string | null;
  event_title: string;
  event_date: string;
}

const AdminAttendees = () => {
  const { user } = useAuth();
  const [attendees, setAttendees] = useState<AttendeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetch = async () => {
      const { data: events } = await supabase.from('events').select('id, title, event_date');
      const { data: atts } = await supabase.from('attendees').select('*').order('checked_in_at', { ascending: false });

      const eventMap = new Map((events || []).map(e => [e.id, e]));
      const rows: AttendeeRow[] = (atts || []).map(a => {
        const ev = eventMap.get(a.event_id);
        return {
          ...a,
          event_title: ev?.title || '-',
          event_date: ev?.event_date || '-',
        };
      });

      setAttendees(rows);
      setLoading(false);
    };
    if (user) fetch();
  }, [user]);

  const filtered = search
    ? attendees.filter(a =>
        a.name.includes(search) ||
        a.organization.includes(search) ||
        a.event_title.includes(search) ||
        a.phone.includes(search)
      )
    : attendees;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">참석자 현황</h1>
        <span className="text-sm text-muted-foreground tabular-nums">총 {attendees.length}명</span>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="이름, 소속, 행사명으로 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-card"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <Users className="w-12 h-12 mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground">
            {search ? '검색 결과가 없습니다.' : '참석 등록된 인원이 없습니다.'}
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/50 text-muted-foreground">
                  <th className="px-4 py-3 text-left font-medium">행사</th>
                  <th className="px-4 py-3 text-left font-medium">날짜</th>
                  <th className="px-4 py-3 text-left font-medium">소속</th>
                  <th className="px-4 py-3 text-left font-medium">성명</th>
                  <th className="px-4 py-3 text-left font-medium">직급</th>
                  <th className="px-4 py-3 text-left font-medium">연락처</th>
                  <th className="px-4 py-3 text-left font-medium">등록시간</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} className="border-t border-border/30 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-foreground font-medium">{a.event_title}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{a.event_date}</td>
                    <td className="px-4 py-3 text-foreground">{a.organization}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{a.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.position || '-'}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{a.phone}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground text-xs">
                      {a.checked_in_at
                        ? new Date(a.checked_in_at).toLocaleString('ko-KR', {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                          })
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAttendees;
