import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft, Printer, Users, Calendar, MapPin, Clock, Hash,
  Loader2, Trash2, Copy, Download, Pencil, Link2, QrCode,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';

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

const AdminEventDetail = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventData | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState<Partial<EventData>>({});
  const [saving, setSaving] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    const [eventRes, attendeesRes] = await Promise.all([
      supabase.from('events').select('*').eq('id', eventId!).single(),
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

  const attendUrl = `${window.location.origin}/attend/${event?.access_code}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(attendUrl);
    toast.success('참석 등록 링크가 복사되었습니다.');
  };

  const handleDownloadQR = () => {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      canvas.width = 512;
      canvas.height = 512;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 512, 512);
      ctx.drawImage(img, 0, 0, 512, 512);
      const a = document.createElement('a');
      a.download = `QR_${event?.access_code}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgData)))}`;
  };

  const handleDelete = async () => {
    if (!confirm('이 행사를 삭제하시겠습니까? 모든 참석 기록도 함께 삭제됩니다.')) return;
    const { error } = await supabase.from('events').delete().eq('id', eventId!);
    if (error) {
      toast.error('삭제에 실패했습니다.');
      return;
    }
    toast.success('행사가 삭제되었습니다.');
    navigate('/admin/events');
  };

  const openEdit = () => {
    if (!event) return;
    setEditForm({
      title: event.title,
      description: event.description || '',
      event_date: event.event_date,
      start_time: event.start_time,
      end_time: event.end_time,
      location: event.location,
      organizer: event.organizer,
      status: event.status,
    });
    setShowEdit(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from('events')
      .update(editForm)
      .eq('id', eventId!);
    if (error) {
      toast.error('수정에 실패했습니다.');
    } else {
      toast.success('행사가 수정되었습니다.');
      setShowEdit(false);
      fetchData();
    }
    setSaving(false);
  };

  const updateEdit = (key: string, value: string) => setEditForm({ ...editForm, [key]: value });

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Back nav */}
      <button
        onClick={() => navigate('/admin/events')}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        행사 목록
      </button>

      {/* Event Info Card */}
      <div className="bg-card rounded-2xl shadow-sm border border-border/50 p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="space-y-3 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">{event?.title}</h1>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${
                event?.status === '진행중' ? 'bg-primary/10 text-primary' :
                event?.status === '완료' ? 'bg-muted text-muted-foreground' :
                'bg-secondary text-secondary-foreground'
              }`}>
                {event?.status || '예정'}
              </span>
            </div>
            {event?.description && (
              <p className="text-sm text-muted-foreground">{event.description}</p>
            )}
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
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm font-medium">
              <Hash className="w-3.5 h-3.5" /> 접속코드: {event?.access_code}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={handleCopyLink}>
                <Copy className="w-4 h-4 mr-1" /> 링크 복사
              </Button>
              <Button size="sm" variant="outline" onClick={handleDownloadQR}>
                <Download className="w-4 h-4 mr-1" /> QR 다운로드
              </Button>
              <Button size="sm" variant="outline" onClick={openEdit}>
                <Pencil className="w-4 h-4 mr-1" /> 수정
              </Button>
              <Button size="sm" variant="outline" onClick={handleDelete} className="text-destructive hover:text-destructive">
                <Trash2 className="w-4 h-4 mr-1" /> 삭제
              </Button>
              <Button size="sm" variant="outline" onClick={() => window.print()}>
                <Printer className="w-4 h-4 mr-1" /> 인쇄
              </Button>
            </div>
          </div>

          {/* QR Code */}
          <div ref={qrRef} className="flex-shrink-0 bg-secondary/50 rounded-xl p-4 text-center space-y-2">
            <QRCodeSVG value={attendUrl} size={140} level="M" />
            <p className="text-xs text-muted-foreground">QR코드로 참석 등록</p>
          </div>
        </div>
      </div>

      {/* Real-time count */}
      <div className="bg-card rounded-2xl shadow-sm border border-border/50 p-5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Users className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground tabular-nums">{attendees.length}명</p>
          <p className="text-xs text-muted-foreground">참석 등록 완료</p>
        </div>
      </div>

      {/* Attendees Table */}
      <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
        <div className="p-5 border-b border-border/50 flex items-center justify-between">
          <h2 className="font-bold text-foreground flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" /> 참석자 명부
          </h2>
          <span className="tabular-nums text-sm text-muted-foreground font-medium">총 {attendees.length}명</span>
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
                      <img src={a.signature_url} alt={`${a.name} 서명`} className="h-8 w-auto" />
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground text-xs">
                      {a.checked_in_at
                        ? new Date(a.checked_in_at).toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>행사 수정</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">행사명 *</label>
              <Input value={editForm.title || ''} onChange={(e) => updateEdit('title', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">설명</label>
              <Input value={editForm.description || ''} onChange={(e) => updateEdit('description', e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">날짜 *</label>
                <Input type="date" value={editForm.event_date || ''} onChange={(e) => updateEdit('event_date', e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">시작 *</label>
                <Input type="time" value={editForm.start_time || ''} onChange={(e) => updateEdit('start_time', e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">종료 *</label>
                <Input type="time" value={editForm.end_time || ''} onChange={(e) => updateEdit('end_time', e.target.value)} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">장소 *</label>
              <Input value={editForm.location || ''} onChange={(e) => updateEdit('location', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">주관부서 *</label>
              <Input value={editForm.organizer || ''} onChange={(e) => updateEdit('organizer', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">상태</label>
              <select
                value={editForm.status || '예정'}
                onChange={(e) => updateEdit('status', e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="예정">예정</option>
                <option value="진행중">진행중</option>
                <option value="완료">완료</option>
              </select>
            </div>
            <Button type="submit" className="w-full h-11 font-semibold" disabled={saving}>
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : '저장'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminEventDetail;
