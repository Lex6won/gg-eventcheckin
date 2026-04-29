import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, Calendar, Clock, MapPin, User, Hash, Users, ClipboardCopy, QrCode, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getPublicOrigin } from '@/lib/getPublicUrl';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

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
}

const STATUSES = ['예정', '진행중', '완료'] as const;

const AdminTrainingDetail = () => {
  const { trainingId } = useParams<{ trainingId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [training, setTraining] = useState<Training | null>(null);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [waitlistedCount, setWaitlistedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editingCapacity, setEditingCapacity] = useState(false);
  const [capacityInput, setCapacityInput] = useState('');

  const fetchData = useCallback(async () => {
    if (!trainingId) return;
    const { data, error } = await supabase.from('trainings').select('*').eq('id', trainingId).single();
    if (error || !data) { navigate('/admin/trainings'); return; }
    setTraining(data);
    setCapacityInput(String(data.capacity ?? ''));
    const [{ count: c }, { count: w }] = await Promise.all([
      supabase.from('trainees').select('*', { count: 'exact', head: true }).eq('training_id', trainingId).eq('status', 'confirmed'),
      supabase.from('trainees').select('*', { count: 'exact', head: true }).eq('training_id', trainingId).eq('status', 'waitlisted'),
    ]);
    setConfirmedCount(c ?? 0);
    setWaitlistedCount(w ?? 0);
    setLoading(false);
  }, [trainingId, navigate]);

  useEffect(() => { if (user) fetchData(); }, [user, fetchData]);

  const updateStatus = async (status: string) => {
    const { error } = await supabase.from('trainings').update({ status }).eq('id', trainingId!);
    if (error) toast.error('상태 변경 실패');
    else { toast.success('상태가 변경되었습니다.'); fetchData(); }
  };

  const toggleCarNumber = async (val: boolean) => {
    const { error } = await supabase.from('trainings').update({ show_car_number: val }).eq('id', trainingId!);
    if (error) toast.error('변경 실패');
    else fetchData();
  };

  const updateCapacity = async () => {
    const n = parseInt(capacityInput, 10);
    if (!Number.isFinite(n) || n < 1) { toast.error('정원 수를 확인해주세요.'); return; }
    const { error } = await supabase.from('trainings').update({ capacity: n }).eq('id', trainingId!);
    if (error) toast.error('정원 변경 실패');
    else { toast.success('정원이 변경되었습니다.'); setEditingCapacity(false); fetchData(); }
  };

  const handleDelete = async () => {
    const { error } = await supabase.from('trainings').delete().eq('id', trainingId!);
    if (error) toast.error('삭제 실패');
    else { toast.success('교육이 삭제되었습니다.'); navigate('/admin/trainings'); }
  };

  const copyLink = () => {
    const url = `${getPublicOrigin()}/training/${training?.access_code}`;
    navigator.clipboard.writeText(url);
    toast.success('링크가 복사되었습니다.');
  };

  if (loading || !training) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const cap = training.capacity ?? 0;
  const pct = training.capacity_enabled && cap > 0 ? Math.min(100, Math.round((confirmedCount / cap) * 100)) : 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <button onClick={() => navigate('/admin/trainings')}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" />교육 목록
      </button>

      <div className="bg-card rounded-xl shadow-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">{training.title}</h1>
            {training.description && <p className="text-sm text-muted-foreground mt-1">{training.description}</p>}
          </div>
          <select value={training.status || '예정'} onChange={(e) => updateStatus(e.target.value)}
            className="text-sm border border-border rounded-lg px-2.5 py-1.5 bg-background">
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><Calendar className="w-4 h-4" />{training.event_date}</span>
          <span className="inline-flex items-center gap-1.5"><Clock className="w-4 h-4" />{training.start_time?.slice(0,5)} ~ {training.end_time?.slice(0,5)}</span>
          <span className="inline-flex items-center gap-1.5"><MapPin className="w-4 h-4" />{training.location}</span>
          <span className="inline-flex items-center gap-1.5"><User className="w-4 h-4" />{training.organizer}{training.instructor ? ` · 강사: ${training.instructor}` : ''}</span>
          <span className="inline-flex items-center gap-1.5 font-mono"><Hash className="w-4 h-4" />{training.access_code}</span>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={copyLink}><ClipboardCopy className="w-4 h-4 mr-1" />링크 복사</Button>
          <Button size="sm" variant="outline" onClick={() => navigate(`/admin/trainings/${trainingId}/qr`)}><QrCode className="w-4 h-4 mr-1" />QR 코드</Button>
          <Button size="sm" onClick={() => navigate(`/admin/trainings/${trainingId}/trainees`)}><Users className="w-4 h-4 mr-1" />신청자 명단</Button>
        </div>
      </div>

      {/* Capacity progress */}
      <div className="bg-card rounded-xl shadow-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">신청 현황</h2>
          {training.capacity_enabled && (
            editingCapacity ? (
              <div className="flex items-center gap-2">
                <Input type="number" min={1} value={capacityInput}
                  onChange={(e) => setCapacityInput(e.target.value)} className="h-8 w-24" />
                <Button size="sm" onClick={updateCapacity}>저장</Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditingCapacity(false); setCapacityInput(String(training.capacity ?? '')); }}>취소</Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setEditingCapacity(true)}>정원 수정</Button>
            )
          )}
        </div>
        {training.capacity_enabled ? (
          <>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-foreground font-medium">확정 {confirmedCount} / 정원 {cap}명</span>
              <span className="text-muted-foreground">대기 {waitlistedCount}명</span>
            </div>
            <div className="h-3 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">정원 제한 없음 — 신청 {confirmedCount}명</p>
        )}
      </div>

      {/* Settings */}
      <div className="bg-card rounded-xl shadow-card p-5 space-y-3">
        <h2 className="text-sm font-bold text-foreground">설정</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">차량번호 입력</p>
            <p className="text-xs text-muted-foreground">신청자에게 차량번호를 입력받습니다</p>
          </div>
          <Switch checked={training.show_car_number} onCheckedChange={toggleCarNumber} />
        </div>
      </div>

      <div className="flex justify-end">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
              <Trash2 className="w-4 h-4 mr-1" />교육 삭제
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
  );
};

export default AdminTrainingDetail;