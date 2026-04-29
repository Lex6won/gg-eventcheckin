import { useEffect, useState, useCallback } from 'react';
import { getPublicOrigin } from '@/lib/getPublicUrl';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Printer, Loader2 } from 'lucide-react';

interface EventData {
  id: string;
  title: string;
  event_date: string;
  start_time: string;
  end_time: string;
  location: string;
  access_code: string;
}

const AdminEventQR = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchEvent = useCallback(async () => {
    const { data, error } = await supabase
      .from('events')
      .select('id, title, event_date, start_time, end_time, location, access_code')
      .eq('id', eventId!)
      .single();
    if (error) {
      navigate('/admin/events');
      return;
    }
    setEvent(data);
    setLoading(false);
  }, [eventId, navigate]);

  useEffect(() => {
    if (!authLoading && !user) navigate('/admin/login');
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchEvent();
  }, [user, fetchEvent]);

  const attendUrl = `${getPublicOrigin()}/attend/${event?.access_code}`;
  const registerUrl = `${getPublicOrigin()}/register/${event?.access_code}`;

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Top bar (hidden on print) */}
      <div className="print:hidden flex items-center justify-between px-4 py-3 border-b border-border/50">
        <button
          onClick={() => navigate(`/admin/events/${eventId}`)}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          행사 상세로 돌아가기
        </button>
        <Button size="sm" variant="outline" onClick={() => window.print()}>
          <Printer className="w-4 h-4 mr-1" /> 인쇄
        </Button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
            {event?.title}
          </h1>
          <p className="text-base text-muted-foreground">
            {event?.event_date} &nbsp; {event?.start_time?.slice(0, 5)} ~ {event?.end_time?.slice(0, 5)}
          </p>
          <p className="text-base text-muted-foreground">{event?.location}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
          <div className="bg-white p-5 rounded-2xl shadow-lg border border-border/30 flex flex-col items-center gap-3">
            <span className="text-sm font-semibold bg-primary/10 text-primary px-3 py-1 rounded-full">사전 신청</span>
            <QRCodeSVG value={registerUrl} size={240} level="H" includeMargin />
            <p className="text-xs text-muted-foreground text-center break-all">{registerUrl}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-lg border border-border/30 flex flex-col items-center gap-3">
            <span className="text-sm font-semibold bg-success/10 text-success px-3 py-1 rounded-full">현장 체크인</span>
            <QRCodeSVG value={attendUrl} size={240} level="H" includeMargin />
            <p className="text-xs text-muted-foreground text-center break-all">{attendUrl}</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground text-center">
          사전 신청은 행사 전, 현장 체크인은 행사 당일 사용해주세요.
        </p>
      </div>
    </div>
  );
};

export default AdminEventQR;
