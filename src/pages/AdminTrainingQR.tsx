import { useEffect, useState, useCallback } from 'react';
import { getPublicOrigin } from '@/lib/getPublicUrl';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Printer, Loader2, ClipboardList, ScanLine } from 'lucide-react';

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
  const registerUrl = `${getPublicOrigin()}/register/${training?.access_code}`;

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
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">{training?.title}</h1>
          <p className="text-base text-muted-foreground">
            {training?.event_date} &nbsp; {training?.start_time?.slice(0, 5)} ~ {training?.end_time?.slice(0, 5)}
          </p>
          <p className="text-base text-muted-foreground">{training?.location}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
          <div className="bg-white p-5 rounded-2xl shadow-lg border-2 border-primary/20 flex flex-col items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold bg-primary text-primary-foreground px-2 py-0.5 rounded">1단계</span>
              <span className="inline-flex items-center gap-1 text-sm font-semibold bg-primary/10 text-primary px-3 py-1 rounded-full">
                <ClipboardList className="w-3.5 h-3.5" />사전 신청
              </span>
            </div>
            <QRCodeSVG value={registerUrl} size={240} level="H" includeMargin />
            <p className="text-xs text-muted-foreground text-center break-all">{registerUrl}</p>
            <p className="text-xs text-foreground text-center font-medium">📢 교육 전 사전 안내 · 신청 현황 파악</p>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-lg border-2 border-success/20 flex flex-col items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold bg-success text-success-foreground px-2 py-0.5 rounded">2단계</span>
              <span className="inline-flex items-center gap-1 text-sm font-semibold bg-success/10 text-success px-3 py-1 rounded-full">
                <ScanLine className="w-3.5 h-3.5" />참석 확인
              </span>
            </div>
            <QRCodeSVG value={url} size={240} level="H" includeMargin />
            <p className="text-xs text-muted-foreground text-center break-all">{url}</p>
            <p className="text-xs text-foreground text-center font-medium">📍 교육 당일 입구 안내 · 서명으로 참석 확정</p>
          </div>
        </div>
        <div className="max-w-2xl text-center space-y-1">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">권장 운영 흐름</strong> · 1단계로 먼저 신청 받고, 교육 당일 2단계로 참석 확정
          </p>
          <p className="text-xs text-muted-foreground">
            사전 신청자는 사전 신청 시 입력한 이메일로 본인 확인 후 서명만 하면 됩니다.<br/>
            사전 신청 없이 온 분은 현장에서 정보 입력 + 서명으로 등록됩니다.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminTrainingQR;