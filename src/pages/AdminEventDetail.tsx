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
  ArrowLeft, Users, Calendar, MapPin, Clock, Hash,
  Loader2, Trash2, Copy, Download, Pencil, Maximize2, FileImage,
  BarChart3, ImagePlus, X, FileSpreadsheet, FileText,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { downloadQRPoster, downloadQRImage } from '@/lib/qrExport';
import { exportToExcel, exportToPDF } from '@/lib/exportAttendees';
import { getPublicOrigin } from '@/lib/getPublicUrl';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

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
  poster_url: string | null;
}

const CHART_COLORS = [
  'hsl(221, 80%, 48%)',
  'hsl(160, 84%, 29%)',
  'hsl(38, 92%, 50%)',
  'hsl(0, 72%, 51%)',
  'hsl(262, 52%, 47%)',
  'hsl(190, 90%, 35%)',
  'hsl(30, 80%, 55%)',
  'hsl(330, 70%, 50%)',
];

const AdminEventDetail = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventData | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showPosterZoom, setShowPosterZoom] = useState(false);
  const [editForm, setEditForm] = useState<Partial<EventData>>({});
  const [editPosterFile, setEditPosterFile] = useState<File | null>(null);
  const [editPosterPreview, setEditPosterPreview] = useState<string | null>(null);
  const [removePosterFlag, setRemovePosterFlag] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);
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

    setEvent(eventRes.data as EventData);
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
    const svg = qrRef.current?.querySelector('svg') as SVGSVGElement | null;
    if (!svg || !event) return;
    downloadQRImage(svg, event.access_code);
  };

  const handleDownloadPoster = async () => {
    const svg = qrRef.current?.querySelector('svg') as SVGSVGElement | null;
    if (!svg || !event) return;
    try {
      await downloadQRPoster(event, svg);
      toast.success('QR 포스터가 다운로드되었습니다.');
    } catch {
      toast.error('포스터 다운로드에 실패했습니다.');
    }
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
    setEditPosterFile(null);
    setEditPosterPreview(null);
    setRemovePosterFlag(false);
    setShowEdit(true);
  };

  const handleEditPosterSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('이미지 파일만 업로드 가능합니다.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('파일 크기는 5MB 이하로 업로드해주세요.');
      return;
    }
    setEditPosterFile(file);
    setEditPosterPreview(URL.createObjectURL(file));
    setRemovePosterFlag(false);
  };

  const handleRemoveEditPoster = () => {
    setEditPosterFile(null);
    if (editPosterPreview) URL.revokeObjectURL(editPosterPreview);
    setEditPosterPreview(null);
    setRemovePosterFlag(true);
    if (editFileInputRef.current) editFileInputRef.current.value = '';
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      let poster_url = event?.poster_url || null;

      if (editPosterFile) {
        const ext = editPosterFile.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('event-posters')
          .upload(fileName, editPosterFile, { contentType: editPosterFile.type });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('event-posters').getPublicUrl(fileName);
        poster_url = urlData.publicUrl;
      } else if (removePosterFlag) {
        poster_url = null;
      }

      const { error } = await supabase
        .from('events')
        .update({ ...editForm, poster_url })
        .eq('id', eventId!);
      if (error) throw error;

      toast.success('행사가 수정되었습니다.');
      setShowEdit(false);
      fetchData();
    } catch {
      toast.error('수정에 실패했습니다.');
    }
    setSaving(false);
  };

  const updateEdit = (key: string, value: string) => setEditForm({ ...editForm, [key]: value });

  // Stats data
  const orgStats = (() => {
    const map = new Map<string, number>();
    attendees.forEach((a) => {
      map.set(a.organization, (map.get(a.organization) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  })();

  const timeStats = (() => {
    const map = new Map<string, number>();
    attendees.forEach((a) => {
      if (a.checked_in_at) {
        const hour = new Date(a.checked_in_at).getHours();
        const min = new Date(a.checked_in_at).getMinutes();
        const label = `${String(hour).padStart(2, '0')}:${min < 30 ? '00' : '30'}`;
        map.set(label, (map.get(label) || 0) + 1);
      }
    });
    return Array.from(map.entries())
      .map(([time, count]) => ({ time, count }))
      .sort((a, b) => a.time.localeCompare(b.time));
  })();

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
        onClick={() => navigate('/admin/events')}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        aria-label="행사 목록으로 돌아가기"
      >
        <ArrowLeft className="w-4 h-4" />
        행사 목록
      </button>

      {/* Event Info Card */}
      <div className="bg-card rounded-xl shadow-sm border border-border/50 p-5 md:p-6 space-y-4 animate-fade-in">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5">
          <div className="space-y-3 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">{event?.title}</h1>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-lg whitespace-nowrap ${
                event?.status === '진행중' ? 'bg-success/10 text-success' :
                event?.status === '완료' ? 'bg-muted text-muted-foreground' :
                'bg-primary/10 text-primary'
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
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm font-medium font-mono">
              <Hash className="w-3.5 h-3.5" /> {event?.access_code}
            </div>

            {/* Poster thumbnail */}
            {event?.poster_url && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowPosterZoom(true)}
                  className="rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-colors"
                >
                  <img src={event.poster_url} alt="행사 포스터" className="max-h-32 w-auto object-contain" />
                </button>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button size="sm" onClick={() => navigate(`/admin/events/${eventId}/attendees`)} aria-label="참석자 목록 보기">
                <Users className="w-4 h-4 mr-1" /> 참석자 ({attendees.length})
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowStats(true)} aria-label="통계 보기">
                <BarChart3 className="w-4 h-4 mr-1" /> 통계
              </Button>
              <Button size="sm" variant="outline" onClick={handleCopyLink} aria-label="참석 등록 링크 복사">
                <Copy className="w-4 h-4 mr-1" /> 링크 복사
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigate(`/admin/events/${eventId}/qr`)} aria-label="QR코드 전체화면">
                <Maximize2 className="w-4 h-4 mr-1" /> QR 전체화면
              </Button>
              <Button size="sm" variant="outline" onClick={handleDownloadQR} aria-label="QR코드 이미지 다운로드">
                <Download className="w-4 h-4 mr-1" /> QR 이미지
              </Button>
              <Button size="sm" variant="outline" onClick={handleDownloadPoster} aria-label="행사 포스터 PDF 다운로드">
                <FileImage className="w-4 h-4 mr-1" /> 행사 포스터
              </Button>
              <Button size="sm" variant="outline" onClick={openEdit} aria-label="행사 수정">
                <Pencil className="w-4 h-4 mr-1" /> 수정
              </Button>
              <Button size="sm" variant="outline" onClick={handleDelete} className="text-destructive hover:text-destructive" aria-label="행사 삭제">
                <Trash2 className="w-4 h-4 mr-1" /> 삭제
              </Button>
            </div>
          </div>

          {/* QR Code */}
          <div ref={qrRef} className="flex-shrink-0 bg-secondary/50 rounded-xl p-4 text-center space-y-2">
            <QRCodeSVG value={attendUrl} size={160} level="H" />
            <p className="text-xs text-muted-foreground">QR코드로 참석 등록</p>
            <p className="text-[10px] text-muted-foreground/70 font-mono">{event?.access_code}</p>
          </div>
        </div>
      </div>

      {/* Real-time count */}
      <div className="bg-card rounded-xl shadow-sm border border-border/50 p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <Users className="w-6 h-6 text-primary" />
        </div>
        <div>
          <p className="text-3xl font-bold text-foreground tabular-nums">{attendees.length}<span className="text-lg font-normal text-muted-foreground ml-0.5">명</span></p>
          <p className="text-xs text-muted-foreground">참석 등록 완료</p>
        </div>
      </div>

      {/* Attendees Table */}
      <div className="bg-card rounded-xl shadow-sm border border-border/50 overflow-hidden">
        <div className="p-5 border-b border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="font-bold text-foreground flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" /> 참석자 명부
            <span className="tabular-nums text-sm text-muted-foreground font-medium ml-1">총 {attendees.length}명</span>
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={attendees.length === 0}
              onClick={async () => {
                if (!event) return;
                try {
                  await exportToExcel(event, attendees);
                  toast.success('엑셀 파일이 다운로드되었습니다.');
                } catch { toast.error('엑셀 다운로드에 실패했습니다.'); }
              }}
            >
              <FileSpreadsheet className="w-4 h-4 mr-1" /> 엑셀
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={attendees.length === 0}
              onClick={async () => {
                if (!event) return;
                try {
                  await exportToPDF(event, attendees);
                  toast.success('PDF 파일이 다운로드되었습니다.');
                } catch { toast.error('PDF 다운로드에 실패했습니다.'); }
              }}
            >
              <FileText className="w-4 h-4 mr-1" /> PDF
            </Button>
          </div>
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

      {/* Poster Zoom Dialog */}
      <Dialog open={showPosterZoom} onOpenChange={setShowPosterZoom}>
        <DialogContent className="sm:max-w-2xl p-2">
          {event?.poster_url && (
            <img src={event.poster_url} alt="행사 포스터" className="w-full rounded-lg" />
          )}
        </DialogContent>
      </Dialog>

      {/* Stats Dialog */}
      <Dialog open={showStats} onOpenChange={setShowStats}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              참석자 통계
            </DialogTitle>
          </DialogHeader>

          {attendees.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">참석자가 없어 통계를 표시할 수 없습니다.</p>
          ) : (
            <div className="space-y-8">
              {/* Org chart */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">소속별 참석 현황</h3>
                {orgStats.length > 0 && (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={orgStats}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={90}
                          paddingAngle={2}
                          dataKey="value"
                          label={({ name, value }) => `${name} (${value})`}
                        >
                          {orgStats.map((_, index) => (
                            <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Time trend */}
              {timeStats.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">시간대별 등록 추이</h3>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={timeStats}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(210, 18%, 90%)" />
                        <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="hsl(221, 80%, 48%)" radius={[4, 4, 0, 0]} name="등록 수" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>행사 수정</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="edit-title" className="text-sm font-medium text-foreground">행사명 *</label>
              <Input id="edit-title" value={editForm.title || ''} onChange={(e) => updateEdit('title', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edit-desc" className="text-sm font-medium text-foreground">설명</label>
              <Input id="edit-desc" value={editForm.description || ''} onChange={(e) => updateEdit('description', e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="edit-date" className="text-sm font-medium text-foreground">날짜 *</label>
                <Input id="edit-date" type="date" value={editForm.event_date || ''} onChange={(e) => updateEdit('event_date', e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="edit-start" className="text-sm font-medium text-foreground">시작 *</label>
                <Input id="edit-start" type="time" value={editForm.start_time || ''} onChange={(e) => updateEdit('start_time', e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="edit-end" className="text-sm font-medium text-foreground">종료 *</label>
                <Input id="edit-end" type="time" value={editForm.end_time || ''} onChange={(e) => updateEdit('end_time', e.target.value)} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edit-location" className="text-sm font-medium text-foreground">장소 *</label>
              <Input id="edit-location" value={editForm.location || ''} onChange={(e) => updateEdit('location', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edit-org" className="text-sm font-medium text-foreground">주관부서 *</label>
              <Input id="edit-org" value={editForm.organizer || ''} onChange={(e) => updateEdit('organizer', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edit-status" className="text-sm font-medium text-foreground">상태</label>
              <select
                id="edit-status"
                value={editForm.status || '예정'}
                onChange={(e) => updateEdit('status', e.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="예정">예정</option>
                <option value="진행중">진행중</option>
                <option value="완료">완료</option>
              </select>
            </div>

            {/* Poster upload in edit */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">행사 포스터</label>
              {editPosterPreview ? (
                <div className="relative rounded-lg overflow-hidden border border-border">
                  <img src={editPosterPreview} alt="포스터 미리보기" className="w-full max-h-48 object-contain bg-secondary/30" />
                  <button
                    type="button"
                    onClick={handleRemoveEditPoster}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-background/80 backdrop-blur flex items-center justify-center hover:bg-background transition-colors"
                    aria-label="포스터 삭제"
                  >
                    <X className="w-4 h-4 text-foreground" />
                  </button>
                </div>
              ) : !removePosterFlag && event?.poster_url ? (
                <div className="relative rounded-lg overflow-hidden border border-border">
                  <img src={event.poster_url} alt="현재 포스터" className="w-full max-h-48 object-contain bg-secondary/30" />
                  <button
                    type="button"
                    onClick={handleRemoveEditPoster}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-background/80 backdrop-blur flex items-center justify-center hover:bg-background transition-colors"
                    aria-label="포스터 삭제"
                  >
                    <X className="w-4 h-4 text-foreground" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => editFileInputRef.current?.click()}
                  className="w-full h-28 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                >
                  <ImagePlus className="w-6 h-6" />
                  <span className="text-xs">클릭하여 포스터 이미지 선택</span>
                </button>
              )}
              <input
                ref={editFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleEditPosterSelect}
              />
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
