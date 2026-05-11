import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Mail, Loader2, CheckCircle2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useKioskIdleLogout } from '@/hooks/useKioskIdleLogout';

interface TrainingData { id: string; title: string; }
interface Counts { registered: number; confirmed: number; walk_in: number; waitlisted: number; }

const AdminTrainingCheckin = () => {
  useKioskIdleLogout();
  const { trainingId } = useParams<{ trainingId: string }>();
  const [training, setTraining] = useState<TrainingData | null>(null);
  const [counts, setCounts] = useState<Counts>({ registered: 0, confirmed: 0, walk_in: 0, waitlisted: 0 });
  const [email, setEmail] = useState('');
  const [matched, setMatched] = useState<{ name: string; organization: string; status: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const sigCanvas = useRef<SignatureCanvas>(null);
  const sigContainerRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const resizeCanvas = useCallback(() => {
    if (sigCanvas.current && sigContainerRef.current) {
      const c = sigCanvas.current.getCanvas();
      const ratio = window.devicePixelRatio || 1;
      c.width = sigContainerRef.current.offsetWidth * ratio;
      c.height = 200 * ratio;
      c.style.width = `${sigContainerRef.current.offsetWidth}px`;
      c.style.height = '200px';
      c.getContext('2d')?.scale(ratio, ratio);
      sigCanvas.current.clear();
    }
  }, []);

  const refreshCounts = useCallback(async () => {
    if (!trainingId) return;
    const [r, c, w, wl] = await Promise.all([
      supabase.from('trainees').select('*', { count: 'exact', head: true }).eq('training_id', trainingId).eq('status', 'registered'),
      supabase.from('trainees').select('*', { count: 'exact', head: true }).eq('training_id', trainingId).eq('status', 'confirmed'),
      supabase.from('trainees').select('*', { count: 'exact', head: true }).eq('training_id', trainingId).eq('status', 'walk_in'),
      supabase.from('trainees').select('*', { count: 'exact', head: true }).eq('training_id', trainingId).eq('status', 'waitlisted'),
    ]);
    setCounts({ registered: r.count ?? 0, confirmed: c.count ?? 0, walk_in: w.count ?? 0, waitlisted: wl.count ?? 0 });
  }, [trainingId]);

  useEffect(() => {
    (async () => {
      if (!trainingId) return;
      const { data } = await supabase.from('trainings').select('id,title').eq('id', trainingId).single();
      if (data) setTraining(data);
      refreshCounts();
    })();
  }, [trainingId, refreshCounts]);

  useEffect(() => {
    if (matched) setTimeout(resizeCanvas, 100);
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [matched, resizeCanvas]);

  const handleLookup = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!training || !email.trim()) return;
    const q = email.trim();
    setSubmitting(true);
    try {
      const { data: lookup } = await supabase.rpc('lookup_trainee', {
        p_training_id: training.id, p_query: q,
      });
      const r = lookup as any;
      if (r?.status === 'not_found') { toast.warning('사전 신청 내역이 없습니다.'); return; }
      if (r?.status === 'multiple') { toast.warning('같은 이메일로 신청한 내역이 여러 건입니다. 담당자에게 문의해주세요.'); return; }
      const data = r.trainee as { name: string; organization: string; status: string };
      if (data.status === 'confirmed' || data.status === 'walk_in') {
        toast.info(`${data.name}님은 이미 체크인 완료되었습니다.`);
        setEmail(''); emailRef.current?.focus(); return;
      }
      setMatched({ name: data.name, organization: data.organization, status: data.status });
    } catch (err) { console.error(err); toast.error('조회 중 오류'); }
    finally { setSubmitting(false); }
  };

  const handleConfirm = async () => {
    if (!training || !sigCanvas.current || sigCanvas.current.isEmpty()) {
      toast.error('서명을 받아주세요.'); return;
    }
    setSubmitting(true);
    try {
      const sig = sigCanvas.current.toDataURL('image/png');
      const { data, error } = await supabase.rpc('checkin_trainee', {
        p_training_id: training.id, p_email: email.trim(), p_signature_url: sig,
      });
      if (error) throw error;
      const r = data as any;
      toast.success(`${r.trainee?.name || matched?.name} 체크인 완료${r.was_waitlisted ? ' (대기→확정)' : ''}`);
      setMatched(null); setEmail('');
      emailRef.current?.focus();
      refreshCounts();
    } catch (err) { console.error(err); toast.error('체크인 중 오류'); }
    finally { setSubmitting(false); }
  };

  const cancel = () => { setMatched(null); setEmail(''); emailRef.current?.focus(); };

  return (
    <div className="min-h-svh bg-background" translate="no">
      <div className="bg-card border-b px-4 py-3 flex items-center gap-3">
        <Link to={`/admin/trainings/${trainingId}`}><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
        <div className="flex-1">
          <h1 className="text-base font-bold text-foreground truncate">{training?.title}</h1>
          <p className="text-xs text-muted-foreground">키오스크 모드 · 연속 체크인</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 p-4 bg-muted/30">
        <div className="bg-card rounded-lg p-3 text-center">
          <p className="text-xs text-muted-foreground">대기 중</p>
          <p className="text-xl font-bold text-warning">{counts.registered}</p>
        </div>
        <div className="bg-card rounded-lg p-3 text-center">
          <p className="text-xs text-muted-foreground">확정</p>
          <p className="text-xl font-bold text-success">{counts.confirmed}</p>
        </div>
        <div className="bg-card rounded-lg p-3 text-center">
          <p className="text-xs text-muted-foreground">현장</p>
          <p className="text-xl font-bold text-primary">{counts.walk_in}</p>
        </div>
        <div className="bg-card rounded-lg p-3 text-center">
          <p className="text-xs text-muted-foreground">대기자</p>
          <p className="text-xl font-bold text-muted-foreground">{counts.waitlisted}</p>
        </div>
      </div>

      <div className="p-4 max-w-xl mx-auto">
        {!matched ? (
          <form onSubmit={handleLookup} className="space-y-4">
            <div className="bg-card rounded-xl shadow-card p-5 space-y-4">
              <label className="text-base font-semibold text-foreground flex items-center gap-1.5">
                <Mail className="w-5 h-5 text-primary" />사전 신청 이메일
              </label>
              <Input ref={emailRef} type="email" inputMode="email" autoFocus
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="사전 신청 시 입력한 이메일"
                className="h-16 text-lg bg-secondary/50 border-border/60" />
              <Button type="submit" disabled={submitting || !email.trim()} className="w-full h-14 text-base font-semibold rounded-xl">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : '확인'}
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              ※ 미신청자는 본인 휴대폰으로 현장 등록 페이지를 이용해주세요.
            </p>
          </form>
        ) : (
          <div className="space-y-4">
            <div className={`border rounded-xl p-5 text-center animate-fade-in ${matched.status === 'waitlisted' ? 'bg-warning/10 border-warning/30' : 'bg-success/10 border-success/30'}`}>
              <p className="text-sm text-muted-foreground">{matched.status === 'waitlisted' ? '대기자 → 확정 처리' : '사전 신청 확인'}</p>
              <p className="text-2xl font-bold text-foreground mt-1">{matched.name}</p>
              <p className="text-sm text-muted-foreground">{matched.organization}</p>
            </div>
            <div className="bg-card rounded-xl shadow-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-foreground">서명</label>
                <button type="button" onClick={() => sigCanvas.current?.clear()}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <RotateCcw className="w-3 h-3" />다시 쓰기
                </button>
              </div>
              <div ref={sigContainerRef} className="border-2 border-dashed border-border rounded-xl bg-white overflow-hidden relative">
                <SignatureCanvas ref={sigCanvas}
                  canvasProps={{ className: 'w-full cursor-crosshair touch-none', style: { width:'100%', height:'200px' } }}
                  backgroundColor="rgba(255,255,255,0)" />
                <span className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground/40 pointer-events-none select-none">서명해주세요</span>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={cancel} className="h-14 rounded-xl">취소</Button>
              <Button onClick={handleConfirm} disabled={submitting} className="flex-1 h-14 text-base rounded-xl font-semibold">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-5 h-5 mr-2" />체크인 완료</>}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminTrainingCheckin;
