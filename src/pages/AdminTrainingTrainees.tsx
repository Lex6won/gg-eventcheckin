import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft, Loader2, Search, CheckCircle2, XCircle, Clock,
  FileSpreadsheet, FileText, Trash2, ClipboardList, UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  exportApplicantsToExcel, exportApplicantsToPDF,
  exportAttendeesRosterToExcel, exportAttendeesRosterToPDF,
  type RosterAttendee,
} from '@/lib/exportAttendees';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Trainee {
  id: string;
  org_type: string | null;
  organization: string;
  department: string | null;
  position: string | null;
  name: string;
  email: string | null;
  car_number: string | null;
  inquiry: string | null;
  signature_url: string | null;
  status: string;
  registered_at: string;
  confirmed_at: string | null;
  rechecked_at: string | null;
}

interface Training {
  id: string;
  title: string;
  event_date: string;
  start_time: string;
  end_time: string;
  location: string;
  organizer: string;
  instructor: string | null;
  capacity_enabled: boolean;
  capacity: number | null;
  show_car_number: boolean;
  recheck_enabled: boolean;
}

const SUB_TABS = [
  { key: 'confirmed', label: '확정', icon: CheckCircle2 },
  { key: 'waitlisted', label: '대기', icon: Clock },
  { key: 'cancelled', label: '취소', icon: XCircle },
] as const;

