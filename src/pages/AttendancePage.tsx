import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, Calendar, MapPin, Clock, Loader2, Building2, RotateCcw, AlertCircle, XCircle, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';


interface EventData {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string;
  end_time: string;
  location: string;
  organizer: string;
  status: string | null;
  poster_url: string | null;
  show_car_number: boolean;
}

const ORG_TYPES = ['경기도', '시군', '공공기관'] as const;

const AttendancePage = () => {
  const { accessCode } = useParams<{ accessCode: string }>();
  const [searchParams] = useSearchParams();
  const codeFromQuery = searchParams.get('code');
  const code = accessCode || codeFromQuery || '';

  const sigCanvas = useRef<SignatureCanvas>(null);
  const sigContainerRef = useRef<HTMLDivElement>(null);

  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [expired, setExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    org_type: '',
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

  useEffect(() => {
    const fetchEvent = async () => {
      if (!code) { setNotFound(true); setLoading(false); return; }
      const { data, error } = await supabase
        .from('events').select('*').eq('access_code', code).single();
      if (error || !data) { setNotFound(true); setLoading(false); return; }
      if (data.status === '완료') { setEvent(data); setExpired(true); setLoading(false); return; }
      setEvent(data);
      setLoading(false);
    };
    fetchEvent();
  }, [code]);

  useEffect(() => {
    if (!loading && event && !expired) setTimeout(resizeCanvas, 100);
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [loading, event, expired, resizeCanvas]);

  const updateField = (key: string, value: string | boolean) => {
    setForm({ ...form, [key]: value });
    if (errors[key]) setErrors({ ...errors, [key]: '' });
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.org_type) e.org_type = '소속 구분을 선택해주세요.';
    if (!form.organization.trim()) e.organization = '기관명을 입력해주세요.';
    if (!form.department.trim()) e.department = '부서명을 입력해주세요.';
    if (!form.name.trim()) e.name = '성함을 입력해주세요.';
    if (!form.privacy_agreed) e.privacy_agreed = '개인정보 수집 및 이용에 동의해주세요.';
    if (!sigCanvas.current || sigCanvas.current.isEmpty()) e.signature = '서명을 해주세요.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!event) return;
    if (!validate()) { toast.error('필수 항목을 확인해주세요.'); return; }
    setSubmitting(true);
    try {
      const { data: existing } = await supabase
        .from('attendees').select('id').eq('event_id', event.id)
        .eq('name', form.name.trim()).eq('organization', form.organization.trim()).maybeSingle();
      if (existing) { setAlreadyRegistered(true); setSubmitting(false); return; }

      const signatureDataUrl = sigCanvas.current!.toDataURL('image/png');
      const { error: insertError } = await supabase.from('attendees').insert({
        event_id: event.id,
        org_type: form.org_type,
        organization: form.organization.trim(),
        department: form.department.trim(),
        position: form.position.trim() || null,
        name: form.name.trim(),
        car_number: form.car_number.trim() || null,
        inquiry: form.inquiry.trim() || null,
        privacy_agreed: form.privacy_agreed,
        signature_url: signatureDataUrl,
      });
      if (insertError) throw insertError;
      setSuccess(true);
    } catch (err) {
      console.error(err);
      toast.error('참석 등록 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  // --- Status screens ---
  if (loading) {
    return (
      <div className="min-h-svh bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-svh bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 animate-fade-in">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-destructive/10">
            <XCircle className="w-10 h-10 text-destructive" />
          </div>
          <h2 className="text-xl font-bold text-foreground">행사 정보를 찾을 수 없습니다</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            접속코드를 다시 확인해주세요.<br />문제가 계속되면 행사 담당자에게 문의하세요.
          </p>
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
          <h2 className="text-xl font-bold text-foreground">참석 등록이 마감되었습니다</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            이 행사의 참석 등록 기간이 종료되었습니다.<br />문의사항은 행사 담당자에게 연락해주세요.
          </p>
          {event && (
            <div className="mt-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{event.title}</p>
              <p>{event.event_date}</p>
            </div>
          )}
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
          <h2 className="text-xl font-bold text-foreground">이미 등록되었습니다</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            동일한 이름과 소속으로 이미 참석 등록이 완료되었습니다.<br />문의사항은 행사 담당자에게 연락해주세요.
          </p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-svh bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 animate-fade-in">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-success/10 animate-check-bounce">
            <CheckCircle2 className="w-10 h-10 text-success" />
          </div>
          <h2 className="text-xl font-bold text-foreground">참석 등록이 완료되었습니다 ✓</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            참석 등록이 정상적으로 완료되었습니다.<br />즐거운 교육 되시기 바랍니다.
          </p>
          <Button className="mt-4 px-8 h-12 text-base rounded-xl" onClick={() => window.close()}>
            확인
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-muted/30 pb-8" translate="no">
      {/* Top Bar */}
      <div className="bg-primary text-primary-foreground px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary-foreground/20 flex items-center justify-center shrink-0">
          <Building2 className="w-6 h-6" />
        </div>
        <span className="text-sm font-medium opacity-90">행사 참석 확인 시스템</span>
      </div>

      <div className="px-4 pt-5 max-w-lg mx-auto">
        {/* Event Info */}
        <div className="bg-card rounded-xl shadow-card overflow-hidden mb-5 animate-fade-in">
          {event?.poster_url && (
            <img src={event.poster_url} alt="행사 포스터" className="w-full max-h-56 object-contain bg-secondary/30" />
          )}
          <div className="p-5">
            <h1 className="text-lg font-bold text-foreground leading-snug">{event?.title}</h1>
            {event?.description && <p className="text-sm text-muted-foreground mt-1.5">{event.description}</p>}
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4 text-primary shrink-0" /><span>{event?.event_date}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4 text-primary shrink-0" /><span>{event?.start_time?.slice(0, 5)} ~ {event?.end_time?.slice(0, 5)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4 text-primary shrink-0" /><span>{event?.location}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Registration Form */}
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div className="bg-card rounded-xl shadow-card p-5 space-y-5 animate-fade-in">
            <p className="text-sm font-medium text-foreground">참석 확인을 위해 아래 정보를 입력해주세요.</p>

            {/* 1. 소속 구분 */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">
                소속(구분) <span className="text-destructive">*</span>
              </label>
              <div className="flex gap-3">
                {ORG_TYPES.map((t) => (
                  <label
                    key={t}
                    className={`flex-1 text-center py-2.5 rounded-lg border-2 cursor-pointer text-sm font-medium transition-all ${
                      form.org_type === t
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-secondary/50 text-muted-foreground hover:border-primary/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="org_type"
                      value={t}
                      checked={form.org_type === t}
                      onChange={(e) => updateField('org_type', e.target.value)}
                      className="sr-only"
                    />
                    {t}
                  </label>
                ))}
              </div>
              {errors.org_type && <p className="text-xs text-destructive">{errors.org_type}</p>}
            </div>

            {/* 2. 기관명 */}
            <div className="space-y-1.5">
              <label htmlFor="org" className="text-sm font-semibold text-foreground">
                기관명 <span className="text-destructive">*</span>
              </label>
              <Input
                id="org"
                value={form.organization}
                onChange={(e) => updateField('organization', e.target.value)}
                placeholder="경기도 소속인 경우 실국명 입력"
                className={`h-12 bg-secondary/50 border-border/60 ${errors.organization ? 'border-destructive' : ''}`}
              />
              {errors.organization && <p className="text-xs text-destructive">{errors.organization}</p>}
            </div>

            {/* 3. 부서명 */}
            <div className="space-y-1.5">
              <label htmlFor="dept" className="text-sm font-semibold text-foreground">
                부서명 <span className="text-destructive">*</span>
              </label>
              <Input
                id="dept"
                value={form.department}
                onChange={(e) => updateField('department', e.target.value)}
                placeholder="예: AI데이터행정과, 영통구 건축과, 경영관리부 등"
                className={`h-12 bg-secondary/50 border-border/60 ${errors.department ? 'border-destructive' : ''}`}
              />
              {errors.department && <p className="text-xs text-destructive">{errors.department}</p>}
            </div>

            {/* 4. 직급(위) */}
            <div className="space-y-1.5">
              <label htmlFor="position" className="text-sm font-semibold text-foreground">직급(위)</label>
              <Input
                id="position"
                value={form.position}
                onChange={(e) => updateField('position', e.target.value)}
                placeholder="예: 데이터분석팀장, 행정6급, 대리 등"
                className="h-12 bg-secondary/50 border-border/60"
              />
            </div>

            {/* 5. 성함 */}
            <div className="space-y-1.5">
              <label htmlFor="name" className="text-sm font-semibold text-foreground">
                성함 <span className="text-destructive">*</span>
              </label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="성함을 입력해주세요"
                className={`h-12 bg-secondary/50 border-border/60 ${errors.name ? 'border-destructive' : ''}`}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>

            {/* 6. 차량 등록 */}
            <div className="space-y-1.5">
              <label htmlFor="car" className="text-sm font-semibold text-foreground">차량번호</label>
              <Input
                id="car"
                value={form.car_number}
                onChange={(e) => updateField('car_number', e.target.value)}
                placeholder="차량 등록이 필요하신 경우 기재해주세요"
                className="h-12 bg-secondary/50 border-border/60"
              />
            </div>

            {/* 7. 문의사항 */}
            <div className="space-y-1.5">
              <label htmlFor="inquiry" className="text-sm font-semibold text-foreground">문의사항</label>
              <Textarea
                id="inquiry"
                value={form.inquiry}
                onChange={(e) => updateField('inquiry', e.target.value)}
                placeholder="문의사항이 있으시면 입력해주세요"
                className="bg-secondary/50 border-border/60 min-h-[80px]"
              />
            </div>
          </div>

          {/* Signature */}
          <div className="bg-card rounded-xl shadow-card p-5 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-foreground">
                서명 <span className="text-destructive">*</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  sigCanvas.current?.clear();
                  if (errors.signature) setErrors({ ...errors, signature: '' });
                }}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RotateCcw className="w-3 h-3" />다시 쓰기
              </button>
            </div>
            <div
              ref={sigContainerRef}
              className={`border-2 border-dashed rounded-xl bg-white overflow-hidden relative ${errors.signature ? 'border-destructive' : 'border-border'}`}
            >
              <SignatureCanvas
                ref={sigCanvas}
                canvasProps={{
                  className: 'w-full cursor-crosshair touch-none',
                  style: { width: '100%', height: '200px' },
                }}
                backgroundColor="rgba(255,255,255,0)"
                onEnd={() => { if (errors.signature) setErrors({ ...errors, signature: '' }); }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground/40 pointer-events-none select-none">
                서명해주세요
              </span>
            </div>
            {errors.signature && <p className="text-xs text-destructive">{errors.signature}</p>}
          </div>

          {/* Privacy Consent */}
          <div className="bg-card rounded-xl shadow-card p-5 space-y-4 animate-fade-in">
            <label className="text-sm font-semibold text-foreground">
              개인정보 수집 및 이용 동의 <span className="text-destructive">*</span>
            </label>
            <div className="bg-secondary/50 rounded-lg p-4 text-sm text-muted-foreground space-y-2">
              <div>
                <span className="font-medium text-foreground">수집하는 개인정보 항목</span>
                <p>성함, 소속, 부서명, 직급, 차량번호</p>
              </div>
              <div>
                <span className="font-medium text-foreground">수집 및 이용 목적</span>
                <p>행사 참석 등록 및 주차 지원</p>
              </div>
              <div>
                <span className="font-medium text-foreground">보유 및 이용기간</span>
                <p className="text-primary font-medium">행사 이후 폐기</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">동의를 거부하실 수 있으나 참석 등록이 불가능합니다.</p>
            <div className="flex items-center gap-2">
              <Checkbox
                id="privacy"
                checked={form.privacy_agreed}
                onCheckedChange={(checked) => updateField('privacy_agreed', !!checked)}
                className={errors.privacy_agreed ? 'border-destructive' : ''}
              />
              <label htmlFor="privacy" className="text-sm font-medium text-foreground cursor-pointer">
                개인정보 수집 및 이용에 동의합니다.
              </label>
            </div>
            {errors.privacy_agreed && <p className="text-xs text-destructive">{errors.privacy_agreed}</p>}
          </div>

          {/* Submit */}
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="h-14 px-5 text-base rounded-xl"
              onClick={() => window.location.href = '/'}
            >
              홈
            </Button>
            <Button
              type="submit"
              className="flex-1 h-14 text-base font-bold rounded-xl shadow-md"
              disabled={submitting}
            >
              {submitting ? (
                <><Loader2 className="w-5 h-5 animate-spin" />등록 중...</>
              ) : '참석 등록'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AttendancePage;
