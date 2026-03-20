import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent,
} from '@/components/ui/dialog';
import {
  ArrowLeft, Users, Calendar, MapPin, Clock, Loader2, Trash2, Search, X,
  FileSpreadsheet, FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { exportToExcel, exportToPDF } from '@/lib/exportAttendees';

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
  event_date: string;
  start_time: string;
  end_time: string;
  location: string;
  organizer: string;
}

const AdminEventAttendees = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [event, setEvent] = useState<EventData | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const [eventRes, attendeesRes] = await Promise.all([
      supabase.from('events').select('id, title, event_date, start_time, end_time, location, organizer').eq('id', eventId!).single(),
      supabase.from('attendees').select('*').eq('event_id', eventId!).order('checked_in_at', { ascending: true }),
    ]);

    if (eventRes.error) {
      toast.error('행사를 찾을 수 없습니다.');
      navigate('/admin/events');
      return;
    }

    setEvent(eventRes.data);
    setAttendees(attendeesRes.data || []);
    setLoading(false);
  }, [eventId, navigate]);

  useEffect(() => {
    if (!authLoading && !user) navigate('/admin/login');
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchData();
  }, [user, fetchData]);

  // Realtime subscription for new attendees
  useEffect(() => {
    if (!eventId) return;

    const channel = supabase
      .channel(`attendees-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'attendees',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const newAttendee = payload.new as Attendee;
          setAttendees((prev) => [...prev, newAttendee]);
          toast.success(`${newAttendee.name} (${newAttendee.organization})님이 등록했습니다`, {
            duration: 4000,
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'attendees',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          setAttendees((prev) => prev.filter((a) => a.id !== deletedId));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  const handleDelete = async (attendee: Attendee) => {
    const { error } = await supabase.from('attendees').delete().eq('id', attendee.id);
    if (error) {
      toast.error('삭제에 실패했습니다.');
    } else {
      toast.success(`${attendee.name}님의 참석 기록이 삭제되었습니다.`);
      setAttendees((prev) => prev.filter((a) => a.id !== attendee.id));
    }
  };

  const filtered = search
    ? attendees.filter(
        (a) =>
          a.name.includes(search) ||
          a.organization.includes(search) ||
          a.phone.includes(search)
      )
    : attendees;

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      {/* Back nav */}
      <button
        onClick={() => navigate(`/admin/events/${eventId}`)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        행사 상세
      </button>

      {/* Event summary + count */}
      <div className="bg-card rounded-2xl shadow-sm border border-border/50 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-foreground">{event?.title}</h1>
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-4 h-4" /> {event?.event_date}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="w-4 h-4" /> {event?.start_time?.slice(0, 5)} ~ {event?.end_time?.slice(0, 5)}
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-4 h-4" /> {event?.location}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-primary/10 rounded-xl px-5 py-3">
            <Users className="w-6 h-6 text-primary" />
            <div>
              <p className="text-3xl font-bold text-primary tabular-nums">{attendees.length}</p>
              <p className="text-xs text-primary/70">총 참석자</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="이름, 소속으로 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-card"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Attendees list */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <Users className="w-12 h-12 mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground">
            {search ? '검색 결과가 없습니다.' : '아직 참석 등록된 인원이 없습니다.'}
          </p>
        </div>
      ) : isMobile ? (
        /* Mobile: Card list */
        <div className="space-y-3">
          {filtered.map((a, i) => (
            <div
              key={a.id}
              className="bg-card rounded-xl border border-border/50 p-4 space-y-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground tabular-nums">#{i + 1}</span>
                    <span className="font-semibold text-foreground">{a.name}</span>
                    {a.position && (
                      <span className="text-xs text-muted-foreground">{a.position}</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{a.organization}</p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>참석 기록 삭제</AlertDialogTitle>
                      <AlertDialogDescription>
                        {a.name}님의 참석 기록을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>취소</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(a)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        삭제
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground tabular-nums">{a.phone}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {a.checked_in_at
                    ? new Date(a.checked_in_at).toLocaleString('ko-KR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '-'}
                </span>
              </div>
              {a.signature_url && (
                <button
                  onClick={() => setSignaturePreview(a.signature_url)}
                  className="block"
                >
                  <img
                    src={a.signature_url}
                    alt={`${a.name} 서명`}
                    className="h-10 w-auto border border-border/50 rounded bg-white p-1"
                  />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* Desktop: Table */
        <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/50 text-muted-foreground">
                  <th className="px-4 py-3 text-left font-medium w-12">번호</th>
                  <th className="px-4 py-3 text-left font-medium">소속</th>
                  <th className="px-4 py-3 text-left font-medium">직급</th>
                  <th className="px-4 py-3 text-left font-medium">성명</th>
                  <th className="px-4 py-3 text-left font-medium">연락처</th>
                  <th className="px-4 py-3 text-left font-medium">서명</th>
                  <th className="px-4 py-3 text-left font-medium">등록시각</th>
                  <th className="px-4 py-3 text-left font-medium w-12"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a, i) => (
                  <tr
                    key={a.id}
                    className="border-t border-border/30 hover:bg-secondary/30 transition-colors"
                  >
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3 text-foreground">{a.organization}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.position || '-'}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{a.name}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{a.phone}</td>
                    <td className="px-4 py-3">
                      {a.signature_url ? (
                        <button onClick={() => setSignaturePreview(a.signature_url)}>
                          <img
                            src={a.signature_url}
                            alt={`${a.name} 서명`}
                            className="h-8 w-auto border border-border/50 rounded bg-white p-0.5 hover:shadow-md transition-shadow cursor-pointer"
                          />
                        </button>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground text-xs">
                      {a.checked_in_at
                        ? new Date(a.checked_in_at).toLocaleString('ko-KR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>참석 기록 삭제</AlertDialogTitle>
                            <AlertDialogDescription>
                              {a.name}님의 참석 기록을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>취소</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(a)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              삭제
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Signature preview dialog */}
      <Dialog open={!!signaturePreview} onOpenChange={() => setSignaturePreview(null)}>
        <DialogContent className="sm:max-w-md flex items-center justify-center p-8">
          {signaturePreview && (
            <img
              src={signaturePreview}
              alt="서명 확대"
              className="max-w-full max-h-[60vh] object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminEventAttendees;
