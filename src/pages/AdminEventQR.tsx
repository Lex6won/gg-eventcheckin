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

  const attendUrl = `${window.location.origin}/attend/${event?.access_code}`;

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

      {/* Fullscreen QR display */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">
            {event?.title}
          </h1>
          <p className="text-lg text-muted-foreground">
            {event?.event_date} &nbsp; {event?.start_time?.slice(0, 5)} ~ {event?.end_time?.slice(0, 5)}
          </p>
          <p className="text-lg text-muted-foreground">{event?.location}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-lg border border-border/30">
          <QRCodeSVG value={attendUrl} size={320} level="H" includeMargin />
        </div>

        <div className="text-center space-y-2">
          <p className="text-xl md:text-2xl font-semibold text-primary">
            스마트폰으로 QR코드를 스캔해주세요
          </p>
          <p className="text-sm text-muted-foreground">
            카메라 앱으로 QR코드를 비추면 참석 등록 페이지로 이동합니다
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminEventQR;
