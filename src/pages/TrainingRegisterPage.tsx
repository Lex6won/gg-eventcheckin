import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CheckCircle2, Calendar, MapPin, Clock, Loader2, Building2,
  RotateCcw, AlertCircle, XCircle, User, RefreshCw, Mail, UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';

interface TrainingData {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string;
  end_time: string;
  location: string;
  organizer: string;
  instructor: string | null;
  status: string | null;
  poster_url: string | null;
  show_car_number: boolean;
  capacity_enabled: boolean;
  capacity: number | null;
  allow_waitlist: boolean;
  recheck_enabled: boolean;
}

const ORG_TYPES = ['경기도', '시군', '공공기관', '기타'] as const;
type Phase = 'open' | 'in_progress' | 'pre_reg_closed' | 'closed' | 'not_found';
type Screen =
  | 'loading' | 'notfound' | 'closed_no_action'
  | 'load_error'
  | 'pre_reg_link' | 'already_registered'
  | 'choose_type' | 'email_lookup' | 'sign' | 'walkin'
  | 'success_checkin' | 'success_recheck' | 'already_checked_in' | 'already_rechecked';

const TOKEN_KEY = (id: string) => `device_token:training:${id}`;

const getStoredToken = (id: string) => {
  try { return localStorage.getItem(TOKEN_KEY(id)); }
  catch { return null; }
};

const setStoredToken = (id: string, token: string) => {
  try { localStorage.setItem(TOKEN_KEY(id), token); }
  catch { /* Some browsers block localStorage; the flow should still continue. */ }
};

const removeStoredToken = (id: string) => {
  try { localStorage.removeItem(TOKEN_KEY(id)); }
  catch { /* Ignore storage failures. */ }
};