const AdminTrainingTrainees = () => {
  const { trainingId } = useParams<{ trainingId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [training, setTraining] = useState<Training | null>(null);
  const [trainees, setTrainees] = useState<Trainee[]>([]);
  const [loading, setLoading] = useState(true);
  const [mainTab, setMainTab] = useState<'applicants' | 'attendees'>('applicants');
  const [subTab, setSubTab] = useState<typeof SUB_TABS[number]['key']>('confirmed');
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);

  const fetchAll = useCallback(async () => {
    if (!trainingId) return;
    const { data: t } = await supabase.from('trainings')
      .select('id, title, event_date, start_time, end_time, location, organizer, instructor, capacity_enabled, capacity, show_car_number, recheck_enabled')
      .eq('id', trainingId).single();
    setTraining(t as Training);
    const { data, error } = await supabase.from('trainees')
      .select('*').eq('training_id', trainingId).order('registered_at', { ascending: true });
    if (error) toast.error('명단을 불러오지 못했습니다.');
    setTrainees((data || []) as Trainee[]);
    setLoading(false);
  }, [trainingId]);

  useEffect(() => { if (user) fetchAll(); }, [user, fetchAll]);

  // 신청자 = walk_in 제외 (registered/confirmed/waitlisted/cancelled)
  const applicantsAll = useMemo(
    () => trainees.filter((t) => t.status !== 'walk_in'),
    [trainees]
  );
  // 참석자 = 서명 완료 (사전신청+체크인 confirmed + walk_in)
  const attendedAll = useMemo(
    () => trainees.filter((t) => !!t.signature_url && (t.status === 'confirmed' || t.status === 'walk_in')),
    [trainees]
  );

  const counts = useMemo(() => ({
    confirmed: applicantsAll.filter((t) => t.status === 'confirmed').length,
    waitlisted: applicantsAll.filter((t) => t.status === 'waitlisted').length,
    cancelled: applicantsAll.filter((t) => t.status === 'cancelled').length,
  }), [applicantsAll]);

  const walkInCount = useMemo(() => trainees.filter((t) => t.status === 'walk_in').length, [trainees]);

  const baseList: Trainee[] = mainTab === 'applicants'
    ? applicantsAll.filter((t) => t.status === subTab)
    : attendedAll;

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return baseList;
    return baseList.filter((t) =>
      t.name.toLowerCase().includes(s) ||
      t.organization.toLowerCase().includes(s) ||
      (t.email && t.email.toLowerCase().includes(s))
    );
  }, [baseList, search]);

  const promote = async (id: string) => {
    const { data, error } = await supabase.rpc('promote_trainee_from_waitlist', { p_trainee_id: id });
    if (error) { toast.error('승격 실패'); return; }
    const result = data as { status: string };
    if (result?.status === 'full') toast.error('정원이 가득 찼습니다.');
    else { toast.success('확정으로 변경되었습니다.'); fetchAll(); }
  };

  const cancel = async (id: string) => {
    const { error } = await supabase.from('trainees').update({ status: 'cancelled' }).eq('id', id);
    if (error) toast.error('취소 실패');
    else { toast.success('취소되었습니다.'); fetchAll(); }
  };

  const restore = async (id: string) => {
    const { error } = await supabase.from('trainees').update({ status: 'confirmed', confirmed_at: new Date().toISOString() }).eq('id', id);
    if (error) toast.error('복구 실패');
    else { toast.success('확정으로 복구되었습니다.'); fetchAll(); }
  };

  const hardDelete = async (id: string) => {
    const { error } = await supabase.from('trainees').delete().eq('id', id);
    if (error) toast.error('삭제 실패');
    else { toast.success('영구 삭제되었습니다.'); fetchAll(); }
  };

  const handleExport = async (fmt: 'xlsx' | 'pdf') => {
    if (!training || filtered.length === 0) return;
    setExporting(fmt);
    try {
      // Map Trainee → RosterAttendee
      const rows: RosterAttendee[] = filtered.map((t) => ({
        id: t.id,
        org_type: t.org_type,
        organization: t.organization,
        department: t.department,
        position: t.position,
        name: t.name,
        email: t.email,
        phone: null,
        car_number: t.car_number,
        signature_url: t.signature_url,
        status: t.status,
        registered_at: t.registered_at,
        checked_in_at: t.confirmed_at,
      }));
      const opts = { showCarNumber: !!training.show_car_number, kind: '교육' as const };
      if (mainTab === 'applicants') {
        if (fmt === 'xlsx') await exportApplicantsToExcel(training, rows, opts);
        else await exportApplicantsToPDF(training, rows, opts);
      } else {
        if (fmt === 'xlsx') await exportAttendeesRosterToExcel(training, rows, opts);
        else await exportAttendeesRosterToPDF(training, rows, opts);
      }
      toast.success('파일이 다운로드되었습니다.');
    } catch { toast.error('다운로드에 실패했습니다.'); }
    finally { setExporting(null); }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <button onClick={() => navigate(`/admin/trainings/${trainingId}`)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" />교육 상세
      </button>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-foreground">{training?.title} — 명부</h1>
      </div>

      {/* Main tabs */}
      <div className="flex gap-2" role="tablist">
        <button role="tab" aria-selected={mainTab === 'applicants'} onClick={() => setMainTab('applicants')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mainTab === 'applicants' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          }`}>
          <ClipboardList className="w-4 h-4" />신청자 명부 ({applicantsAll.length})
        </button>
        <button role="tab" aria-selected={mainTab === 'attendees'} onClick={() => setMainTab('attendees')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mainTab === 'attendees' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          }`}>
          <CheckCircle2 className="w-4 h-4" />참석자 명부 ({attendedAll.length})
        </button>
        {walkInCount > 0 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-warning/10 text-warning text-xs font-medium">
            <UserPlus className="w-3.5 h-3.5" />현장 등록 {walkInCount}
          </span>
        )}
      </div>

      {/* Sub tabs (only for applicants) */}
      {mainTab === 'applicants' && (
        <div className="flex gap-2" role="tablist">
          {SUB_TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} role="tab" aria-selected={subTab === key} onClick={() => setSubTab(key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                subTab === key ? 'bg-foreground text-background' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}>
              <Icon className="w-3.5 h-3.5" />{label} ({counts[key]})
            </button>
          ))}
        </div>
      )}

      {/* Export */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground mr-1">
          {mainTab === 'applicants' ? '사전 신청자 (서명 미포함)' : '서명 완료 참석자 (사전신청 + 현장등록)'}
        </p>
        <div className="flex-1" />
        <Button size="sm" disabled={!!exporting || filtered.length === 0} onClick={() => handleExport('xlsx')}
          className="bg-emerald-600 hover:bg-emerald-700 text-white">
          {exporting === 'xlsx' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-1" />}엑셀
        </Button>
        <Button size="sm" disabled={!!exporting || filtered.length === 0} onClick={() => handleExport('pdf')}
          className="bg-red-600 hover:bg-red-700 text-white">
          {exporting === 'pdf' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />}PDF
        </Button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="이름, 소속, 이메일 검색" className="pl-9" />
      </div>

      <div className="bg-card rounded-xl shadow-card overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-center py-12 text-sm text-muted-foreground">
            {mainTab === 'applicants' ? '해당하는 신청자가 없습니다.' : '아직 참석 확인된 인원이 없습니다.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs">
                <tr>
                  <th className="text-left px-3 py-2.5 w-10">#</th>
                  {mainTab === 'attendees' && <th className="text-left px-3 py-2.5">경로</th>}
                  <th className="text-left px-3 py-2.5">{mainTab === 'applicants' ? '신청일시' : '참석시각'}</th>
                  <th className="text-left px-3 py-2.5">소속구분</th>
                  <th className="text-left px-3 py-2.5">기관/부서</th>
                  <th className="text-left px-3 py-2.5">직급</th>
                  <th className="text-left px-3 py-2.5">성함</th>
                  {mainTab === 'applicants' && <th className="text-left px-3 py-2.5">이메일</th>}
                  {training?.show_car_number && <th className="text-left px-3 py-2.5">차량</th>}
                  {mainTab === 'attendees' && <th className="text-left px-3 py-2.5">서명</th>}
                  {mainTab === 'attendees' && training?.recheck_enabled && <th className="text-left px-3 py-2.5">재확인</th>}
                  <th className="text-right px-3 py-2.5">관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => (
                  <tr key={t.id} className="border-t border-border/40">
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{i + 1}</td>
                    {mainTab === 'attendees' && (
                      <td className="px-3 py-2.5">
                        {t.status === 'walk_in'
                          ? <span className="text-[10px] bg-warning/10 text-warning px-1.5 py-0.5 rounded">현장</span>
                          : <span className="text-[10px] bg-success/10 text-success px-1.5 py-0.5 rounded">사전</span>}
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap text-xs">
                      {(mainTab === 'applicants' ? t.registered_at : (t.confirmed_at || t.registered_at))
                        ? new Date((mainTab === 'applicants' ? t.registered_at : (t.confirmed_at || t.registered_at))!).toLocaleString('ko-KR')
                        : '-'}
                    </td>
                    <td className="px-3 py-2.5">{t.org_type || '-'}</td>
                    <td className="px-3 py-2.5">{t.organization}{t.department ? ` / ${t.department}` : ''}</td>
                    <td className="px-3 py-2.5">{t.position || '-'}</td>
                    <td className="px-3 py-2.5 font-medium">{t.name}</td>
                    {mainTab === 'applicants' && <td className="px-3 py-2.5 text-xs text-muted-foreground">{t.email || '-'}</td>}
                    {training?.show_car_number && <td className="px-3 py-2.5">{t.car_number || '-'}</td>}
                    {mainTab === 'attendees' && (
                      <td className="px-3 py-2.5">
                        {t.signature_url
                          ? <img src={t.signature_url} alt="서명" className="h-7 w-auto border border-border/50 rounded bg-white p-0.5" />
                          : <span className="text-muted-foreground text-xs">-</span>}
                      </td>
                    )}
                    {mainTab === 'attendees' && training?.recheck_enabled && (
                      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {t.rechecked_at
                          ? new Date(t.rechecked_at).toLocaleString('ko-KR')
                          : <span className="text-muted-foreground/60">미재확인</span>}
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {mainTab === 'applicants' && subTab === 'waitlisted' && (
                        <Button size="sm" variant="ghost" className="h-7" onClick={() => promote(t.id)}>확정</Button>
                      )}
                      {mainTab === 'applicants' && subTab !== 'cancelled' && (
                        <Button size="sm" variant="ghost" className="h-7 text-destructive hover:text-destructive" onClick={() => cancel(t.id)}>취소</Button>
                      )}
                      {mainTab === 'applicants' && subTab === 'cancelled' && (
                        <Button size="sm" variant="ghost" className="h-7" onClick={() => restore(t.id)}>복구</Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-7 text-destructive hover:text-destructive">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>이 신청자를 영구 삭제할까요?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t.name}님의 신청 정보가 완전히 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>취소</AlertDialogCancel>
                            <AlertDialogAction onClick={() => hardDelete(t.id)} className="bg-destructive text-destructive-foreground">삭제</AlertDialogAction>
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
    </div>
  );
};

export default AdminTrainingTrainees;