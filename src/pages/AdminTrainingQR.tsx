import { useEffect, useState, useCallback } from 'react';
import { getPublicOrigin } from '@/lib/getPublicUrl';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Printer, Loader2 } from 'lucide-react';

interface T {
  id: string; title: string; event_date: string; start_time: string;
  end_time: string; location: string; access_code: string;
}

const AdminTrainingQR = () => {
  const { trainingId } = useParams<{ trainingId: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [training, setTraining] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTraining = useCallback(async () => {
    const { data, error } = await supabase
      .from('trainings')
      .select('id, title, event_date, start_time, end_time, location, access_code')
      .eq('id', trainingId!).single();
    if (error) { navigate('/admin/trainings'); return; }
    setTraining(data);
    setLoading(false);
  }, [trainingId, navigate]);

  useEffect(() => { if (!authLoading && !user) navigate('/admin/login'); }, [user, authLoading, navigate]);
  useEffect(() => { if (user) fetchTraining(); }, [user, fetchTraining]);

  const url = `${getPublicOrigin()}/training/${training?.access_code}`;

  if (loading || authLoading) {
    return <div className="flex items-center justify-center min-h-screen bg-white"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="print:hidden flex items-center justify-between px-4 py-3 border-b border-border/50">
        <button onClick={() => navigate(`/admin/trainings/${trainingId}`)}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />교육 상세로
        </button>
        <Button size="sm" variant="outline" onClick={() => window.print()}>
          <Printer className="w-4 h-4 mr-1" />인쇄
        </Button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">{training?.title}</h1>
          <p className="text-lg text-muted-foreground">
            {training?.event_date} &nbsp; {training?.start_time?.slice(0, 5)} ~ {training?.end_time?.slice(0, 5)}
          </p>
          <p className="text-lg text-muted-foreground">{training?.location}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-lg border border-border/30">
          <QRCodeSVG value={url} size={320} level="H" includeMargin />
        </div>
        <div className="text-center space-y-2">
          <p className="text-xl md:text-2xl font-semibold text-primary">스마트폰으로 QR코드를 스캔해주세요</p>
          <p className="text-sm text-muted-foreground">카메라 앱으로 QR코드를 비추면 교육 신청 페이지로 이동합니다</p>
        </div>
      </div>
    </div>
  );
};

export default AdminTrainingQR;