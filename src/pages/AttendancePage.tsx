import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle2, Calendar, MapPin, Clock, Loader2, Building2, RotateCcw, AlertCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import gyeonggiLogo from '@/assets/gyeonggi-logo.jpg';

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
}

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
};

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
    organization: '',
    name: '',
    position: '',
    phone: '',
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
      if (!code) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('access_code', code)
        .single();

      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      // Check if event is completed
      if (data.status === '완료') {
        setEvent(data);
        setExpired(true);
        setLoading(false);
        return;
      }

      setEvent(data);
      setLoading(false);
    };
    fetchEvent();
  }, [code]);

  useEffect(() => {
    if (!loading && event && !expired) {
      setTimeout(resizeCanvas, 100);
    }
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [loading, event, expired, resizeCanvas]);

  const handlePhoneChange = (value: string) => {
    setForm({ ...form, phone: formatPhone(value) });
    if (errors.phone) setErrors({ ...errors, phone: '' });
  };

  const updateField = (key: string, value: string) => {
    setForm({ ...form, [key]: value });
    if (errors[key]) setErrors({ ...errors, [key]: '' });
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.organization.trim()) newErrors.organization = '소속을 입력해주세요.';
    if (!form.name.trim()) newErrors.name = '이름을 입력해주세요.';
    if (!form.phone.trim()) {
      newErrors.phone = '연락처를 입력해주세요.';
    } else if (form.phone.replace(/\D/g, '').length < 10) {
      newErrors.phone = '올바른 연락처를 입력해주세요.';
    }
    if (!sigCanvas.current || sigCanvas.current.isEmpty()) {
      newErrors.signature = '서명을 해주세요.';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;

    if (!validate()) {
      toast.error('필수 항목을 확인해주세요.');
      return;
    }

    setSubmitting(true);

    try {
      // Check duplicate
      const { data: existing } = await supabase
        .from('attendees')
        .select('id')
        .eq('event_id', event.id)
        .eq('phone', form.phone)
        .maybeSingle();

      if (!existing) {
        const phoneDigits = form.phone.replace(/\D/g, '');
        const { data: existing2 } = await supabase
          .from('attendees')
          .select('id')
          .eq('event_id', event.id)
          .eq('phone', phoneDigits)
          .maybeSingle();
        if (existing2) {
          setAlreadyRegistered(true);
          setSubmitting(false);
          return;
        }
      }

      if (existing) {
        setAlreadyRegistered(true);
        setSubmitting(false);
        return;
      }

      // Save signature as base64 data URL (no storage upload needed)
      const signatureDataUrl = sigCanvas.current!.toDataURL('image/png');

      const { error: insertError } = await supabase.from('attendees').insert({
        event_id: event.id,
        organization: form.organization.trim(),
        name: form.name.trim(),
        position: form.position.trim() || null,
        phone: form.phone,
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
            접속코드를 다시 확인해주세요.<br />
            문제가 계속되면 행사 담당자에게 문의하세요.
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
            이 행사의 참석 등록 기간이 종료되었습니다.<br />
            문의사항은 행사 담당자에게 연락해주세요.
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
            동일한 연락처로 이미 참석 등록이 완료되었습니다.<br />
            문의사항은 행사 담당자에게 연락해주세요.
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
            참석 등록이 정상적으로 완료되었습니다.<br />
            즐거운 교육 되시기 바랍니다.
          </p>
          <Button
            className="mt-4 px-8 h-12 text-base rounded-xl"
            onClick={() => window.close()}
          >
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
            {event?.description && (
              <p className="text-sm text-muted-foreground mt-1.5">{event.description}</p>
            )}
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4 text-primary shrink-0" />
                <span>{event?.event_date}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4 text-primary shrink-0" />
                <span>{event?.start_time?.slice(0, 5)} ~ {event?.end_time?.slice(0, 5)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4 text-primary shrink-0" />
                <span>{event?.location}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Registration Form */}
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div className="bg-card rounded-xl shadow-card p-5 space-y-5 animate-fade-in">
            <p className="text-sm font-medium text-foreground">
              참석 확인을 위해 아래 정보를 입력해주세요.
            </p>

            <div className="space-y-1.5">
              <label htmlFor="org" className="text-sm font-semibold text-foreground">
                소속 <span className="text-destructive">*</span>
              </label>
              <Input
                id="org"
                value={form.organization}
                onChange={(e) => updateField('organization', e.target.value)}
                placeholder="예: 경기도청 AI프런티어정책과"
                className={`h-12 bg-secondary/50 border-border/60 ${errors.organization ? 'border-destructive' : ''}`}
                aria-invalid={!!errors.organization}
                aria-describedby={errors.organization ? 'org-error' : undefined}
              />
              {errors.organization && <p id="org-error" className="text-xs text-destructive">{errors.organization}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="position" className="text-sm font-semibold text-foreground">직책/직급</label>
              <Input
                id="position"
                value={form.position}
                onChange={(e) => updateField('position', e.target.value)}
                placeholder="예: 주무관"
                className="h-12 bg-secondary/50 border-border/60"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="name" className="text-sm font-semibold text-foreground">
                이름 <span className="text-destructive">*</span>
              </label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="이름을 입력해주세요"
                className={`h-12 bg-secondary/50 border-border/60 ${errors.name ? 'border-destructive' : ''}`}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'name-error' : undefined}
              />
              {errors.name && <p id="name-error" className="text-xs text-destructive">{errors.name}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="phone" className="text-sm font-semibold text-foreground">
                연락처 <span className="text-destructive">*</span>
              </label>
              <Input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                placeholder="010-0000-0000"
                className={`h-12 bg-secondary/50 border-border/60 ${errors.phone ? 'border-destructive' : ''}`}
                aria-invalid={!!errors.phone}
                aria-describedby={errors.phone ? 'phone-error' : undefined}
              />
              {errors.phone && <p id="phone-error" className="text-xs text-destructive">{errors.phone}</p>}
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
                aria-label="서명 다시 쓰기"
              >
                <RotateCcw className="w-3 h-3" />
                다시 쓰기
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
                onEnd={() => {
                  if (errors.signature) setErrors({ ...errors, signature: '' });
                }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground/40 pointer-events-none select-none">
                서명해주세요
              </span>
            </div>
            {errors.signature && <p className="text-xs text-destructive">{errors.signature}</p>}
          </div>

          {/* Submit + Home */}
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="h-14 px-5 text-base rounded-xl"
              onClick={() => window.location.href = '/'}
              aria-label="홈으로 돌아가기"
            >
              홈
            </Button>
            <Button
              type="submit"
              className="flex-1 h-14 text-base font-bold rounded-xl shadow-md"
              disabled={submitting}
              aria-label="참석 등록하기"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  등록 중...
                </>
              ) : (
                '참석 등록'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AttendancePage;
