import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CheckCircle2, Calendar, MapPin, Clock, Loader2, Building2,
  RotateCcw, AlertCircle, XCircle, User, Users,
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

const ORG_TYPES = ['경기도', '시군', '공공기관', '직접입력'] as const;

const TrainingRegisterPage = () => {
  const { accessCode } = useParams<{ accessCode: string }>();
  const [searchParams] = useSearchParams();
  const code = accessCode || searchParams.get('code') || '';

  const sigCanvas = useRef<SignatureCanvas>(null);
  const sigContainerRef = useRef<HTMLDivElement>(null);

  const [training, setTraining] = useState<TrainingData | null>(null);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [expired, setExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<null | { status: 'confirmed' | 'waitlisted'; position?: number }>(null);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [closed, setClosed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    org_type: '',
    custom_org_type: '',
    organization: '',
    department: '',
    position: '',
    name: '',
    car_number: '',
    inquiry: '',
    privacy_agreed: false,
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

  const fetchAll = useCallback(async () => {
    if (!code) { setNotFound(true); setLoading(false); return; }
    const { data, error } = await supabase.from('trainings').select('*').eq('access_code', code).single();
    if (error || !data) { setNotFound(true); setLoading(false); return; }
    if (data.status === '완료') { setTraining(data); setExpired(true); setLoading(false); return; }
    setTraining(data);
    const { count } = await supabase.from('trainees').select('*', { count: 'exact', head: true })
      .eq('training_id', data.id).eq('status', 'confirmed');
    setConfirmedCount(count ?? 0);
    if (data.capacity_enabled && data.capacity !== null && (count ?? 0) >= data.capacity && !data.allow_waitlist) {
      setClosed(true);
    }
    setLoading(false);
  }, [code]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    if (!loading && training && !expired && !closed) setTimeout(resizeCanvas, 100);
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [loading, training, expired, closed, resizeCanvas]);

  const updateField = (key: string, value: string | boolean) => {
    setForm({ ...form, [key]: value });
    if (errors[key]) setErrors({ ...errors, [key]: '' });
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.org_type) e.org_type = '소속 구분을 선택해주세요.';
    if (form.org_type === '직접입력' && !form.custom_org_type.trim()) e.custom_org_type = '소속 구분을 입력해주세요.';
    if (!form.organization.trim()) e.organization = '기관명을 입력해주세요.';
    if (!form.department.trim()) e.department = '부서명을 입력해주세요.';
    if (!form.position.trim()) e.position = '직급(위)을 입력해주세요.';
    if (!form.name.trim()) e.name = '성함을 입력해주세요.';
    if (!form.privacy_agreed) e.privacy_agreed = '개인정보 수집 및 이용에 동의해주세요.';
    if (!sigCanvas.current || sigCanvas.current.isEmpty()) e.signature = '서명을 해주세요.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!training) return;
    if (!validate()) { toast.error('필수 항목을 확인해주세요.'); return; }
    setSubmitting(true);
    try {
      const signatureDataUrl = sigCanvas.current!.toDataURL('image/png');
      const finalOrgType = form.org_type === '직접입력' ? form.custom_org_type.trim() : form.org_type;
      const { data, error } = await supabase.rpc('register_trainee', {
        p_training_id: training.id,
        p_org_type: finalOrgType,
        p_organization: form.organization.trim(),
        p_department: form.department.trim(),
        p_position: form.position.trim(),
        p_name: form.name.trim(),
        p_car_number: form.car_number.trim(),
        p_inquiry: form.inquiry.trim(),
        p_signature_url: signatureDataUrl,
        p_privacy_agreed: form.privacy_agreed,
      });
      if (error) throw error;
      const result = data as { status: string; position?: number };
      if (result.status === 'duplicate') { setAlreadyRegistered(true); return; }
      if (result.status === 'full') { setClosed(true); return; }
      setSuccess({ status: result.status as 'confirmed' | 'waitlisted', position: result.position });
      // refresh count for next registration
      const { count } = await supabase.from('trainees').select('*', { count: 'exact', head: true })
        .eq('training_id', training.id).eq('status', 'confirmed');
      setConfirmedCount(count ?? 0);
    } catch (err) {
      console.error(err);
      toast.error('교육 신청 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setForm({
      org_type: '', custom_org_type: '', organization: '', department: '',
      position: '', name: '', car_number: '', inquiry: '', privacy_agreed: false,
    });
    setErrors({});
    setSuccess(null);
    if (training?.capacity_enabled && training.capacity !== null && confirmedCount >= training.capacity && !training.allow_waitlist) {
      setClosed(true);
    }
    setTimeout(resizeCanvas, 100);
  };

  if (loading) {
    return <div className="min-h-svh bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (notFound) {
    return (
      <div className="min-h-svh bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 animate-fade-in">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-destructive/10">
            <XCircle className="w-10 h-10 text-destructive" />
          </div>
          <h2 className="text-xl font-bold text-foreground">교육 정보를 찾을 수 없습니다</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">접속코드를 다시 확인해주세요.</p>
        </div>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="min-h-svh bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 animate-fade-in">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-warning/10">
            <AlertCircle className="w-10 h-10 text-warning" />
          </div>
          <h2 className="text-xl font-bold text-foreground">신청이 마감되었습니다</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">이 교육은 종료되었습니다.</p>
        </div>
      </div>
    );
  }

  if (closed && !success) {
    return (
      <div className="min-h-svh bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 animate-fade-in">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-warning/10">
            <Users className="w-10 h-10 text-warning" />
          </div>
          <h2 className="text-xl font-bold text-foreground">정원이 마감되었습니다</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            현재 모든 자리가 신청 완료되어<br />추가 신청을 받지 않습니다.
          </p>
        </div>
      </div>
    );
  }

  if (alreadyRegistered) {
    return (
      <div className="min-h-svh bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 animate-fade-in">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-warning/10">
            <AlertCircle className="w-10 h-10 text-warning" />
          </div>
          <h2 className="text-xl font-bold text-foreground">이미 신청되었습니다</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            동일한 이름과 소속으로 이미 신청이 완료되었습니다.
          </p>
        </div>
      </div>
    );
  }

  if (success) {
    const isWait = success.status === 'waitlisted';
    return (
      <div className="min-h-svh bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 animate-fade-in">
          <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full animate-check-bounce ${isWait ? 'bg-warning/10' : 'bg-success/10'}`}>
            {isWait ? <Clock className="w-10 h-10 text-warning" /> : <CheckCircle2 className="w-10 h-10 text-success" />}
          </div>
          <h2 className="text-xl font-bold text-foreground">
            {isWait ? '대기자로 등록되었습니다' : '교육 신청이 완료되었습니다 ✓'}
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {isWait
              ? <>현재 정원이 마감되어 <span className="font-semibold text-foreground">대기자 {success.position}번</span>으로 등록되었습니다.<br />자리가 나면 담당자가 안내드립니다.</>
              : <>교육 신청이 정상적으로 완료되었습니다.<br />당일 즐거운 교육 되시기 바랍니다.</>}
          </p>
          <div className="flex flex-col gap-3 mt-4">
            <Button className="px-8 h-12 text-base rounded-xl" onClick={resetForm}>추가신청 등록</Button>
            <Button variant="outline" className="px-8 h-12 text-base rounded-xl" onClick={() => window.location.href = '/'}>확인</Button>
          </div>
        </div>
      </div>
    );
  }

  const willBeWaitlisted =
    !!training?.capacity_enabled && training.capacity !== null && confirmedCount >= training.capacity && training.allow_waitlist;

  return (
    <div className="min-h-svh bg-muted/30 pb-8" translate="no">
      <div className="bg-primary text-primary-foreground px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary-foreground/20 flex items-center justify-center shrink-0">
          <Building2 className="w-6 h-6" />
        </div>
        <span className="text-sm font-medium opacity-90">교육 신청 시스템</span>
      </div>

      <div className="px-4 pt-5 max-w-lg mx-auto">
        <div className="bg-card rounded-xl shadow-card overflow-hidden mb-5 animate-fade-in">
          {training?.poster_url && (
            <img src={training.poster_url} alt="교육 포스터" className="w-full max-h-56 object-contain bg-secondary/30" />
          )}
          <div className="p-5">
            <h1 className="text-lg font-bold text-foreground leading-snug">{training?.title}</h1>
            {training?.description && <p className="text-sm text-muted-foreground mt-1.5">{training.description}</p>}
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4 text-primary shrink-0" /><span>{training?.event_date}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4 text-primary shrink-0" /><span>{training?.start_time?.slice(0, 5)} ~ {training?.end_time?.slice(0, 5)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4 text-primary shrink-0" /><span>{training?.location}</span>
              </div>
              {training?.instructor && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="w-4 h-4 text-primary shrink-0" /><span>강사: {training.instructor}</span>
                </div>
              )}
              {training?.capacity_enabled && training.capacity !== null && (
                <div className="flex items-center gap-2 text-sm">
                  <Users className={`w-4 h-4 shrink-0 ${willBeWaitlisted ? 'text-warning' : 'text-primary'}`} />
                  <span className={willBeWaitlisted ? 'text-warning font-medium' : 'text-muted-foreground'}>
                    정원 {training.capacity}명 중 {confirmedCount}명 신청
                    {willBeWaitlisted && ' — 대기자로 등록됩니다'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {willBeWaitlisted && (
          <div className="mb-4 bg-warning/10 border border-warning/30 rounded-xl p-4 text-sm text-foreground flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <span>현재 정원이 마감되었습니다. 신청하시면 <strong>대기자 명단</strong>에 등록되며, 자리가 나면 안내드립니다.</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div className="bg-card rounded-xl shadow-card p-5 space-y-5 animate-fade-in">
            <p className="text-sm font-medium text-foreground">교육 신청을 위해 아래 정보를 입력해주세요.</p>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">소속(구분) <span className="text-destructive">*</span></label>
              <div className="flex gap-3">
                {ORG_TYPES.map((t) => (
                  <label key={t}
                    className={`flex-1 text-center py-2.5 rounded-lg border-2 cursor-pointer text-sm font-medium transition-all ${
                      form.org_type === t ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary/50 text-muted-foreground hover:border-primary/40'
                    }`}>
                    <input type="radio" name="org_type" value={t} checked={form.org_type === t}
                      onChange={(e) => updateField('org_type', e.target.value)} className="sr-only" />
                    {t}
                  </label>
                ))}
              </div>
              {errors.org_type && <p className="text-xs text-destructive">{errors.org_type}</p>}
              {form.org_type === '직접입력' && (
                <div className="mt-2">
                  <Input value={form.custom_org_type} onChange={(e) => updateField('custom_org_type', e.target.value)}
                    placeholder="소속 구분을 직접 입력해주세요"
                    className={`h-12 bg-secondary/50 border-border/60 ${errors.custom_org_type ? 'border-destructive' : ''}`} />
                  {errors.custom_org_type && <p className="text-xs text-destructive mt-1">{errors.custom_org_type}</p>}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">기관명 <span className="text-destructive">*</span></label>
              <Input value={form.organization} onChange={(e) => updateField('organization', e.target.value)}
                placeholder="경기도 소속인 경우 실국명 입력"
                className={`h-12 bg-secondary/50 border-border/60 ${errors.organization ? 'border-destructive' : ''}`} />
              {errors.organization && <p className="text-xs text-destructive">{errors.organization}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">부서명 <span className="text-destructive">*</span></label>
              <Input value={form.department} onChange={(e) => updateField('department', e.target.value)}
                placeholder="예: AI데이터행정과, 영통구 건축과, 경영관리부 등"
                className={`h-12 bg-secondary/50 border-border/60 ${errors.department ? 'border-destructive' : ''}`} />
              {errors.department && <p className="text-xs text-destructive">{errors.department}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">직급(위) <span className="text-destructive">*</span></label>
              <Input value={form.position} onChange={(e) => updateField('position', e.target.value)}
                placeholder="예: 데이터분석팀장, 행정6급, 대리 등"
                className={`h-12 bg-secondary/50 border-border/60 ${errors.position ? 'border-destructive' : ''}`} />
              {errors.position && <p className="text-xs text-destructive">{errors.position}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">성함 <span className="text-destructive">*</span></label>
              <Input value={form.name} onChange={(e) => updateField('name', e.target.value)}
                placeholder="성함을 입력해주세요"
                className={`h-12 bg-secondary/50 border-border/60 ${errors.name ? 'border-destructive' : ''}`} />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>

            {training?.show_car_number && (
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">차량번호</label>
                <Input value={form.car_number} onChange={(e) => updateField('car_number', e.target.value)}
                  placeholder="차량 등록이 필요하신 경우 기재해주세요"
                  className="h-12 bg-secondary/50 border-border/60" />
              </div>
            )}

          </div>

          <div className="bg-card rounded-xl shadow-card p-5 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-foreground">서명 <span className="text-destructive">*</span></label>
              <button type="button"
                onClick={() => { sigCanvas.current?.clear(); if (errors.signature) setErrors({ ...errors, signature: '' }); }}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <RotateCcw className="w-3 h-3" />다시 쓰기
              </button>
            </div>
            <div ref={sigContainerRef}
              className={`border-2 border-dashed rounded-xl bg-white overflow-hidden relative ${errors.signature ? 'border-destructive' : 'border-border'}`}>
              <SignatureCanvas ref={sigCanvas}
                canvasProps={{ className: 'w-full cursor-crosshair touch-none', style: { width: '100%', height: '200px' } }}
                backgroundColor="rgba(255,255,255,0)"
                onEnd={() => { if (errors.signature) setErrors({ ...errors, signature: '' }); }} />
              <span className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground/40 pointer-events-none select-none">서명해주세요</span>
            </div>
            {errors.signature && <p className="text-xs text-destructive">{errors.signature}</p>}
          </div>

          <div className="bg-card rounded-xl shadow-card p-5 space-y-4 animate-fade-in">
            <label className="text-sm font-semibold text-foreground">개인정보 수집 및 이용 동의 <span className="text-destructive">*</span></label>
            <div className="bg-secondary/50 rounded-lg p-4 text-sm text-muted-foreground space-y-2">
              <div>
                <span className="font-medium text-foreground">수집하는 개인정보 항목</span>
                <p>성함, 소속, 부서명, 직급{training?.show_car_number ? ', 차량번호' : ''}</p>
              </div>
              <div>
                <span className="font-medium text-foreground">수집 및 이용 목적</span>
                <p>교육 신청 등록 및 주차 지원</p>
              </div>
              <div>
                <span className="font-medium text-foreground">보유 및 이용기간</span>
                <p className="text-primary font-medium">교육 종료 후 폐기</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">동의를 거부하실 수 있으나 신청 등록이 불가능합니다.</p>
            <div className="flex items-center gap-2">
              <Checkbox id="privacy" checked={form.privacy_agreed}
                onCheckedChange={(c) => updateField('privacy_agreed', !!c)}
                className={errors.privacy_agreed ? 'border-destructive' : ''} />
              <label htmlFor="privacy" className="text-sm font-medium text-foreground cursor-pointer">
                개인정보 수집 및 이용에 동의합니다.
              </label>
            </div>
            {errors.privacy_agreed && <p className="text-xs text-destructive">{errors.privacy_agreed}</p>}
          </div>

          <div className="flex gap-3">
            <Button type="button" variant="outline" className="h-14 px-5 text-base rounded-xl"
              onClick={() => window.location.href = '/'}>홈</Button>
            <Button type="submit" className="flex-1 h-14 text-base font-bold rounded-xl shadow-md" disabled={submitting}>
              {submitting ? <><Loader2 className="w-5 h-5 animate-spin" />등록 중...</>
                : willBeWaitlisted ? '대기자 등록' : '교육 신청'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TrainingRegisterPage;