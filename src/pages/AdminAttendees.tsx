import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Users, Search, FileSpreadsheet, FileText, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { exportAllAttendeesToExcel, exportAllAttendeesToPDF } from '@/lib/exportAttendees';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AttendeeRow {
  id: string;
  org_type: string | null;
  organization: string;
  department: string | null;
  position: string | null;
  name: string;
  car_number: string | null;
  checked_in_at: string | null;
  event_title: string;
  event_date: string;
}

const AdminAttendees = () => {
  const { user, isSuperAdmin, roleLoading } = useAuth();
  const [attendees, setAttendees] = useState<AttendeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>('all');
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Derive unique event titles and dates for filters
  const eventTitles = useMemo(() => {
    const titles = [...new Set(attendees.map(a => a.event_title))];
    return titles.sort();
  }, [attendees]);

  const eventDates = useMemo(() => {
    const dates = [...new Set(attendees.map(a => a.event_date))];
    return dates.sort().reverse();
  }, [attendees]);

  useEffect(() => {
    const fetch = async () => {
      let eventsQuery = supabase.from('events').select('id, title, event_date');
      if (!isSuperAdmin && user) {
        eventsQuery = eventsQuery.eq('created_by', user.id);
      }
      const { data: events } = await eventsQuery;

      const eventIds = (events || []).map(e => e.id);
      if (eventIds.length === 0) {
        setAttendees([]);
        setLoading(false);
        return;
      }

      const { data: atts } = await supabase
        .from('attendees')
        .select('*')
        .in('event_id', eventIds)
        .order('checked_in_at', { ascending: false });

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
    if (user && !roleLoading) fetch();
  }, [user, isSuperAdmin, roleLoading]);

  const filtered = useMemo(() => {
    let result = attendees;
    if (selectedEvent !== 'all') {
      result = result.filter(a => a.event_title === selectedEvent);
    }
    if (selectedDate !== 'all') {
      result = result.filter(a => a.event_date === selectedDate);
    }
    if (search) {
      result = result.filter(a =>
        a.name.includes(search) ||
        a.organization.includes(search) ||
        a.event_title.includes(search)
      );
    }
    return result;
  }, [attendees, selectedEvent, selectedDate, search]);

  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      await exportAllAttendeesToExcel(filtered);
      toast.success('엑셀 파일이 다운로드되었습니다.');
    } catch {
      toast.error('엑셀 다운로드에 실패했습니다.');
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      await exportAllAttendeesToPDF(filtered);
      toast.success('PDF 파일이 다운로드되었습니다.');
    } catch {
      toast.error('PDF 다운로드에 실패했습니다.');
    } finally {
      setExportingPdf(false);
    }
  };

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

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={handleExportExcel}
          disabled={exportingExcel || filtered.length === 0}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {exportingExcel ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-1" />}
          엑셀 다운로드
        </Button>
        <Button
          onClick={handleExportPdf}
          disabled={exportingPdf || filtered.length === 0}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          {exportingPdf ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />}
          PDF 다운로드
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Filter className="w-4 h-4" />
          <span>필터</span>
        </div>
        <Select value={selectedEvent} onValueChange={setSelectedEvent}>
          <SelectTrigger className="w-[200px] bg-card">
            <SelectValue placeholder="행사 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 행사</SelectItem>
            {eventTitles.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedDate} onValueChange={setSelectedDate}>
          <SelectTrigger className="w-[160px] bg-card">
            <SelectValue placeholder="날짜 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 날짜</SelectItem>
            {eventDates.map(d => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(selectedEvent !== 'all' || selectedDate !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSelectedEvent('all'); setSelectedDate('all'); }}
            className="text-muted-foreground"
          >
            초기화
          </Button>
        )}
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
                  <th className="px-4 py-3 text-left font-medium">구분</th>
                  <th className="px-4 py-3 text-left font-medium">기관명</th>
                  <th className="px-4 py-3 text-left font-medium">부서</th>
                  <th className="px-4 py-3 text-left font-medium">성명</th>
                  <th className="px-4 py-3 text-left font-medium">직급</th>
                  <th className="px-4 py-3 text-left font-medium">차량번호</th>
                  <th className="px-4 py-3 text-left font-medium">등록시간</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} className="border-t border-border/30 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-foreground font-medium">{a.event_title}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{a.event_date}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.org_type || '-'}</td>
                    <td className="px-4 py-3 text-foreground">{a.organization}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.department || '-'}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{a.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.position || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.car_number || '-'}</td>
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
