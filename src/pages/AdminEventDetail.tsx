import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft, Users, Calendar, MapPin, Clock, Hash,
  Loader2, Trash2, Copy, Download, Pencil, Maximize2, FileImage,
  BarChart3, ImagePlus, X, FileSpreadsheet, FileText,
  ClipboardList, CheckCircle2, UserPlus,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { downloadQRPoster, downloadQRImage } from '@/lib/qrExport';
import {
  exportApplicantsToExcel, exportApplicantsToPDF,
  exportAttendeesRosterToExcel, exportAttendeesRosterToPDF,
  type RosterAttendee,
} from '@/lib/exportAttendees';
import { getPublicOrigin } from '@/lib/getPublicUrl';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

interface Attendee {
  id: string;
  org_type: string | null;
  organization: string;
  department: string | null;
  position: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  car_number: string | null;
  inquiry: string | null;
  
  signature_url: string | null;
  status: string;
  registered_at: string | null;
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
  show_car_number: boolean;
  pre_registration_close_at: string | null;
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
  const qrAttendRef = useRef<HTMLDivElement>(null);
  const qrRegisterRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<'applicants' | 'attendees'>('applicants');
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);

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

  const attendUrl = `${getPublicOrigin()}/attend/${event?.access_code}`;
  const registerUrl = `${getPublicOrigin()}/register/${event?.access_code}`;

  const handleCopyAttendLink = () => {
    navigator.clipboard.writeText(attendUrl);
    toast.success('참석 확인 링크가 복사되었습니다.');
  };

  const handleCopyRegisterLink = () => {
    navigator.clipboard.writeText(registerUrl);
    toast.success('사전 신청 링크가 복사되었습니다.');
  };

  const handleDownloadAttendQR = () => {
    const svg = qrAttendRef.current?.querySelector('svg') as SVGSVGElement | null;
    if (!svg || !event) return;
    downloadQRImage(svg, event.access_code, 'attend');
  };

  const handleDownloadRegisterQR = () => {
    const svg = qrRegisterRef.current?.querySelector('svg') as SVGSVGElement | null;
    if (!svg || !event) return;
    downloadQRImage(svg, event.access_code, 'register');
  };

  const handleDownloadAttendPoster = async () => {
    const svg = qrAttendRef.current?.querySelector('svg') as SVGSVGElement | null;
    if (!svg || !event) return;
    try {
      await downloadQRPoster(event, svg, 'attend');
      toast.success('참석 확인 QR 포스터가 다운로드되었습니다.');
    } catch {
      toast.error('포스터 다운로드에 실패했습니다.');
    }
  };

  const handleDownloadRegisterPoster = async () => {
    const svg = qrRegisterRef.current?.querySelector('svg') as SVGSVGElement | null;
    if (!svg || !event) return;
    try {
      await downloadQRPoster(event, svg, 'register');
      toast.success('사전 신청 QR 포스터가 다운로드되었습니다.');
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
      show_car_number: event.show_car_number,
    });
    setEditPosterFile(null);
    setEditPosterPreview(null);
    setRemovePosterFlag(false);
    setShowEdit(true);
  };

  const togglePreRegClose = async () => {
    if (!event) return;
    const isClosed =
      !!event.pre_registration_close_at &&
      new Date(event.pre_registration_close_at).getTime() <= Date.now();
    const next = isClosed ? null : new Date().toISOString();
    const { error } = await supabase
      .from('events')
      .update({ pre_registration_close_at: next })
      .eq('id', eventId!);
    if (error) {
      toast.error('변경 실패');
    } else {
      toast.success(isClosed ? '사전신청을 재개했습니다.' : '사전신청을 마감했습니다.');
      fetchData();
    }
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

  // 신청자 = 사전신청자 (status: registered/checked_in). walk-in 제외
  const applicants = useMemo(
    () => attendees.filter((a) => a.status === 'registered' || a.status === 'checked_in'),
    [attendees]
  );
  // 참석자 = 서명한 사람 (사전신청 후 체크인 + walk-in)
  const attendedList = useMemo(
    () => attendees.filter((a) => !!a.signature_url && (a.status === 'checked_in' || a.status === 'walk_in')),
    [attendees]
  );
  const walkInCount = useMemo(
    () => attendees.filter((a) => a.status === 'walk_in').length,
    [attendees]
  );
  const noShowCount = useMemo(
    () => attendees.filter((a) => a.status === 'registered').length,
    [attendees]
  );

  const tabRows = tab === 'applicants' ? applicants : attendedList;

  const handleTabExport = async (fmt: 'xlsx' | 'pdf') => {
    if (!event || tabRows.length === 0) return;
    setExporting(fmt);
    try {
      const rows = tabRows as unknown as RosterAttendee[];
      const opts = { showCarNumber: event.show_car_number, kind: '행사' as const };
      if (tab === 'applicants') {
        if (fmt === 'xlsx') await exportApplicantsToExcel(event, rows, opts);
        else await exportApplicantsToPDF(event, rows, opts);
        toast.success('신청자 명부가 다운로드되었습니다.');
      } else {
        if (fmt === 'xlsx') await exportAttendeesRosterToExcel(event, rows, opts);
        else await exportAttendeesRosterToPDF(event, rows, opts);
        toast.success('참석자 명부가 다운로드되었습니다.');
      }
    } catch {
      toast.error('다운로드에 실패했습니다.');
    } finally {
      setExporting(null);
    }
  };

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
        <div className="space-y-5">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">{event?.title}</h1>
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                {(() => {
                  const closed =
                    !!event?.pre_registration_close_at &&
                    new Date(event.pre_registration_close_at).getTime() <= Date.now();
                  return closed ? (
                    <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-warning/10 text-warning whitespace-nowrap">
                      사전신청 마감
                    </span>
                  ) : null;
                })()}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={togglePreRegClose}
                >
                  {event?.pre_registration_close_at &&
                  new Date(event.pre_registration_close_at).getTime() <= Date.now()
                    ? '사전신청 재개'
                    : '사전신청 마감'}
                </Button>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-lg whitespace-nowrap ${
                  event?.status === '진행중' ? 'bg-success/10 text-success' :
                  event?.status === '완료' ? 'bg-muted text-muted-foreground' :
                  'bg-primary/10 text-primary'
                }`}>
                  {event?.status || '예정'}
                </span>
              </div>
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
          </div>

          {/* Two QR Codes: 사전신청 + 참석확인 (side-by-side) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 1단계 사전신청 */}
            <div className="bg-primary/5 rounded-xl p-4 text-center space-y-2 border border-primary/20">
              <div className="flex items-center justify-center gap-1.5">
                <span className="text-[10px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded">1단계</span>
                <span className="text-xs font-semibold text-primary">사전 신청</span>
              </div>
              <div ref={qrRegisterRef} className="flex justify-center">
                <QRCodeSVG value={registerUrl} size={150} level="H" />
              </div>
              <div className="flex items-center justify-center gap-1">
                <Button size="sm" variant="ghost" className="h-7 px-1.5" onClick={handleCopyRegisterLink} aria-label="사전신청 링크 복사">
                  <Copy className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-1.5" onClick={handleDownloadRegisterQR} aria-label="사전신청 QR 이미지">
                  <Download className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-1.5" onClick={handleDownloadRegisterPoster} aria-label="사전신청 QR 포스터">
                  <FileImage className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            {/* 2단계 참석확인 */}
            <div className="bg-success/5 rounded-xl p-4 text-center space-y-2 border border-success/20">
              <div className="flex items-center justify-center gap-1.5">
                <span className="text-[10px] font-bold bg-success text-success-foreground px-1.5 py-0.5 rounded">2단계</span>
                <span className="text-xs font-semibold text-success">참석 확인</span>
              </div>
              <div ref={qrAttendRef} className="flex justify-center">
                <QRCodeSVG value={attendUrl} size={150} level="H" />
              </div>
              <div className="flex items-center justify-center gap-1">
                <Button size="sm" variant="ghost" className="h-7 px-1.5" onClick={handleCopyAttendLink} aria-label="참석확인 링크 복사">
                  <Copy className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-1.5" onClick={handleDownloadAttendQR} aria-label="참석확인 QR 이미지">
                  <Download className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-1.5" onClick={handleDownloadAttendPoster} aria-label="참석확인 QR 포스터">
                  <FileImage className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="border-t border-border/50 pt-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => navigate(`/admin/events/${eventId}/attendees`)} aria-label="명부 전체보기">
                <Users className="w-4 h-4 mr-1" /> 명부 전체보기
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowStats(true)} aria-label="통계 보기">
                <BarChart3 className="w-4 h-4 mr-1" /> 통계
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigate(`/admin/events/${eventId}/qr`)} aria-label="QR코드 전체화면">
                <Maximize2 className="w-4 h-4 mr-1" /> QR 전체화면
              </Button>
              <Button size="sm" variant="outline" onClick={openEdit} aria-label="행사 수정">
                <Pencil className="w-4 h-4 mr-1" /> 수정
              </Button>
              <Button size="sm" variant="outline" onClick={handleDelete} className="text-destructive hover:text-destructive" aria-label="행사 삭제">
                <Trash2 className="w-4 h-4 mr-1" /> 삭제
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary cards: 사전 신청 / 참석 완료 / 현장 등록 / 미참석 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card rounded-xl shadow-sm border border-border/50 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><ClipboardList className="w-5 h-5 text-primary" /></div>
          <div>
            <p className="text-2xl font-bold tabular-nums">{applicants.length}</p>
            <p className="text-[11px] text-muted-foreground">사전 신청</p>
          </div>
        </div>
        <div className="bg-card rounded-xl shadow-sm border border-border/50 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-success" /></div>
          <div>
            <p className="text-2xl font-bold tabular-nums">{attendedList.length}</p>
            <p className="text-[11px] text-muted-foreground">참석 완료</p>
          </div>
        </div>
        <div className="bg-card rounded-xl shadow-sm border border-border/50 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center"><UserPlus className="w-5 h-5 text-warning" /></div>
          <div>
            <p className="text-2xl font-bold tabular-nums">{walkInCount}</p>
            <p className="text-[11px] text-muted-foreground">현장 등록</p>
          </div>
        </div>
        <div className="bg-card rounded-xl shadow-sm border border-border/50 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center"><X className="w-5 h-5 text-muted-foreground" /></div>
          <div>
            <p className="text-2xl font-bold tabular-nums">{noShowCount}</p>
            <p className="text-[11px] text-muted-foreground">미참석</p>
          </div>
        </div>
      </div>

      {/* Roster preview with tabs */}
      <div className="bg-card rounded-xl shadow-sm border border-border/50 overflow-hidden">
        <div className="p-4 border-b border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex gap-2" role="tablist">
            <button
              role="tab"
              aria-selected={tab === 'applicants'}
              onClick={() => setTab('applicants')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === 'applicants' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              <ClipboardList className="w-4 h-4" />신청자 명부 ({applicants.length})
            </button>
            <button
              role="tab"
              aria-selected={tab === 'attendees'}
              onClick={() => setTab('attendees')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === 'attendees' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />참석자 명부 ({attendedList.length})
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => handleTabExport('xlsx')}
              disabled={!!exporting || tabRows.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {exporting === 'xlsx' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-1" />}
              엑셀
            </Button>
            <Button
              size="sm"
              onClick={() => handleTabExport('pdf')}
              disabled={!!exporting || tabRows.length === 0}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {exporting === 'pdf' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />}
              PDF
            </Button>
          </div>
        </div>

        <div className="px-4 pt-3 text-xs text-muted-foreground">
          {tab === 'applicants'
            ? '사전 신청한 모든 인원입니다 (서명 미포함).'
            : '서명 완료한 참석자입니다 (사전신청 + 현장등록).'}
        </div>

        {tabRows.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            {tab === 'applicants' ? '아직 사전 신청한 인원이 없습니다.' : '아직 참석 확인된 인원이 없습니다.'}
          </div>
        ) : (
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/50 text-muted-foreground">
                  <th className="px-4 py-3 text-left font-medium w-10">번호</th>
                  <th className="px-4 py-3 text-left font-medium">소속</th>
                  <th className="px-4 py-3 text-left font-medium">성명</th>
                  <th className="px-4 py-3 text-left font-medium">직급</th>
                  {tab === 'attendees' && <th className="px-4 py-3 text-left font-medium">서명</th>}
                  {tab === 'attendees' && <th className="px-4 py-3 text-left font-medium">구분</th>}
                  <th className="px-4 py-3 text-left font-medium">{tab === 'applicants' ? '신청시각' : '등록시각'}</th>
                  {tab === 'applicants' && <th className="px-4 py-3 text-left font-medium">참석여부</th>}
                </tr>
              </thead>
              <tbody>
                {tabRows.map((a, i) => (
                  <tr key={a.id} className="border-t border-border/30 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3 text-foreground">{a.organization}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{a.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.position || '-'}</td>
                    {tab === 'attendees' && (
                      <td className="px-4 py-3">
                        {a.signature_url ? <img src={a.signature_url} alt={`${a.name} 서명`} className="h-8 w-auto" /> : '-'}
                      </td>
                    )}
                    {tab === 'attendees' && (
                      <td className="px-4 py-3">
                        {a.status === 'walk_in'
                          ? <span className="text-[10px] bg-warning/10 text-warning px-1.5 py-0.5 rounded">현장등록</span>
                          : <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">사전신청</span>}
                      </td>
                    )}
                    <td className="px-4 py-3 tabular-nums text-muted-foreground text-xs">
                      {tab === 'applicants'
                        ? (a.registered_at ? new Date(a.registered_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-')
                        : (a.checked_in_at ? new Date(a.checked_in_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-')}
                    </td>
                    {tab === 'applicants' && (
                      <td className="px-4 py-3">
                        {a.status === 'checked_in'
                          ? <span className="text-[10px] bg-success/10 text-success px-1.5 py-0.5 rounded">참석</span>
                          : <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">미참석</span>}
                      </td>
                    )}
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
            <DialogTitle className="flex items-center gap-2 text-sm">
              <BarChart3 className="w-4 h-4 text-primary" />
              참석자 통계
              <span className="text-xs font-normal text-muted-foreground ml-1">({attendees.length}명)</span>
            </DialogTitle>
          </DialogHeader>

          {attendees.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-xs">참석자가 없어 통계를 표시할 수 없습니다.</p>
          ) : (
            <div className="space-y-6">
              {/* Org chart */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-foreground">소속별 참석 현황</h3>
                {orgStats.length > 0 && (
                  <div style={{ height: Math.max(180, Math.min(280, orgStats.length * 36)) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={orgStats}
                          cx="50%"
                          cy="50%"
                          innerRadius={orgStats.length > 5 ? 35 : 45}
                          outerRadius={orgStats.length > 5 ? 65 : 80}
                          paddingAngle={orgStats.length > 5 ? 1 : 2}
                          dataKey="value"
                          label={({ name, value }) => {
                            const displayName = name.length > 6 ? name.slice(0, 6) + '…' : name;
                            return `${displayName} (${value})`;
                          }}
                          fontSize={orgStats.length > 5 ? 9 : 10}
                        >
                          {orgStats.map((_, index) => (
                            <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ fontSize: '11px' }} />
                        <Legend
                          wrapperStyle={{ fontSize: '10px' }}
                          iconSize={8}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Time trend */}
              {timeStats.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-foreground">시간대별 등록 추이</h3>
                  <div style={{ height: Math.max(160, Math.min(240, timeStats.length * 28)) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={timeStats} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="time"
                          tick={{ fontSize: timeStats.length > 10 ? 9 : 10 }}
                          interval={timeStats.length > 12 ? 1 : 0}
                          angle={timeStats.length > 8 ? -45 : 0}
                          textAnchor={timeStats.length > 8 ? 'end' : 'middle'}
                          height={timeStats.length > 8 ? 40 : 24}
                        />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={30} />
                        <Tooltip contentStyle={{ fontSize: '11px' }} />
                        <Bar
                          dataKey="count"
                          fill="hsl(var(--primary))"
                          radius={[3, 3, 0, 0]}
                          name="등록 수"
                          maxBarSize={timeStats.length < 4 ? 48 : undefined}
                        />
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

            {/* Car number toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">차량번호 입력</p>
                <p className="text-xs text-muted-foreground">참석자에게 차량번호를 입력받습니다</p>
              </div>
              <Switch
                checked={!!editForm.show_car_number}
                onCheckedChange={(checked) => setEditForm({ ...editForm, show_car_number: checked })}
              />
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
