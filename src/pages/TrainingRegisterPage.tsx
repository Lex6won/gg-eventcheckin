import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CheckCircle2, Calendar, MapPin, Clock, Loader2, Building2,
  RotateCcw, AlertCircle, XCircle, User, Users, Mail, ArrowLeft, UserPlus,
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
}

const ORG_TYPES = ['경기도', '시군', '공공기관', '민간기업 등 기타'] as const;
type Step = 'choice' | 'email' | 'sign' | 'walkin';

const TrainingRegisterPage = () => {
  const { accessCode } = useParams<{ accessCode: string }>();
  const [searchParams] = useSearchParams();
  const code = accessCode || searchParams.get('code') || '';

  const sigCanvas = useRef<SignatureCanvas>(null);
  const sigContainerRef = useRef<HTMLDivElement>(null);

  const [training, setTraining] = useState<TrainingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [expired, setExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<null | { name: string; mode: 'checkin' | 'walkin'; wasWaitlisted?: boolean }>(null);
  const [alreadyDone, setAlreadyDone] = useState<null | { name: string }>(null);
  const [waitlistedNotice, setWaitlistedNotice] = useState(false);

  const [step, setStep] = useState<Step>('choice');
  const [email, setEmail] = useState('');
  const [matched, setMatched] = useState<{ name: string; organization: string; status: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    org_type: '', custom_org_type: '', organization: '', department: '',
    position: '', name: '', car_number: '', privacy_agreed: false,
  });

  const resizeCanvas = useCallback(() => {
    if (sigCanvas.current && sigContainerRef.current) {
      const container = sigContainerRef.current;
      const canvas = sigCanvas.current.getCanvas();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = container.offsetWidth * ratio;
      canvas.height = 200 * ratio;
      canvas.style.width = `${container.offsetWidth}px`;
      canvas.style.height = '200px';
      canvas.getContext('2d')?.scale(ratio, ratio);
      sigCanvas.current.clear();
    }
  }, []);

  useEffect(() => {
    const fetchT = async () => {
      if (!code) { setNotFound(true); setLoading(false); return; }
      const { data, error } = await supabase.from('trainings').select('*').eq('access_code', code).maybeSingle();
      if (error || !data) { setNotFound(true); setLoading(false); return; }
      if (data.status === '완료') { setTraining(data); setExpired(true); setLoading(false); return; }
      setTraining(data);
      setLoading(false);
    };
    fetchT();
  }, [code]);

  useEffect(() => {
    if ((step === 'sign' || step === 'walkin') && training) setTimeout(resizeCanvas, 100);
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [step, training, resizeCanvas]);

  const handleEmailLookup = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!training) return;
    const q = email.trim();
    if (!q) { setErrors({ email: '이메일을 입력해주세요.' }); return; }
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q);
    if (!isEmail) {
      setErrors({ email: '올바른 이메일 형식이 아닙니다.' }); return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const { data: lookup, error } = await supabase.rpc('lookup_trainee', {
        p_training_id: training.id, p_query: q,
      });
      if (error) throw error;
      const r = lookup as any;
      if (r.status === 'not_found') { setStep('walkin'); return; }
      if (r.status === 'multiple') {
        setErrors({ email: '같은 이메일로 신청한 내역이 여러 건입니다. 담당자에게 문의해주세요.' });
        return;
      }
      const data = r.trainee as { name: string; organization: string; status: string };
      if (data.status === 'confirmed' || data.status === 'walk_in') {
        setAlreadyDone({ name: data.name });
        return;
      }
      if (data.status === 'waitlisted') {
        setWaitlistedNotice(true);
      }
      setMatched({ name: data.name, organization: data.organization, status: data.status });
      setStep('sign');
    } catch (err) {
      console.error(err);
      toast.error('조회 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckin = async () => {
    if (!training || !sigCanvas.current || sigCanvas.current.isEmpty()) {
      setErrors({ signature: '서명을 해주세요.' }); return;
    }
    setSubmitting(true);
    try {
      const sig = sigCanvas.current.toDataURL('image/png');
      const { data, error } = await supabase.rpc('checkin_trainee', {
        p_training_id: training.id, p_email: email.trim(), p_signature_url: sig,
      });
      if (error) throw error;
      const r = data as any;
      if (r.status === 'already') { setAlreadyDone({ name: r.trainee?.name || matched?.name || '' }); return; }
      setSuccess({ name: r.trainee?.name || matched?.name || '', mode: 'checkin', wasWaitlisted: !!r.was_waitlisted });
    } catch (err) {
      console.error(err);
      toast.error('체크인 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const updateField = (k: string, v: string | boolean) => {
    setForm({ ...form, [k]: v });
    if (errors[k]) setErrors({ ...errors, [k]: '' });
  };

  const validateWalkin = () => {
    const e: Record<string, string> = {};
    if (!form.org_type) e.org_type = '소속 구분을 선택해주세요.';
    if (form.org_type === '민간기업 등 기타' && !form.custom_org_type.trim()) e.custom_org_type = '소속 구분을 입력해주세요.';
    if (!form.organization.trim()) e.organization = '기관명을 입력해주세요.';
    if (!form.department.trim()) e.department = '부서명을 입력해주세요.';
    if (!form.position.trim()) e.position = '직급(위)을 입력해주세요.';
    if (!form.name.trim()) e.name = '성함을 입력해주세요.';
    if (!form.privacy_agreed) e.privacy_agreed = '개인정보 수집 및 이용에 동의해주세요.';
    if (!sigCanvas.current || sigCanvas.current.isEmpty()) e.signature = '서명을 해주세요.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleWalkin = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!training) return;
    if (!validateWalkin()) { toast.error('필수 항목을 확인해주세요.'); return; }
    setSubmitting(true);
    try {
      const sig = sigCanvas.current!.toDataURL('image/png');
      const finalOrgType = form.org_type === '민간기업 등 기타' ? form.custom_org_type.trim() : form.org_type;
      const { data, error } = await supabase.rpc('walk_in_trainee', {
        p_training_id: training.id,
        p_email: email.trim(),
        p_org_type: finalOrgType,
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
      const r = data as any;
      if (r.status === 'duplicate') { setAlreadyDone({ name: form.name.trim() }); return; }
      setSuccess({ name: form.name.trim(), mode: 'walkin' });
    } catch (err) {
      console.error(err);
      toast.error('현장 등록 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setEmail(''); setMatched(null); setStep('choice'); setSuccess(null);
    setAlreadyDone(null); setErrors({}); setWaitlistedNotice(false);
    setForm({ org_type:'', custom_org_type:'', organization:'', department:'',
      position:'', name:'', car_number:'', privacy_agreed:false });
  };

  if (loading) return <div className="min-h-svh bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (notFound) return (
    <div className="min-h-svh bg-background flex items-center justify-center p-4">
      <div className="text-center space-y-4 animate-fade-in">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-destructive/10"><XCircle className="w-10 h-10 text-destructive" /></div>
        <h2 className="text-xl font-bold text-foreground">교육 정보를 찾을 수 없습니다</h2>
        <p className="text-muted-foreground text-sm">접속코드를 다시 확인해주세요.</p>
      </div>
    </div>
  );
  if (expired) return (
    <div className="min-h-svh bg-background flex items-center justify-center p-4">
      <div className="text-center space-y-4 animate-fade-in">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-warning/10"><AlertCircle className="w-10 h-10 text-warning" /></div>
        <h2 className="text-xl font-bold text-foreground">신청이 마감되었습니다</h2>
        <p className="text-muted-foreground text-sm">{training?.title}은(는) 종료되었습니다.</p>
      </div>
    </div>
  );

  if (alreadyDone) return (
    <div className="min-h-svh bg-background flex items-center justify-center p-4">
      <div className="text-center space-y-4 animate-fade-in">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-warning/10"><AlertCircle className="w-10 h-10 text-warning" /></div>
        <h2 className="text-xl font-bold text-foreground">이미 체크인 완료</h2>
        <p className="text-muted-foreground text-sm"><strong>{alreadyDone.name}</strong>님은 이미 참석 확인이 완료되었습니다.</p>
        <Button variant="outline" className="rounded-xl" onClick={reset}>다른 사람 확인</Button>
      </div>
    </div>
  );

  if (success) return (
    <div className="min-h-svh bg-background flex items-center justify-center p-4">
      <div className="text-center space-y-4 animate-fade-in">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-success/10 animate-check-bounce">
          <CheckCircle2 className="w-10 h-10 text-success" />
        </div>
        <h2 className="text-xl font-bold text-foreground">참석 확인 완료 ✓</h2>
        <p className="text-muted-foreground text-sm">
          <strong className="text-foreground">{success.name}</strong>님,<br />
          {success.mode === 'walkin' ? '현장 등록 및 ' : ''}참석이 확인되었습니다.
          {success.wasWaitlisted && <><br /><span className="text-warning">(대기자에서 확정 처리)</span></>}
        </p>
        <div className="flex flex-col gap-3 mt-4">
          <Button className="px-8 h-12 text-base rounded-xl" onClick={reset}>다음 사람 체크인</Button>
          <Button variant="outline" className="px-8 h-12 text-base rounded-xl" onClick={() => window.location.href = '/'}>확인</Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-svh bg-muted/30 pb-8" translate="no">
      <div className="bg-primary text-primary-foreground px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary-foreground/20 flex items-center justify-center shrink-0">
          <Building2 className="w-6 h-6" />
        </div>
        <span className="text-sm font-medium opacity-90">교육 현장 체크인</span>
      </div>

      <div className="px-4 pt-5 max-w-lg mx-auto">
        <div className="bg-card rounded-xl shadow-card overflow-hidden mb-5 animate-fade-in">
          {training?.poster_url && <img src={training.poster_url} alt="포스터" className="w-full max-h-56 object-contain bg-secondary/30" />}
          <div className="p-5">
            <h1 className="text-lg font-bold text-foreground leading-snug">{training?.title}</h1>
            <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
              <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-primary shrink-0" /><span>{training?.event_date}</span></div>
              <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-primary shrink-0" /><span>{training?.start_time?.slice(0,5)} ~ {training?.end_time?.slice(0,5)}</span></div>
              <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-primary shrink-0" /><span>{training?.location}</span></div>
              {training?.instructor && <div className="flex items-center gap-2"><User className="w-4 h-4 text-primary shrink-0" /><span>강사: {training.instructor}</span></div>}
            </div>
          </div>
        </div>

        {step === 'choice' && (
          <div className="space-y-4 animate-fade-in">
            <button type="button" onClick={() => setStep('email')}
              className="w-full bg-card rounded-xl shadow-card p-5 text-left hover:bg-secondary/30 transition-colors border-2 border-primary/30">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Mail className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-base font-semibold text-foreground">사전 신청 했어요</p>
                  <p className="text-xs text-muted-foreground mt-0.5">이메일로 빠르게 참석 확인</p>
                </div>
              </div>
            </button>
            <button type="button" onClick={() => setStep('walkin')}
              className="w-full bg-card rounded-xl shadow-card p-5 text-left hover:bg-secondary/30 transition-colors border border-border">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                  <UserPlus className="w-6 h-6 text-foreground" />
                </div>
                <div className="flex-1">
                  <p className="text-base font-semibold text-foreground">사전 신청 안 했어요</p>
                  <p className="text-xs text-muted-foreground mt-0.5">바로 현장 등록 + 참석 확인</p>
                </div>
              </div>
            </button>
          </div>
        )}

        {step === 'email' && (
          <form onSubmit={handleEmailLookup} className="space-y-5">
            <div className="bg-card rounded-xl shadow-card p-5 space-y-4 animate-fade-in">
              <div>
                <label className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-2">
                  <Mail className="w-4 h-4 text-primary" />사전 신청 이메일로 확인
                </label>
                <Input type="text" inputMode="email" autoComplete="email" autoFocus
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="사전 신청 시 입력한 이메일"
                  className={`h-12 bg-secondary/50 border-border/60 ${errors.email ? 'border-destructive' : ''}`} />
                {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
              </div>
              <div className="flex gap-3">
                <Button variant="outline" type="button" onClick={() => setStep('choice')} className="h-14 rounded-xl"><ArrowLeft className="w-4 h-4" /></Button>
                <Button type="submit" disabled={submitting} className="flex-1 h-14 text-base rounded-xl font-semibold">
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />확인 중...</> : '확인'}
                </Button>
              </div>
            </div>
          </form>
        )}

        {step === 'sign' && matched && (
          <div className="space-y-5">
            <div className={`border rounded-xl p-4 animate-fade-in ${waitlistedNotice ? 'bg-warning/10 border-warning/30' : 'bg-success/10 border-success/30'}`}>
              <p className="text-sm text-foreground">
                <span className="font-semibold">{matched.name}</span>님 ({matched.organization})<br />
                <span className="text-muted-foreground">
                  {waitlistedNotice
                    ? '대기자 명단에 등록되어 있습니다. 자리가 있다면 체크인 시 확정됩니다.'
                    : '사전 신청이 확인되었습니다. 서명만 해주세요.'}
                </span>
              </p>
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
            <div className="flex gap-3">
              <Button variant="outline" type="button" onClick={reset} className="h-14 rounded-xl"><ArrowLeft className="w-4 h-4" /></Button>
              <Button onClick={handleCheckin} disabled={submitting} className="flex-1 h-14 text-base rounded-xl font-semibold">
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />처리 중...</> : '체크인 완료'}
              </Button>
            </div>
          </div>
        )}

        {step === 'walkin' && (
          <form onSubmit={handleWalkin} className="space-y-5">
            <div className="bg-primary/5 border border-primary/30 rounded-xl p-4 text-sm text-foreground flex items-start gap-2 animate-fade-in">
              <UserPlus className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <span>현장에서 정보를 입력하고 <strong>바로 참석 확인</strong>해드립니다 (정원 무관).</span>
            </div>

            <div className="bg-card rounded-xl shadow-card p-5 space-y-5 animate-fade-in">
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
                          setForm((prev) => ({
                            ...prev,
                            org_type: v,
                            organization: v === '경기도' ? '경기도' : (prev.org_type === '경기도' ? '' : prev.organization),
                          }));
                          if (errors.org_type) setErrors({ ...errors, org_type: '' });
                          if (v === '경기도' && errors.organization) setErrors({ ...errors, organization: '' });
                        }} className="sr-only" />{t}
                    </label>
                  ))}
                </div>
                {errors.org_type && <p className="text-xs text-destructive">{errors.org_type}</p>}
                {form.org_type === '민간기업 등 기타' && (
                  <Input value={form.custom_org_type} onChange={(e) => updateField('custom_org_type', e.target.value)}
                    placeholder="직접 입력" className={`h-12 bg-secondary/50 border-border/60 mt-2 ${errors.custom_org_type ? 'border-destructive' : ''}`} />
                )}
                {errors.custom_org_type && <p className="text-xs text-destructive">{errors.custom_org_type}</p>}
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

              {training?.show_car_number && (
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
                <div><span className="font-medium text-foreground">수집 항목</span><p>이메일, 성함, 소속, 부서명, 직급{training?.show_car_number ? ', 차량번호' : ''}</p></div>
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

            <div className="flex gap-3">
              <Button variant="outline" type="button" onClick={reset} className="h-14 rounded-xl"><ArrowLeft className="w-4 h-4" /></Button>
              <Button type="submit" disabled={submitting} className="flex-1 h-14 text-base rounded-xl font-semibold">
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />등록 중...</> : '현장 등록 + 체크인'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default TrainingRegisterPage;