const TrainingRegisterPage = () => {
  const { accessCode } = useParams<{ accessCode: string }>();
  const [searchParams] = useSearchParams();
  const code = accessCode || searchParams.get('code') || '';

  const sigCanvas = useRef<SignatureCanvas>(null);
  const sigContainerRef = useRef<HTMLDivElement>(null);
  const lastCanvasWidthRef = useRef(0);

  const [training, setTraining] = useState<TrainingData | null>(null);
  const [phase, setPhase] = useState<Phase>('open');
  const [screen, setScreen] = useState<Screen>('loading');
  const [participantInfo, setParticipantInfo] = useState<{ name: string; organization: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lookupEmail, setLookupEmail] = useState('');
  const [form, setForm] = useState({
    email: '', org_type: '', organization: '', department: '', position: '',
    name: '', car_number: '', privacy_agreed: false,
  });

  const resizeCanvas = useCallback((force = false) => {
    if (!sigCanvas.current || !sigContainerRef.current) return;
    const w = sigContainerRef.current.offsetWidth;
    if (w <= 0) return;
    if (!force && w === lastCanvasWidthRef.current) return;
    const canvas = sigCanvas.current.getCanvas();
    const ratio = window.devicePixelRatio || 1;
    const had = !sigCanvas.current.isEmpty();
    const prev = had ? sigCanvas.current.toDataURL('image/png') : null;
    canvas.width = w * ratio;
    canvas.height = 200 * ratio;
    canvas.style.width = `${w}px`;
    canvas.style.height = '200px';
    canvas.getContext('2d')?.scale(ratio, ratio);
    sigCanvas.current.clear();
    if (prev) sigCanvas.current.fromDataURL(prev, { width: w, height: 200 });
    lastCanvasWidthRef.current = w;
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        if (!code) { setScreen('notfound'); return; }
        const { data: phaseData, error: phaseError } = await supabase.rpc('get_event_public_status', { p_code: code });
        if (phaseError) throw phaseError;
        const p = (phaseData as { phase?: string })?.phase as Phase | undefined;
        if (!p || p === 'not_found') { setScreen('notfound'); return; }
        setPhase(p);

        const { data: tRaw, error: trainingError } = await supabase.rpc('get_training_by_access_code', { p_code: code });
        if (trainingError) throw trainingError;
        if (!tRaw) { setScreen('notfound'); return; }
        const t = tRaw as unknown as TrainingData;
        setTraining(t);

        const token = getStoredToken(t.id);
        if (token) {
          const { data: lookup } = await supabase.rpc('lookup_by_device_token', {
            p_kind: 'training', p_id: t.id, p_device_token: token,
          });
          const r = lookup as { status?: string; name?: string; organization?: string; record_status?: string; rechecked_at?: string | null };
          if (r?.status === 'found') {
            setParticipantInfo({ name: r.name || '', organization: r.organization || '' });
            if (r.record_status === 'registered') {
              if (p === 'in_progress') return setScreen('sign');
              if (p === 'open') return setScreen('already_registered');
              return setScreen('closed_no_action');
            }
            if (r.record_status === 'waitlisted') return setScreen('already_registered');
            if (r.rechecked_at) return setScreen('already_rechecked');
            if (t.recheck_enabled && (p === 'in_progress' || p === 'closed')) {
              try {
                const { data: rd, error } = await supabase.rpc('device_recheck_trainee', {
                  p_training_id: t.id, p_device_token: token,
                });
                if (error) throw error;
                const rr = rd as { status: string; trainee?: { name: string; organization: string } };
                if (rr.status === 'rechecked') { if (rr.trainee) setParticipantInfo(rr.trainee); return setScreen('success_recheck'); }
                if (rr.status === 'already') return setScreen('already_rechecked');
              } catch {
                return setScreen('already_checked_in');
              }
            }
            return setScreen('already_checked_in');
          }
        }
        if (p === 'open') return setScreen('pre_reg_link');
        if (p === 'pre_reg_closed' || p === 'in_progress') return setScreen('choose_type');
        return setScreen('closed_no_action');
      } catch (err) {
        console.error('Training page failed to initialize', err);
        setScreen('load_error');
      }
    };
    init();
  }, [code]);

  useEffect(() => {
    if (screen !== 'sign' && screen !== 'walkin') return;
    lastCanvasWidthRef.current = 0;
    const t = setTimeout(() => resizeCanvas(true), 100);
    const onResize = () => resizeCanvas(false);
    window.addEventListener('resize', onResize);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && sigContainerRef.current) {
      ro = new ResizeObserver(() => resizeCanvas(false));
      ro.observe(sigContainerRef.current);
    }
    return () => { clearTimeout(t); window.removeEventListener('resize', onResize); ro?.disconnect(); };
  }, [screen, resizeCanvas]);

  const handleCheckinWithToken = async () => {
    if (!training) return;
    if (!sigCanvas.current || sigCanvas.current.isEmpty()) { setErrors({ signature: '서명을 해주세요.' }); return; }
    const token = getStoredToken(training.id);
    if (!token) { setScreen('choose_type'); return; }
    setSubmitting(true);
    try {
      const sig = sigCanvas.current.toDataURL('image/png');
      const { data, error } = await supabase.rpc('device_checkin_trainee', {
        p_training_id: training.id, p_device_token: token, p_signature_url: sig,
      });
      if (error) throw error;
      const r = data as { status: string; trainee?: { name: string; organization: string } };
      if (r.status === 'not_found') { removeStoredToken(training.id); setScreen('choose_type'); return; }
      if (r.trainee) setParticipantInfo(r.trainee);
      if (r.status === 'already') setScreen('already_checked_in'); else setScreen('success_checkin');
    } catch (err) {
      console.error(err); toast.error('참석 확인 중 오류가 발생했습니다.');
    } finally { setSubmitting(false); }
  };

  const updateField = (k: string, v: string | boolean) => {
    setForm({ ...form, [k]: v });
    if (errors[k]) setErrors({ ...errors, [k]: '' });
  };

  const handleClaimByEmail = async () => {
    if (!training) return;
    const email = lookupEmail.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrors({ lookup_email: '올바른 이메일을 입력해주세요.' });
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('claim_pre_registration_by_email', {
        p_kind: 'training', p_id: training.id, p_email: email,
      });
      if (error) throw error;
      const r = data as { status: string; device_token?: string; name?: string; organization?: string };
      if (r.status === 'found' && r.device_token) {
        setStoredToken(training.id, r.device_token);
        setParticipantInfo({ name: r.name || '', organization: r.organization || '' });
        setErrors({});
        setScreen('sign');
        return;
      }
      if (r.status === 'already') {
        setParticipantInfo({ name: r.name || '', organization: r.organization || '' });
        setScreen('already_checked_in');
        return;
      }
      if (r.status === 'not_found') {
        setErrors({ lookup_email: '사전 신청 내역을 찾을 수 없습니다. 이메일을 확인하거나 현장 등록을 진행해주세요.' });
        return;
      }
      setErrors({ lookup_email: '확인할 수 없습니다.' });
    } catch (err) {
      console.error(err);
      toast.error('확인 중 오류가 발생했습니다.');
    } finally { setSubmitting(false); }
  };

  const validateWalkin = () => {
    const e: Record<string, string> = {};
    if (!form.email.trim()) e.email = '이메일을 입력해주세요.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = '올바른 이메일 형식이 아닙니다.';
    if (!form.org_type) e.org_type = '소속 구분을 선택해주세요.';
    if (!form.organization.trim()) e.organization = '기관명을 입력해주세요.';
    if (!form.department.trim()) e.department = '부서명을 입력해주세요.';
    if (!form.position.trim()) e.position = '직급(위)을 입력해주세요.';
    if (!form.name.trim()) e.name = '성함을 입력해주세요.';
    if (!form.privacy_agreed) e.privacy_agreed = '개인정보 수집 및 이용에 동의해주세요.';
    if (!sigCanvas.current || sigCanvas.current.isEmpty()) e.signature = '서명을 해주세요.';
    setErrors(e); return Object.keys(e).length === 0;
  };

  const handleWalkin = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!training) return;
    if (!validateWalkin()) { toast.error('필수 항목을 확인해주세요.'); return; }
    setSubmitting(true);
    try {
      const sig = sigCanvas.current!.toDataURL('image/png');
      const { data, error } = await supabase.rpc('walk_in_trainee_self', {
        p_training_id: training.id,
        p_email: form.email.trim(),
        p_org_type: form.org_type,
        p_organization: form.organization.trim(),
        p_department: form.department.trim(),
        p_position: form.position.trim(),
        p_name: form.name.trim(),
        p_car_number: form.car_number.trim(),
        p_inquiry: '',
        p_signature_url: sig,
        p_privacy_agreed: form.privacy_agreed,
      });
      if (error) throw error;
      const r = data as { status: string; device_token?: string; trainee?: { name: string; organization: string } };
      if (r.device_token) setStoredToken(training.id, r.device_token);
      const info = r.trainee || { name: form.name.trim(), organization: form.organization.trim() };
      setParticipantInfo(info);
      if (r.status === 'already') setScreen('already_checked_in'); else setScreen('success_checkin');
    } catch (err) {
      console.error(err); toast.error('참석 확인 중 오류가 발생했습니다.');
    } finally { setSubmitting(false); }
  };

  if (screen === 'loading') return <div className="min-h-svh bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  if (screen === 'notfound') return (
    <div className="min-h-svh bg-background flex items-center justify-center p-4"><div className="text-center space-y-4 animate-fade-in">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-destructive/10"><XCircle className="w-10 h-10 text-destructive" /></div>
      <h2 className="text-xl font-bold text-foreground">교육 정보를 찾을 수 없습니다</h2>
      <p className="text-muted-foreground text-sm">QR 또는 접속코드를 다시 확인해주세요.</p>
    </div></div>
  );

  if (screen === 'closed_no_action') return (
    <div className="min-h-svh bg-background flex items-center justify-center p-4"><div className="text-center space-y-4 animate-fade-in">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-warning/10"><AlertCircle className="w-10 h-10 text-warning" /></div>
      <h2 className="text-xl font-bold text-foreground">교육이 종료되었습니다</h2>
      <p className="text-muted-foreground text-sm">{training?.title}은(는) 종료되었습니다.</p>
    </div></div>
  );

  if (screen === 'pre_reg_link') return (
    <div className="min-h-svh bg-background flex items-center justify-center p-4"><div className="text-center space-y-4 animate-fade-in max-w-md">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10"><Calendar className="w-10 h-10 text-primary" /></div>
      <h2 className="text-xl font-bold text-foreground">사전 신청 기간입니다</h2>
      <p className="text-muted-foreground text-sm">교육 당일이 되면 이 페이지에서 바로 참석 확인이 가능합니다.</p>
      <Link to={`/register/${code}`}><Button className="px-8 h-12 text-base rounded-xl">사전 신청하기</Button></Link>
    </div></div>
  );

  if (screen === 'already_registered' && participantInfo) return (
    <div className="min-h-svh bg-background flex items-center justify-center p-4"><div className="text-center space-y-4 animate-fade-in max-w-md">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-success/10"><CheckCircle2 className="w-10 h-10 text-success" /></div>
      <h2 className="text-xl font-bold text-foreground">사전 신청 완료</h2>
      <p className="text-muted-foreground text-sm"><strong className="text-foreground">{participantInfo.name}</strong>님,<br />교육 당일 이 페이지에서 서명만 하시면 참석 확인이 완료됩니다.</p>
    </div></div>
  );

  if (screen === 'already_checked_in' && participantInfo) return (
    <div className="min-h-svh bg-background flex items-center justify-center p-4"><div className="text-center space-y-4 animate-fade-in">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-success/10"><CheckCircle2 className="w-10 h-10 text-success" /></div>
      <h2 className="text-xl font-bold text-foreground">이미 참석 확인 완료</h2>
      <p className="text-muted-foreground text-sm"><strong className="text-foreground">{participantInfo.name}</strong>님의 참석이 확인되었습니다.</p>
      {training?.recheck_enabled && <p className="text-xs text-muted-foreground">교육 종료 무렵 이 페이지에서 한 번 더 QR을 찍어 재확인해주세요.</p>}
    </div></div>
  );

  if (screen === 'already_rechecked' && participantInfo) return (
    <div className="min-h-svh bg-background flex items-center justify-center p-4"><div className="text-center space-y-4 animate-fade-in">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-success/10"><CheckCircle2 className="w-10 h-10 text-success" /></div>
      <h2 className="text-xl font-bold text-foreground">모든 절차 완료 ✓</h2>
      <p className="text-muted-foreground text-sm"><strong className="text-foreground">{participantInfo.name}</strong>님,<br />참석 및 재확인이 모두 완료되었습니다.</p>
    </div></div>
  );

  if (screen === 'success_checkin' && participantInfo) return (
    <div className="min-h-svh bg-background flex items-center justify-center p-4"><div className="text-center space-y-4 animate-fade-in max-w-md">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-success/10 animate-check-bounce"><CheckCircle2 className="w-10 h-10 text-success" /></div>
      <h2 className="text-xl font-bold text-foreground">참석 확인 완료 ✓</h2>
      <p className="text-muted-foreground text-sm"><strong className="text-foreground">{participantInfo.name}</strong>님,<br />참석이 정상적으로 확인되었습니다.</p>
      {training?.recheck_enabled && <p className="text-xs text-muted-foreground">교육 종료 무렵 이 페이지를 한 번 더 열어주세요. QR만 찍으면 자동 재확인됩니다.</p>}
    </div></div>
  );

  if (screen === 'success_recheck' && participantInfo) return (
    <div className="min-h-svh bg-background flex items-center justify-center p-4"><div className="text-center space-y-4 animate-fade-in max-w-md">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-success/10 animate-check-bounce"><RefreshCw className="w-10 h-10 text-success" /></div>
      <h2 className="text-xl font-bold text-foreground">참석 재확인 완료 ✓</h2>
      <p className="text-muted-foreground text-sm"><strong className="text-foreground">{participantInfo.name}</strong>님,<br />참석 재확인이 완료되었습니다. 수고하셨습니다.</p>
    </div></div>
  );

  if (screen === 'sign' && training && participantInfo) return (
    <div className="min-h-svh bg-muted/30 pb-8" translate="no">
      <div className="bg-primary text-primary-foreground px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary-foreground/20 flex items-center justify-center shrink-0"><Building2 className="w-6 h-6" /></div>
        <span className="text-sm font-medium opacity-90">참석 확인</span>
      </div>
      <div className="px-4 pt-5 max-w-lg mx-auto space-y-5">
        <div className="bg-card rounded-xl shadow-card p-5 animate-fade-in">
          <h1 className="text-lg font-bold text-foreground leading-snug">{training.title}</h1>
          <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
            <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-primary shrink-0" /><span>{training.event_date}</span></div>
            <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-primary shrink-0" /><span>{training.start_time?.slice(0,5)} ~ {training.end_time?.slice(0,5)}</span></div>
            <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-primary shrink-0" /><span>{training.location}</span></div>
            {training.instructor && <div className="flex items-center gap-2"><User className="w-4 h-4 text-primary shrink-0" /><span>강사: {training.instructor}</span></div>}
          </div>
        </div>
        <div className="bg-success/10 border border-success/30 rounded-xl p-4 animate-fade-in">
          <p className="text-sm text-foreground"><span className="font-semibold">{participantInfo.name}</span>님 ({participantInfo.organization})<br />
            <span className="text-muted-foreground">사전 신청이 확인되었습니다. 서명만 해주세요.</span></p>
        </div>
        <div className="bg-card rounded-xl shadow-card p-5 space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-foreground">서명 <span className="text-destructive">*</span></label>
            <button type="button" onClick={() => { sigCanvas.current?.clear(); setErrors({...errors, signature: ''}); }}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <RotateCcw className="w-3 h-3" />다시 쓰기
            </button>
          </div>
          <div ref={sigContainerRef}
            className={`border-2 border-dashed rounded-xl bg-white overflow-hidden relative ${errors.signature ? 'border-destructive' : 'border-border'}`}>
            <SignatureCanvas ref={sigCanvas}
              canvasProps={{ className: 'w-full cursor-crosshair touch-none', style: { width: '100%', height: '200px' } }}
              backgroundColor="rgba(255,255,255,0)"
              onEnd={() => { if (errors.signature) setErrors({...errors, signature: ''}); }} />
            <span className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground/40 pointer-events-none select-none">서명해주세요</span>
          </div>
          {errors.signature && <p className="text-xs text-destructive">{errors.signature}</p>}
        </div>
        <Button onClick={handleCheckinWithToken} disabled={submitting} className="w-full h-14 text-base rounded-xl font-semibold">
          {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />처리 중...</> : '참석 확인 완료'}
        </Button>
      </div>
    </div>
  );

  if (screen === 'choose_type' && training) return (
    <div className="min-h-svh bg-background flex items-center justify-center p-4" translate="no">
      <div className="w-full max-w-md space-y-5 animate-fade-in">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-lg font-bold text-foreground">{training.title}</h2>
          <p className="text-sm text-muted-foreground">참석 확인을 진행해주세요</p>
        </div>
        <button onClick={() => { setLookupEmail(''); setErrors({}); setScreen('email_lookup'); }}
          className="w-full bg-card rounded-xl shadow-card p-5 text-left hover:shadow-md transition flex items-start gap-4 border border-border">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Mail className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-foreground">사전 신청을 했어요</div>
            <div className="text-xs text-muted-foreground mt-0.5">이메일만 입력하면 서명만 하면 됩니다</div>
          </div>
        </button>
        <button onClick={() => { setErrors({}); setScreen('walkin'); }}
          className="w-full bg-card rounded-xl shadow-card p-5 text-left hover:shadow-md transition flex items-start gap-4 border border-border">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <UserPlus className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-foreground">현장 등록</div>
            <div className="text-xs text-muted-foreground mt-0.5">사전 신청을 하지 않았어요</div>
          </div>
        </button>
      </div>
    </div>
  );

  if (screen === 'email_lookup' && training) return (
    <div className="min-h-svh bg-background flex items-center justify-center p-4" translate="no">
      <div className="w-full max-w-md space-y-5 animate-fade-in">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-lg font-bold text-foreground">사전 신청 확인</h2>
          <p className="text-sm text-muted-foreground">사전 신청 시 사용한 이메일을 입력해주세요</p>
        </div>
        <div className="bg-card rounded-xl shadow-card p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">이메일</label>
            <Input type="email" inputMode="email" autoComplete="email"
              value={lookupEmail}
              onChange={(e) => { setLookupEmail(e.target.value); if (errors.lookup_email) setErrors({}); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleClaimByEmail(); }}
              placeholder="example@email.com"
              className={`h-12 bg-secondary/50 border-border/60 ${errors.lookup_email ? 'border-destructive' : ''}`} />
            {errors.lookup_email && <p className="text-xs text-destructive">{errors.lookup_email}</p>}
          </div>
          <Button onClick={handleClaimByEmail} disabled={submitting} className="w-full h-12 rounded-xl font-semibold">
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />확인 중...</> : '다음'}
          </Button>
          <button type="button" onClick={() => setScreen('choose_type')}
            className="w-full text-xs text-muted-foreground hover:text-foreground py-1">
            ← 뒤로
          </button>
        </div>
      </div>
    </div>
  );

  if (screen === 'walkin' && training) return (
    <div className="min-h-svh bg-muted/30 pb-8" translate="no">
      <div className="bg-primary text-primary-foreground px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary-foreground/20 flex items-center justify-center shrink-0"><Building2 className="w-6 h-6" /></div>
        <span className="text-sm font-medium opacity-90">현장 참석 확인</span>
      </div>
      <div className="px-4 pt-5 max-w-lg mx-auto">
        <div className="bg-card rounded-xl shadow-card overflow-hidden mb-5 animate-fade-in">
          {training.poster_url && <img src={training.poster_url} alt="포스터" className="w-full max-h-56 object-contain bg-secondary/30" />}
          <div className="p-5">
            <h1 className="text-lg font-bold text-foreground leading-snug">{training.title}</h1>
            <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
              <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-primary shrink-0" /><span>{training.event_date}</span></div>
              <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-primary shrink-0" /><span>{training.start_time?.slice(0,5)} ~ {training.end_time?.slice(0,5)}</span></div>
              <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-primary shrink-0" /><span>{training.location}</span></div>
              {training.instructor && <div className="flex items-center gap-2"><User className="w-4 h-4 text-primary shrink-0" /><span>강사: {training.instructor}</span></div>}
            </div>
          </div>
        </div>
        <form onSubmit={handleWalkin} className="space-y-5" noValidate>
          <div className="bg-primary/5 border border-primary/30 rounded-xl p-4 text-sm text-foreground animate-fade-in">
            사전 신청 여부와 관계없이 정보를 입력하고 서명하시면 참석이 확인됩니다.<br />
            <span className="text-xs text-muted-foreground">(사전 신청 시 사용한 이메일을 입력하면 자동으로 연결됩니다.)</span>
          </div>
          <div className="bg-card rounded-xl shadow-card p-5 space-y-5 animate-fade-in">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">이메일 <span className="text-destructive">*</span></label>
              <Input type="email" inputMode="email" autoComplete="email"
                value={form.email} onChange={(e) => updateField('email', e.target.value)}
                className={`h-12 bg-secondary/50 border-border/60 ${errors.email ? 'border-destructive' : ''}`} />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">소속(구분) <span className="text-destructive">*</span></label>
              <div className="flex gap-3">
                {ORG_TYPES.map((t) => (
                  <label key={t} className={`flex-1 text-center py-2.5 rounded-lg border-2 cursor-pointer text-sm font-medium transition-all ${
                    form.org_type === t ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary/50 text-muted-foreground hover:border-primary/40'
                  }`}>
                    <input type="radio" name="org_type" value={t} checked={form.org_type === t}
                      onChange={(e) => {
                        const v = e.target.value;
                        setForm((p) => ({ ...p, org_type: v, organization: v === '경기도' ? '경기도' : (p.org_type === '경기도' ? '' : p.organization) }));
                        if (errors.org_type) setErrors({ ...errors, org_type: '' });
                      }} className="sr-only" />{t}
                  </label>
                ))}
              </div>
              {errors.org_type && <p className="text-xs text-destructive">{errors.org_type}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">기관명 <span className="text-destructive">*</span></label>
              <Input value={form.organization} onChange={(e) => updateField('organization', e.target.value)}
                disabled={form.org_type === '경기도'}
                placeholder={form.org_type === '경기도' ? '경기도 (자동 입력)' : '기관명을 입력해주세요'}
                className={`h-12 bg-secondary/50 border-border/60 ${errors.organization ? 'border-destructive' : ''} ${form.org_type === '경기도' ? 'opacity-70' : ''}`} />
              {errors.organization && <p className="text-xs text-destructive">{errors.organization}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">부서명 <span className="text-destructive">*</span></label>
              <Input value={form.department} onChange={(e) => updateField('department', e.target.value)}
                className={`h-12 bg-secondary/50 border-border/60 ${errors.department ? 'border-destructive' : ''}`} />
              {errors.department && <p className="text-xs text-destructive">{errors.department}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">직급(위) <span className="text-destructive">*</span></label>
              <Input value={form.position} onChange={(e) => updateField('position', e.target.value)}
                className={`h-12 bg-secondary/50 border-border/60 ${errors.position ? 'border-destructive' : ''}`} />
              {errors.position && <p className="text-xs text-destructive">{errors.position}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">성함 <span className="text-destructive">*</span></label>
              <Input value={form.name} onChange={(e) => updateField('name', e.target.value)}
                className={`h-12 bg-secondary/50 border-border/60 ${errors.name ? 'border-destructive' : ''}`} />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
            {training.show_car_number && (
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">차량번호</label>
                <Input value={form.car_number} onChange={(e) => updateField('car_number', e.target.value)}
                  className="h-12 bg-secondary/50 border-border/60" />
              </div>
            )}
          </div>
          <div className="bg-card rounded-xl shadow-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-foreground">서명 <span className="text-destructive">*</span></label>
              <button type="button" onClick={() => { sigCanvas.current?.clear(); setErrors({...errors, signature: ''}); }}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <RotateCcw className="w-3 h-3" />다시 쓰기
              </button>
            </div>
            <div ref={sigContainerRef}
              className={`border-2 border-dashed rounded-xl bg-white overflow-hidden relative ${errors.signature ? 'border-destructive' : 'border-border'}`}>
              <SignatureCanvas ref={sigCanvas}
                canvasProps={{ className: 'w-full cursor-crosshair touch-none', style: { width: '100%', height: '200px' } }}
                backgroundColor="rgba(255,255,255,0)"
                onEnd={() => { if (errors.signature) setErrors({...errors, signature: ''}); }} />
              <span className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground/40 pointer-events-none select-none">서명해주세요</span>
            </div>
            {errors.signature && <p className="text-xs text-destructive">{errors.signature}</p>}
          </div>
          <div className="bg-card rounded-xl shadow-card p-5 space-y-4">
            <label className="text-sm font-semibold text-foreground">개인정보 수집 및 이용 동의 <span className="text-destructive">*</span></label>
            <div className="bg-secondary/50 rounded-lg p-4 text-sm text-muted-foreground space-y-2">
              <div><span className="font-medium text-foreground">수집 항목</span><p>이메일, 성함, 소속, 부서명, 직급{training.show_car_number ? ', 차량번호' : ''}, 서명</p></div>
              <div><span className="font-medium text-foreground">이용 목적</span><p>교육 참석 확인</p></div>
              <div><span className="font-medium text-foreground">보유 기간</span><p className="text-primary font-medium">교육 종료 후 폐기</p></div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="privacy" checked={form.privacy_agreed}
                onCheckedChange={(c) => updateField('privacy_agreed', !!c)} />
              <label htmlFor="privacy" className="text-sm text-foreground cursor-pointer">위 내용에 동의합니다</label>
            </div>
            {errors.privacy_agreed && <p className="text-xs text-destructive">{errors.privacy_agreed}</p>}
          </div>
          <Button type="submit" disabled={submitting} className="w-full h-14 text-base rounded-xl font-semibold">
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />처리 중...</> : '참석 확인 완료'}
          </Button>
        </form>
      </div>
    </div>
  );

  return null;
};

export default TrainingRegisterPage;
