import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle2, Calendar, MapPin, Clock, Loader2, Building2, RotateCcw, AlertCircle } from 'lucide-react';
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
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [form, setForm] = useState({
    organization: '',
    name: '',
    position: '',
    phone: '',
  });

  // Resize signature canvas to match container
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
      setEvent(data);
      setLoading(false);
    };
    fetchEvent();
  }, [code]);

  useEffect(() => {
    if (!loading && event) {
      setTimeout(resizeCanvas, 100);
    }
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [loading, event, resizeCanvas]);

  const handlePhoneChange = (value: string) => {
    setForm({ ...form, phone: formatPhone(value) });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;

    if (!form.organization.trim() || !form.name.trim() || !form.phone.trim()) {
      toast.error('필수 정보를 모두 입력해주세요.');
      return;
    }

    if (!sigCanvas.current || sigCanvas.current.isEmpty()) {
      toast.error('서명을 입력해주세요.');
      return;
    }

    setSubmitting(true);

    try {
      // Check duplicate registration
      const phoneDigits = form.phone.replace(/\D/g, '');
      const { data: existing } = await supabase
        .from('attendees')
        .select('id')
        .eq('event_id', event.id)
        .eq('phone', form.phone)
        .maybeSingle();

      if (!existing) {
        // Also check without hyphens
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

      // Upload signature
      const dataUrl = sigCanvas.current.toDataURL('image/png');
      const blob = await (await fetch(dataUrl)).blob();
      const fileName = `${event.id}/${Date.now()}_${form.name.trim()}.png`;

      const { error: uploadError } = await supabase.storage
        .from('signatures')
        .upload(fileName, blob, { contentType: 'image/png' });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('signatures')
        .getPublicUrl(fileName);

      // Insert attendee
      const { error: insertError } = await supabase.from('attendees').insert({
        event_id: event.id,
        organization: form.organization.trim(),
        name: form.name.trim(),
        position: form.position.trim() || null,
        phone: form.phone,
        signature_url: urlData.publicUrl,
      });

      if (insertError) throw insertError;

      setSuccess(true);
    } catch (err) {
      console.error(err);
      toast.error('참석 등록 중 오류가 발생했습니다.');
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
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-destructive/10">
            <AlertCircle className="w-10 h-10 text-destructive" />
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

  if (alreadyRegistered) {
    return (
      <div className="min-h-svh bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-500/10">
            <AlertCircle className="w-10 h-10 text-amber-500" />
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
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-success/10 animate-check-bounce">
            <CheckCircle2 className="w-10 h-10 text-success" />
          </div>
          <h2 className="text-xl font-bold text-foreground">참석 등록이 완료되었습니다 ✓</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            참석 등록이 정상적으로 완료되었습니다.<br />
            즐거운 교육 되시기 바랍니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-muted/30 pb-8">
      {/* Logo placeholder */}
      <div className="bg-primary text-primary-foreground px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary-foreground/20 flex items-center justify-center shrink-0">
          <Building2 className="w-6 h-6" />
        </div>
        <span className="text-sm font-medium opacity-90">행사 참석 확인 시스템</span>
      </div>

      <div className="px-4 pt-5 max-w-lg mx-auto">
        {/* Event Info Header */}
        <div className="bg-card rounded-2xl shadow-card overflow-hidden mb-5">
          <div className="p-5">
            <h1 className="text-lg font-bold text-foreground leading-snug">
              {event?.title}
            </h1>
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
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="bg-card rounded-2xl shadow-card p-5 space-y-5">
            <p className="text-sm font-medium text-foreground">
              참석 확인을 위해 아래 정보를 입력해주세요.
            </p>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">
                소속 <span className="text-destructive">*</span>
              </label>
              <Input
                value={form.organization}
                onChange={(e) => setForm({ ...form, organization: e.target.value })}
                placeholder="예: 경기도청 AI프런티어정책과"
                className="h-12 text-base bg-secondary/50 border-border/60"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">
                직급
              </label>
              <Input
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                placeholder="예: 주무관"
                className="h-12 text-base bg-secondary/50 border-border/60"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">
                이름 <span className="text-destructive">*</span>
              </label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="이름을 입력해주세요"
                className="h-12 text-base bg-secondary/50 border-border/60"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">
                연락처 <span className="text-destructive">*</span>
              </label>
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                placeholder="010-0000-0000"
                className="h-12 text-base bg-secondary/50 border-border/60"
              />
            </div>
          </div>

          {/* Signature Section */}
          <div className="bg-card rounded-2xl shadow-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-foreground">
                서명 <span className="text-destructive">*</span>
              </label>
              <button
                type="button"
                onClick={() => sigCanvas.current?.clear()}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                다시 쓰기
              </button>
            </div>
            <div
              ref={sigContainerRef}
              className="border-2 border-dashed border-border rounded-xl bg-white overflow-hidden relative"
            >
              <SignatureCanvas
                ref={sigCanvas}
                canvasProps={{
                  className: 'w-full cursor-crosshair touch-none',
                  style: { width: '100%', height: '200px' },
                }}
                backgroundColor="rgba(255,255,255,0)"
              />
              <span className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground/40 pointer-events-none select-none">
                서명해주세요
              </span>
            </div>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full h-14 text-base font-bold rounded-xl shadow-lg"
            disabled={submitting}
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
        </form>
      </div>
    </div>
  );
};

export default AttendancePage;
