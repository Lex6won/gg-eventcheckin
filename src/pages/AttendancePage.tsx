import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle2, Calendar, MapPin, Clock, Loader2 } from 'lucide-react';
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

const AttendancePage = () => {
  const { accessCode } = useParams<{ accessCode: string }>();
  const navigate = useNavigate();
  const sigCanvas = useRef<SignatureCanvas>(null);

  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({
    organization: '',
    name: '',
    position: '',
    phone: '',
  });

  useEffect(() => {
    const fetchEvent = async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('access_code', accessCode ?? '')
        .single();

      if (error || !data) {
        toast.error('유효하지 않은 접속코드입니다.');
        navigate('/');
        return;
      }
      setEvent(data);
      setLoading(false);
    };
    fetchEvent();
  }, [accessCode, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;

    if (!form.organization || !form.name || !form.phone) {
      toast.error('필수 정보를 모두 입력해주세요.');
      return;
    }

    if (!sigCanvas.current || sigCanvas.current.isEmpty()) {
      toast.error('서명을 입력해주세요.');
      return;
    }

    setSubmitting(true);

    try {
      // Upload signature
      const dataUrl = sigCanvas.current.toDataURL('image/png');
      const blob = await (await fetch(dataUrl)).blob();
      const fileName = `${event.id}/${Date.now()}_${form.name}.png`;

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
        organization: form.organization,
        name: form.name,
        position: form.position || null,
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

  if (success) {
    return (
      <div className="min-h-svh bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-success/10 animate-check-bounce">
            <CheckCircle2 className="w-10 h-10 text-success" />
          </div>
          <h2 className="text-xl font-bold text-foreground">참석 등록 완료</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            참석 등록이 정상적으로 완료되었습니다.<br />
            즐거운 교육 되시기 바랍니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-background p-4 md:p-8 flex flex-col items-center">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-2xl shadow-card overflow-hidden">
          {/* Event Header */}
          <header className="p-6 border-b border-border/50">
            <h1 className="text-xl font-bold text-foreground tracking-tight">
              {event?.title}
            </h1>
            {event?.description && (
              <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
            )}
            <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {event?.event_date}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {event?.start_time?.slice(0, 5)} ~ {event?.end_time?.slice(0, 5)}
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {event?.location}
              </span>
            </div>
          </header>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            <p className="text-sm text-muted-foreground">
              참석 확인을 위해 정보를 입력해주세요.
            </p>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">소속 기관 *</label>
              <Input
                value={form.organization}
                onChange={(e) => setForm({ ...form, organization: e.target.value })}
                placeholder="예: OO시청 정보통신과"
                className="bg-secondary/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">성함 *</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="bg-secondary/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">직급</label>
                <Input
                  value={form.position}
                  onChange={(e) => setForm({ ...form, position: e.target.value })}
                  className="bg-secondary/50"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">연락처 *</label>
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="010-0000-0000"
                className="bg-secondary/50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">참석자 서명 *</label>
              <div className="border-2 border-dashed border-border rounded-lg bg-secondary/30 overflow-hidden">
                <SignatureCanvas
                  ref={sigCanvas}
                  canvasProps={{
                    className: 'w-full h-40 cursor-crosshair',
                    style: { width: '100%', height: '160px' },
                  }}
                  backgroundColor="transparent"
                />
              </div>
              <button
                type="button"
                onClick={() => sigCanvas.current?.clear()}
                className="text-xs text-muted-foreground underline hover:text-foreground transition-colors"
              >
                서명 지우기
              </button>
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold"
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                '참석 등록 완료'
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AttendancePage;
