import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Printer, Users, Calendar, MapPin, Clock, Hash, Loader2, Trash2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { getPublicOrigin } from '@/lib/getPublicUrl';

interface Attendee {
  id: string;
  organization: string;
  position: string | null;
  name: string;
  phone: string;
  signature_url: string;
  checked_in_at: string | null;
}

interface EventData {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string;
  end_time: string;
  location: string;
  organizer: string;
  access_code: string;
  status: string | null;
}

const EventDetail = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventData | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate('/admin/login');
  }, [user, authLoading, navigate]);

  useEffect(() => {
    const fetchData = async () => {
      const [eventRes, attendeesRes] = await Promise.all([
        supabase.from('events').select('*').eq('id', eventId!).single(),
        supabase.from('attendees').select('*').eq('event_id', eventId!).order('checked_in_at', { ascending: true }),
      ]);

      if (eventRes.error) {
        toast.error('행사를 찾을 수 없습니다.');
        navigate('/admin');
        return;
      }

      setEvent(eventRes.data);
      setAttendees(attendeesRes.data || []);
      setLoading(false);
    };

    if (user) fetchData();
  }, [user, eventId, navigate]);

  const handleDelete = async () => {
    if (!confirm('이 행사를 삭제하시겠습니까? 모든 참석 기록도 함께 삭제됩니다.')) return;
    const { error } = await supabase.from('events').delete().eq('id', eventId!);
    if (error) {
      toast.error('삭제에 실패했습니다.');
      return;
    }
    toast.success('행사가 삭제되었습니다.');
    navigate('/admin');
  };

  const attendUrl = `${getPublicOrigin()}/attend/${event?.access_code}`;

  if (loading || authLoading) {
    return (
      <div className="min-h-svh bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border/50 sticky top-0 z-10 no-print">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate('/admin')}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            목록
          </button>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-1" />
              삭제
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1" />
              인쇄
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Event Info */}
        <div className="bg-card rounded-2xl shadow-card p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">{event?.title}</h1>
              {event?.description && (
                <p className="text-sm text-muted-foreground">{event.description}</p>
              )}
              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {event?.event_date}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {event?.start_time?.slice(0, 5)} ~ {event?.end_time?.slice(0, 5)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {event?.location}
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm font-medium">
                <Hash className="w-3.5 h-3.5" />
                접속코드: {event?.access_code}
              </div>
            </div>

            {/* QR Code */}
            <div className="flex-shrink-0 bg-secondary/50 rounded-xl p-4 text-center space-y-2">
              <QRCodeSVG value={attendUrl} size={120} level="M" />
              <p className="text-xs text-muted-foreground">QR코드로 참석 등록</p>
            </div>
          </div>
        </div>

        {/* Attendees Table */}
        <div className="bg-card rounded-2xl shadow-card overflow-hidden">
          <div className="p-6 border-b border-border/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <h2 className="font-bold text-foreground">참석자 명부</h2>
            </div>
            <span className="tabular-nums text-sm text-muted-foreground font-medium">
              총 {attendees.length}명
            </span>
          </div>

          {attendees.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
              아직 참석 등록된 인원이 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary/50 text-muted-foreground">
                    <th className="px-4 py-3 text-left font-medium w-10">번호</th>
                    <th className="px-4 py-3 text-left font-medium">소속</th>
                    <th className="px-4 py-3 text-left font-medium">성명</th>
                    <th className="px-4 py-3 text-left font-medium">직급</th>
                    <th className="px-4 py-3 text-left font-medium">연락처</th>
                    <th className="px-4 py-3 text-left font-medium">서명</th>
                    <th className="px-4 py-3 text-left font-medium">등록시간</th>
                  </tr>
                </thead>
                <tbody>
                  {attendees.map((a, i) => (
                    <tr key={a.id} className="border-t border-border/30 hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-3 text-foreground">{a.organization}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{a.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{a.position || '-'}</td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{a.phone}</td>
                      <td className="px-4 py-3">
                        <img
                          src={a.signature_url}
                          alt={`${a.name} 서명`}
                          className="h-8 w-auto"
                        />
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground text-xs">
                        {a.checked_in_at
                          ? new Date(a.checked_in_at).toLocaleString('ko-KR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default EventDetail;
