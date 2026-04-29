import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft, Loader2, Download, Search, CheckCircle2, XCircle, Clock,
  FileSpreadsheet, FileText, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  exportTraineesToExcel, exportTraineesToPDF, type TraineeRow,
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
  car_number: string | null;
  inquiry: string | null;
  signature_url: string;
  status: string;
  registered_at: string;
  confirmed_at: string | null;
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
}

const TABS = [
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
  const [tab, setTab] = useState<typeof TABS[number]['key']>('confirmed');
  const [search, setSearch] = useState('');

  const fetchAll = useCallback(async () => {
    if (!trainingId) return;
    const { data: t } = await supabase.from('trainings')
      .select('id, title, event_date, start_time, end_time, location, organizer, instructor, capacity_enabled, capacity, show_car_number')
      .eq('id', trainingId).single();
    setTraining(t as Training);
    const { data, error } = await supabase.from('trainees')
      .select('*').eq('training_id', trainingId).order('registered_at', { ascending: true });
    if (error) toast.error('명단을 불러오지 못했습니다.');
    setTrainees((data || []) as Trainee[]);
    setLoading(false);
  }, [trainingId]);

  useEffect(() => { if (user) fetchAll(); }, [user, fetchAll]);

  const counts = useMemo(() => ({
    confirmed: trainees.filter((t) => t.status === 'confirmed').length,
    waitlisted: trainees.filter((t) => t.status === 'waitlisted').length,
    cancelled: trainees.filter((t) => t.status === 'cancelled').length,
  }), [trainees]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return trainees.filter((t) => t.status === tab)
      .filter((t) => !s || t.name.toLowerCase().includes(s) || t.organization.toLowerCase().includes(s));
  }, [trainees, tab, search]);

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

  const exportExcel = async () => {
    if (!training) return;
    try {
      await exportTraineesToExcel(training, filtered as TraineeRow[], { showCarNumber: training.show_car_number });
      toast.success('엑셀 파일이 다운로드되었습니다.');
    } catch { toast.error('엑셀 다운로드에 실패했습니다.'); }
  };

  const exportPDF = async () => {
    if (!training) return;
    try {
      await exportTraineesToPDF(training, filtered as TraineeRow[], { showCarNumber: training.show_car_number });
      toast.success('PDF 파일이 다운로드되었습니다.');
    } catch { toast.error('PDF 다운로드에 실패했습니다.'); }
  };

  const exportCsv = () => {
    const headers = ['상태', '신청일시', '소속구분', '기관명', '부서', '직급', '성함'];
    if (training?.show_car_number) headers.push('차량번호');
    headers.push('문의사항');
    const statusLabel = (s: string) => s === 'confirmed' ? '확정' : s === 'waitlisted' ? '대기' : '취소';
    const rows = filtered.map((t) => {
      const r = [
        statusLabel(t.status),
        new Date(t.registered_at).toLocaleString('ko-KR'),
        t.org_type ?? '',
        t.organization,
        t.department ?? '',
        t.position ?? '',
        t.name,
      ];
      if (training?.show_car_number) r.push(t.car_number ?? '');
      r.push(t.inquiry ?? '');
      return r;
    });
    const csv = '\uFEFF' + [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${training?.title ?? 'training'}_${tab}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
        <h1 className="text-xl font-bold text-foreground">{training?.title} — 신청자</h1>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={filtered.length === 0} onClick={exportExcel}>
            <FileSpreadsheet className="w-4 h-4 mr-1" />엑셀
          </Button>
          <Button size="sm" variant="outline" disabled={filtered.length === 0} onClick={exportPDF}>
            <FileText className="w-4 h-4 mr-1" />PDF
          </Button>
          <Button size="sm" variant="outline" disabled={filtered.length === 0} onClick={exportCsv}>
            <Download className="w-4 h-4 mr-1" />CSV
          </Button>
        </div>
      </div>

      <div className="flex gap-2" role="tablist">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}>
            <Icon className="w-4 h-4" />{label} ({counts[key]})
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="이름, 소속 검색" className="pl-9" />
      </div>

      <div className="bg-card rounded-xl shadow-card overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-center py-12 text-sm text-muted-foreground">해당하는 신청자가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs">
                <tr>
                  {tab === 'waitlisted' && <th className="text-left px-3 py-2.5 w-10">#</th>}
                  <th className="text-left px-3 py-2.5">신청일시</th>
                  <th className="text-left px-3 py-2.5">소속구분</th>
                  <th className="text-left px-3 py-2.5">기관/부서</th>
                  <th className="text-left px-3 py-2.5">직급</th>
                  <th className="text-left px-3 py-2.5">성함</th>
                  {training?.show_car_number && <th className="text-left px-3 py-2.5">차량</th>}
                  <th className="text-right px-3 py-2.5">관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => (
                  <tr key={t.id} className="border-t border-border/40">
                    {tab === 'waitlisted' && <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{i + 1}</td>}
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{new Date(t.registered_at).toLocaleString('ko-KR')}</td>
                    <td className="px-3 py-2.5">{t.org_type || '-'}</td>
                    <td className="px-3 py-2.5">{t.organization}{t.department ? ` / ${t.department}` : ''}</td>
                    <td className="px-3 py-2.5">{t.position || '-'}</td>
                    <td className="px-3 py-2.5 font-medium">{t.name}</td>
                    {training?.show_car_number && <td className="px-3 py-2.5">{t.car_number || '-'}</td>}
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {tab === 'waitlisted' && (
                        <Button size="sm" variant="ghost" className="h-7" onClick={() => promote(t.id)}>확정</Button>
                      )}
                      {tab !== 'cancelled' ? (
                        <Button size="sm" variant="ghost" className="h-7 text-destructive hover:text-destructive" onClick={() => cancel(t.id)}>취소</Button>
                      ) : (
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