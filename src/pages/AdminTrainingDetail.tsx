import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft, Loader2, Calendar, Clock, MapPin, User, Hash, Users,
  Copy, QrCode, Trash2, Pencil, Download, FileImage, BarChart3,
  ImagePlus, X, CheckCircle2, FileSpreadsheet, FileText, Maximize2, ScanLine,
  ClipboardList, UserPlus, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { getPublicOrigin } from '@/lib/getPublicUrl';
import { downloadQRImage, downloadQRPoster } from '@/lib/qrExport';
import {
  exportApplicantsToExcel, exportApplicantsToPDF,
  exportAttendeesRosterToExcel, exportAttendeesRosterToPDF,
  type TraineeRow, type RosterAttendee,
} from '@/lib/exportAttendees';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

interface Training {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string;
  end_time: string;
  location: string;
  organizer: string;
  instructor: string | null;
  access_code: string;
  status: string | null;
  capacity_enabled: boolean;
  capacity: number | null;
  allow_waitlist: boolean;
  show_car_number: boolean;
  poster_url: string | null;
  pre_registration_close_at: string | null;
}

const STATUSES = ['예정', '진행중', '완료'] as const;

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

const AdminTrainingDetail = () => {
  const { trainingId } = useParams<{ trainingId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [training, setTraining] = useState<Training | null>(null);
  const [trainees, setTrainees] = useState<TraineeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showPosterZoom, setShowPosterZoom] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Training>>({});
  const [editPosterFile, setEditPosterFile] = useState<File | null>(null);
  const [editPosterPreview, setEditPosterPreview] = useState<string | null>(null);
  const [removePosterFlag, setRemovePosterFlag] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const qrAttendRef = useRef<HTMLDivElement>(null);
  const qrRegisterRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<'applicants' | 'attendees' | 'noshow'>('applicants');
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);

  const fetchData = useCallback(async () => {
    if (!trainingId) return;
    const [tRes, trRes] = await Promise.all([
      supabase.from('trainings').select('*').eq('id', trainingId).single(),
      supabase.from('trainees').select('*').eq('training_id', trainingId).order('registered_at', { ascending: true }),
    ]);
    if (tRes.error || !tRes.data) { navigate('/admin/trainings'); return; }
    setTraining(tRes.data as Training);
    setTrainees((trRes.data || []) as TraineeRow[]);
    setLoading(false);
  }, [trainingId, navigate]);

  useEffect(() => { if (user) fetchData(); }, [user, fetchData]);

  const counts = useMemo(() => ({
    confirmed: trainees.filter((t) => t.status === 'confirmed').length,
    preRegistered: trainees.filter((t) => t.status === 'registered' || t.status === 'confirmed').length,
    waitlisted: trainees.filter((t) => t.status === 'waitlisted').length,
    cancelled: trainees.filter((t) => t.status === 'cancelled').length,
  }), [trainees]);

  // 신청자 = walk_in 제외 (사전신청자 전체)
  const applicants = useMemo(
    () => trainees.filter((t) => t.status !== 'walk_in'),
    [trainees]
  );
  // 참석자 = 서명 완료 (사전신청+체크인 confirmed + 현장등록 walk_in)
  const attendedList = useMemo(
    () => trainees.filter((t) => !!t.signature_url && (t.status === 'confirmed' || t.status === 'walk_in')),
    [trainees]
  );
  const walkInCount = useMemo(
    () => trainees.filter((t) => t.status === 'walk_in').length,
    [trainees]
  );
  // 미참석 = 사전신청 확정인데 서명 없음
  const noShowList = useMemo(
    () => trainees.filter((t) => (t.status === 'confirmed' || t.status === 'registered') && !t.signature_url),
    [trainees]
  );
  const noShowCount = noShowList.length;

  const tabRows = tab === 'applicants' ? applicants : tab === 'attendees' ? attendedList : noShowList;

  // Stats
  const orgStats = useMemo(() => {
    const map = new Map<string, number>();
    trainees.filter((t) => t.status !== 'cancelled').forEach((t) => {
      map.set(t.organization, (map.get(t.organization) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [trainees]);

  const timeStats = useMemo(() => {
    const map = new Map<string, number>();
    trainees.forEach((t) => {
      const d = new Date(t.registered_at);
      const hour = d.getHours();
      const min = d.getMinutes();
      const label = `${String(hour).padStart(2, '0')}:${min < 30 ? '00' : '30'}`;
      map.set(label, (map.get(label) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([time, count]) => ({ time, count }))
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [trainees]);

  const statusStats = useMemo(() => {
    const data = [
      { name: '확정', value: counts.confirmed },
      { name: '대기', value: counts.waitlisted },
      { name: '취소', value: counts.cancelled },
    ].filter((d) => d.value > 0);
    return data;
  }, [counts]);

  const attendUrl = `${getPublicOrigin()}/training/${training?.access_code ?? ''}`;
  const registerUrl = `${getPublicOrigin()}/register/${training?.access_code ?? ''}`;

  const updateStatus = async (status: string) => {
    const { error } = await supabase.from('trainings').update({ status }).eq('id', trainingId!);
    if (error) toast.error('상태 변경 실패');
    else { toast.success('상태가 변경되었습니다.'); fetchData(); }
  };

  const togglePreRegClose = async () => {
    if (!training) return;
    const isClosed =
      !!training.pre_registration_close_at &&
      new Date(training.pre_registration_close_at).getTime() <= Date.now();
    const next = isClosed ? null : new Date().toISOString();
    const { error } = await supabase
      .from('trainings')
      .update({ pre_registration_close_at: next })
      .eq('id', trainingId!);
    if (error) toast.error('변경 실패');
    else {
      toast.success(isClosed ? '사전신청을 재개했습니다.' : '사전신청을 마감했습니다.');
      fetchData();
    }
  };

  const copyAttendLink = () => {
    navigator.clipboard.writeText(attendUrl);
    toast.success('참석 확인 링크가 복사되었습니다.');
  };

  const copyRegisterLink = () => {
    navigator.clipboard.writeText(registerUrl);
    toast.success('사전 신청 링크가 복사되었습니다.');
  };

  const handleDownloadAttendQR = () => {
    const svg = qrAttendRef.current?.querySelector('svg') as SVGSVGElement | null;
    if (!svg || !training) return;
    downloadQRImage(svg, training.access_code, 'attend');
  };

  const handleDownloadRegisterQR = () => {
    const svg = qrRegisterRef.current?.querySelector('svg') as SVGSVGElement | null;
    if (!svg || !training) return;
    downloadQRImage(svg, training.access_code, 'register');
  };

  const handleDownloadAttendPoster = async () => {
    const svg = qrAttendRef.current?.querySelector('svg') as SVGSVGElement | null;
    if (!svg || !training) return;
    try {
      await downloadQRPoster(training, svg, 'attend');
      toast.success('참석 확인 QR 포스터가 다운로드되었습니다.');
    } catch {
      toast.error('포스터 다운로드에 실패했습니다.');
    }
  };

  const handleDownloadRegisterPoster = async () => {
    const svg = qrRegisterRef.current?.querySelector('svg') as SVGSVGElement | null;
    if (!svg || !training) return;
    try {
      await downloadQRPoster(training, svg, 'register');
      toast.success('사전 신청 QR 포스터가 다운로드되었습니다.');
    } catch {
      toast.error('포스터 다운로드에 실패했습니다.');
    }
  };

  const handleDelete = async () => {
    const { error } = await supabase.from('trainings').delete().eq('id', trainingId!);
    if (error) toast.error('삭제 실패');
    else { toast.success('교육이 삭제되었습니다.'); navigate('/admin/trainings'); }
  };

  const openEdit = () => {
    if (!training) return;
    setEditForm({
      title: training.title,
      description: training.description || '',
      event_date: training.event_date,
      start_time: training.start_time,
      end_time: training.end_time,
      location: training.location,
      organizer: training.organizer,
      instructor: training.instructor || '',
      status: training.status,
      show_car_number: training.show_car_number,
      capacity_enabled: training.capacity_enabled,
      capacity: training.capacity,
      allow_waitlist: training.allow_waitlist,
    });
    setEditPosterFile(null);
    setEditPosterPreview(null);
    setRemovePosterFlag(false);
    setShowEdit(true);
  };

  const handleEditPosterSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('이미지 파일만 업로드 가능합니다.'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('파일 크기는 5MB 이하로 업로드해주세요.'); return; }
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
      let poster_url: string | null = training?.poster_url || null;
      if (editPosterFile) {
        const ext = editPosterFile.name.split('.').pop();
        const fileName = `${user!.id}/training_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('event-posters').upload(fileName, editPosterFile, { contentType: editPosterFile.type });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('event-posters').getPublicUrl(fileName);
        poster_url = urlData.publicUrl;
      } else if (removePosterFlag) {
        poster_url = null;
      }

      const payload: any = { ...editForm, poster_url };
      if (payload.capacity != null && payload.capacity !== '') payload.capacity = Number(payload.capacity);
      if (!payload.capacity_enabled) payload.capacity = null;

      const { error } = await supabase.from('trainings').update(payload).eq('id', trainingId!);
      if (error) throw error;
      toast.success('교육이 수정되었습니다.');
      setShowEdit(false);
      fetchData();
    } catch {
      toast.error('수정에 실패했습니다.');
    }
    setSaving(false);
  };

  const updateEdit = (key: string, value: any) => setEditForm({ ...editForm, [key]: value });

  const handleTabExport = async (fmt: 'xlsx' | 'pdf') => {
    if (!training || tabRows.length === 0) return;
    setExporting(fmt);
    try {
      const rows: RosterAttendee[] = tabRows.map((t) => ({
        id: t.id,
        org_type: t.org_type,
        organization: t.organization,
        department: t.department,
        position: t.position,
        name: t.name,
        email: (t as any).email ?? null,
        phone: null,
        car_number: t.car_number,
        signature_url: t.signature_url || null,
        status: t.status,
        registered_at: t.registered_at,
        checked_in_at: t.confirmed_at,
      }));
      const opts = { showCarNumber: !!training.show_car_number, kind: '교육' as const };
      if (tab === 'attendees') {
        if (fmt === 'xlsx') await exportAttendeesRosterToExcel(training, rows, opts);
        else await exportAttendeesRosterToPDF(training, rows, opts);
        toast.success('참석자 명부가 다운로드되었습니다.');
      } else {
        if (fmt === 'xlsx') await exportApplicantsToExcel(training, rows, opts);
        else await exportApplicantsToPDF(training, rows, opts);
        toast.success(`${tab === 'noshow' ? '미참석자' : '신청자'} 명부가 다운로드되었습니다.`);
      }
    } catch {
      toast.error('다운로드에 실패했습니다.');
    } finally {
      setExporting(null);
    }
  };

  if (loading || !training) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const cap = training.capacity ?? 0;
  const pct = training.capacity_enabled && cap > 0 ? Math.min(100, Math.round((counts.preRegistered / cap) * 100)) : 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <button onClick={() => navigate('/admin/trainings')}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" />교육 목록
      </button>

      {/* Info card */}
      <div className="bg-card rounded-xl shadow-sm border border-border/50 p-5 md:p-6 space-y-4 animate-fade-in">
        <div className="space-y-5">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">{training.title}</h1>
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                {(() => {
                  const closed =
                    !!training.pre_registration_close_at &&
                    new Date(training.pre_registration_close_at).getTime() <= Date.now();
                  return closed ? (
                    <span className="text-xs font-medium px-2 py-1 rounded-lg bg-warning/10 text-warning whitespace-nowrap">
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
                  {training.pre_registration_close_at &&
                  new Date(training.pre_registration_close_at).getTime() <= Date.now()
                    ? '사전신청 재개'
                    : '사전신청 마감'}
                </Button>
                <select value={training.status || '예정'} onChange={(e) => updateStatus(e.target.value)}
                  className="text-xs font-medium border border-border rounded-lg px-2 py-1 bg-background">
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            {training.description && <p className="text-sm text-muted-foreground">{training.description}</p>}
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Calendar className="w-4 h-4" />{training.event_date}</span>
              <span className="inline-flex items-center gap-1"><Clock className="w-4 h-4" />{training.start_time?.slice(0,5)} ~ {training.end_time?.slice(0,5)}</span>
              <span className="inline-flex items-center gap-1"><MapPin className="w-4 h-4" />{training.location}</span>
              <span className="inline-flex items-center gap-1"><User className="w-4 h-4" />{training.organizer}{training.instructor ? ` · 강사: ${training.instructor}` : ''}</span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm font-medium font-mono">
              <Hash className="w-3.5 h-3.5" />{training.access_code}
            </div>

            {training.poster_url && (
              <div className="pt-1">
                <button type="button" onClick={() => setShowPosterZoom(true)}
                  className="rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-colors">
                  <img src={training.poster_url} alt="교육 포스터" className="max-h-32 w-auto object-contain" />
                </button>
              </div>
            )}
          </div>

          {/* Two QR Codes: 사전신청 + 참석확인 (side-by-side) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-primary/5 rounded-xl p-4 text-center space-y-2 border border-primary/20">
              <div className="flex items-center justify-center gap-1.5">
                <span className="text-[10px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded">1단계</span>
                <span className="text-xs font-semibold text-primary">사전 신청</span>
              </div>
              <div ref={qrRegisterRef} className="flex justify-center">
                <QRCodeSVG value={registerUrl} size={150} level="H" />
              </div>
              <div className="flex items-center justify-center gap-1">
                <Button size="sm" variant="ghost" className="h-7 px-1.5" onClick={copyRegisterLink} aria-label="사전신청 링크 복사">
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
            <div className="bg-success/5 rounded-xl p-4 text-center space-y-2 border border-success/20">
              <div className="flex items-center justify-center gap-1.5">
                <span className="text-[10px] font-bold bg-success text-success-foreground px-1.5 py-0.5 rounded">2단계</span>
                <span className="text-xs font-semibold text-success">참석 확인</span>
              </div>
              <div ref={qrAttendRef} className="flex justify-center">
                <QRCodeSVG value={attendUrl} size={150} level="H" />
              </div>
              <div className="flex items-center justify-center gap-1">
                <Button size="sm" variant="ghost" className="h-7 px-1.5" onClick={copyAttendLink} aria-label="참석확인 링크 복사">
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
              <Button size="sm" onClick={() => navigate(`/admin/trainings/${trainingId}/trainees`)}>
                <Users className="w-4 h-4 mr-1" />명부 전체보기
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowStats(true)}>
                <BarChart3 className="w-4 h-4 mr-1" />통계
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigate(`/admin/trainings/${trainingId}/qr`)}>
                <Maximize2 className="w-4 h-4 mr-1" />QR 전체화면
              </Button>
              <Button size="sm" variant="outline" onClick={openEdit}>
                <Pencil className="w-4 h-4 mr-1" />수정
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="text-destructive hover:text-destructive">
                    <Trash2 className="w-4 h-4 mr-1" />삭제
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>교육을 삭제하시겠습니까?</AlertDialogTitle>
                    <AlertDialogDescription>이 작업은 되돌릴 수 없습니다. 모든 신청자 정보도 함께 삭제됩니다.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">삭제</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </div>

      {/* Count cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-xl shadow-sm border border-border/50 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-primary" /></div>
          <div>
            <p className="text-2xl font-bold tabular-nums">{counts.confirmed}</p>
            <p className="text-[11px] text-muted-foreground">확정</p>
          </div>
        </div>
        <div className="bg-card rounded-xl shadow-sm border border-border/50 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center"><Clock className="w-5 h-5 text-warning" /></div>
          <div>
            <p className="text-2xl font-bold tabular-nums">{counts.waitlisted}</p>
            <p className="text-[11px] text-muted-foreground">대기</p>
          </div>
        </div>
        <div className="bg-card rounded-xl shadow-sm border border-border/50 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center"><X className="w-5 h-5 text-muted-foreground" /></div>
          <div>
            <p className="text-2xl font-bold tabular-nums">{counts.cancelled}</p>
            <p className="text-[11px] text-muted-foreground">취소</p>
          </div>
        </div>
      </div>

      {/* Capacity progress */}
      {training.capacity_enabled && (
        <div className="bg-card rounded-xl shadow-sm border border-border/50 p-5 space-y-3">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-foreground font-medium">사전신청 {counts.preRegistered} / 정원 {cap}명 ({pct}%)</span>
            <span className="text-muted-foreground">대기 {counts.waitlisted}명</span>
          </div>
          <div className="h-3 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

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
            <button
              role="tab"
              aria-selected={tab === 'noshow'}
              onClick={() => setTab('noshow')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === 'noshow' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              <XCircle className="w-4 h-4" />사전신청 미참석자 ({noShowCount})
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
            : tab === 'attendees'
              ? '서명 완료한 참석자입니다 (사전신청 + 현장등록).'
              : '사전 신청은 했지만 현장 서명(체크인)하지 않은 인원입니다.'}
        </div>

        {tabRows.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            {tab === 'applicants' ? '아직 사전 신청한 인원이 없습니다.' : tab === 'attendees' ? '아직 참석 확인된 인원이 없습니다.' : '미참석자가 없습니다.'}
          </div>
        ) : (
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/50 text-muted-foreground">
                  <th className="px-4 py-3 text-left font-medium w-10">번호</th>
                  <th className="px-4 py-3 text-left font-medium">상태</th>
                  <th className="px-4 py-3 text-left font-medium">소속</th>
                  <th className="px-4 py-3 text-left font-medium">성명</th>
                  <th className="px-4 py-3 text-left font-medium">직급</th>
                  {tab === 'attendees' && <th className="px-4 py-3 text-left font-medium">서명</th>}
                  <th className="px-4 py-3 text-left font-medium">{tab === 'applicants' ? '신청시각' : '등록시각'}</th>
                  <th className="px-4 py-3 text-right font-medium w-20">관리</th>
                </tr>
              </thead>
              <tbody>
                {tabRows.map((t, i) => (
                  <tr key={t.id} className="border-t border-border/30 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-md ${
                        t.status === 'confirmed' ? 'bg-primary/10 text-primary' :
                        t.status === 'registered' ? 'bg-primary/10 text-primary' :
                        t.status === 'waitlisted' ? 'bg-warning/10 text-warning' :
                        t.status === 'walk_in' ? 'bg-warning/10 text-warning' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {t.status === 'confirmed' ? '확정' :
                          t.status === 'registered' ? '신청' :
                          t.status === 'waitlisted' ? '대기' :
                          t.status === 'walk_in' ? '현장등록' :
                          t.status === 'cancelled' ? '취소' : t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground">{t.organization}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{t.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{t.position || '-'}</td>
                    {tab === 'attendees' && (
                      <td className="px-4 py-3">
                        {t.signature_url ? <img src={t.signature_url} alt={`${t.name} 서명`} className="h-8 w-auto" /> : '-'}
                      </td>
                    )}
                    <td className="px-4 py-3 tabular-nums text-muted-foreground text-xs">
                      {tab === 'applicants'
                        ? new Date(t.registered_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                        : new Date(t.confirmed_at || t.registered_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-7 text-destructive hover:text-destructive">
                            <Trash2 className="w-3.5 h-3.5 mr-1" />삭제
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>이 신청자를 삭제할까요?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t.name}님의 신청 정보가 완전히 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>취소</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={async () => {
                                const { error } = await supabase.from('trainees').delete().eq('id', t.id);
                                if (error) toast.error('삭제에 실패했습니다.');
                                else { toast.success(`${t.name}님을 삭제했습니다.`); fetchData(); }
                              }}
                              className="bg-destructive text-destructive-foreground"
                            >
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
        )}
      </div>

      {/* Poster Zoom Dialog */}
      <Dialog open={showPosterZoom} onOpenChange={setShowPosterZoom}>
        <DialogContent className="sm:max-w-2xl p-2">
          {training.poster_url && <img src={training.poster_url} alt="교육 포스터" className="w-full rounded-lg" />}
        </DialogContent>
      </Dialog>

      {/* Stats Dialog */}
      <Dialog open={showStats} onOpenChange={setShowStats}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <BarChart3 className="w-4 h-4 text-primary" />신청자 통계
              <span className="text-xs font-normal text-muted-foreground ml-1">(총 {trainees.length}명)</span>
            </DialogTitle>
          </DialogHeader>

          {trainees.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-xs">신청자가 없어 통계를 표시할 수 없습니다.</p>
          ) : (
            <div className="space-y-6">
              {/* Status distribution */}
              {statusStats.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-foreground">상태 분포</h3>
                  <div style={{ height: 200 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={statusStats} cx="50%" cy="50%" innerRadius={40} outerRadius={75} dataKey="value"
                          label={({ name, value }) => `${name} (${value})`} fontSize={10}>
                          {statusStats.map((_, i) => <Cell key={i} fill={CHART_COLORS[i]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ fontSize: '11px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Capacity */}
              {training.capacity_enabled && cap > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-foreground">정원 충원율</h3>
                  <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                    <span>{counts.preRegistered} / {cap}명</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-3 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )}

              {/* Org chart */}
              {orgStats.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-foreground">소속별 신청 현황 (취소 제외)</h3>
                  <div style={{ height: Math.max(180, Math.min(280, orgStats.length * 36)) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={orgStats} cx="50%" cy="50%"
                          innerRadius={orgStats.length > 5 ? 35 : 45}
                          outerRadius={orgStats.length > 5 ? 65 : 80}
                          paddingAngle={orgStats.length > 5 ? 1 : 2}
                          dataKey="value"
                          label={({ name, value }) => {
                            const dn = name.length > 6 ? name.slice(0, 6) + '…' : name;
                            return `${dn} (${value})`;
                          }}
                          fontSize={orgStats.length > 5 ? 9 : 10}>
                          {orgStats.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ fontSize: '11px' }} />
                        <Legend wrapperStyle={{ fontSize: '10px' }} iconSize={8} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Time trend */}
              {timeStats.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-foreground">시간대별 신청 추이</h3>
                  <div style={{ height: Math.max(160, Math.min(240, timeStats.length * 28)) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={timeStats} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="time"
                          tick={{ fontSize: timeStats.length > 10 ? 9 : 10 }}
                          interval={timeStats.length > 12 ? 1 : 0}
                          angle={timeStats.length > 8 ? -45 : 0}
                          textAnchor={timeStats.length > 8 ? 'end' : 'middle'}
                          height={timeStats.length > 8 ? 40 : 24} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={30} />
                        <Tooltip contentStyle={{ fontSize: '11px' }} />
                        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} name="신청 수"
                          maxBarSize={timeStats.length < 4 ? 48 : undefined} />
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
            <DialogTitle>교육 수정</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">교육명 *</label>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">주관부서 *</label>
                <Input value={editForm.organizer || ''} onChange={(e) => updateEdit('organizer', e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">강사</label>
                <Input value={editForm.instructor || ''} onChange={(e) => updateEdit('instructor', e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">상태</label>
              <select value={editForm.status || '예정'} onChange={(e) => updateEdit('status', e.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">차량번호 입력</p>
                <p className="text-xs text-muted-foreground">신청자에게 차량번호를 입력받습니다</p>
              </div>
              <Switch checked={!!editForm.show_car_number}
                onCheckedChange={(c) => setEditForm({ ...editForm, show_car_number: c })} />
            </div>

            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">정원 제한</p>
                  <p className="text-xs text-muted-foreground">정원을 초과하면 대기자로 등록됩니다</p>
                </div>
                <Switch checked={!!editForm.capacity_enabled}
                  onCheckedChange={(c) => setEditForm({ ...editForm, capacity_enabled: c })} />
              </div>
              {editForm.capacity_enabled && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">정원 수</label>
                    <Input type="number" min={1} value={editForm.capacity ?? ''}
                      onChange={(e) => updateEdit('capacity', e.target.value === '' ? null : Number(e.target.value))} />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-foreground">대기자 등록 허용</p>
                    <Switch checked={!!editForm.allow_waitlist}
                      onCheckedChange={(c) => setEditForm({ ...editForm, allow_waitlist: c })} />
                  </div>
                </>
              )}
            </div>

            {/* Poster */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">교육 포스터</label>
              {editPosterPreview ? (
                <div className="relative rounded-lg overflow-hidden border border-border">
                  <img src={editPosterPreview} alt="포스터 미리보기" className="w-full max-h-48 object-contain bg-secondary/30" />
                  <button type="button" onClick={handleRemoveEditPoster}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-background/80 backdrop-blur flex items-center justify-center hover:bg-background">
                    <X className="w-4 h-4 text-foreground" />
                  </button>
                </div>
              ) : !removePosterFlag && training?.poster_url ? (
                <div className="relative rounded-lg overflow-hidden border border-border">
                  <img src={training.poster_url} alt="현재 포스터" className="w-full max-h-48 object-contain bg-secondary/30" />
                  <button type="button" onClick={handleRemoveEditPoster}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-background/80 backdrop-blur flex items-center justify-center hover:bg-background">
                    <X className="w-4 h-4 text-foreground" />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => editFileInputRef.current?.click()}
                  className="w-full h-28 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors">
                  <ImagePlus className="w-6 h-6" />
                  <span className="text-xs">클릭하여 포스터 이미지 선택</span>
                </button>
              )}
              <input ref={editFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleEditPosterSelect} />
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

export default AdminTrainingDetail;