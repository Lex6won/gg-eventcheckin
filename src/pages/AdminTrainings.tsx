import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, GraduationCap } from 'lucide-react';
import TrainingCard from '@/components/TrainingCard';
import CreateTrainingDialog from '@/components/CreateTrainingDialog';
import { toast } from 'sonner';

interface Training {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string;
  end_time: string;
  location: string;
  organizer: string;
  instructor: string | null;
  access_code: string;
  status: string | null;
  created_by: string | null;
  capacity_enabled: boolean;
  capacity: number | null;
  allow_waitlist: boolean;
  show_car_number: boolean;
  confirmed_count?: number;
  waitlisted_count?: number;
}

const statusFilters = ['전체', '예정', '진행중', '완료'] as const;

const generateAccessCode = () => {
  let code = '';
  for (let i = 0; i < 6; i++) code += Math.floor(Math.random() * 10).toString();
  return code;
};

const AdminTrainings = () => {
  const { user, isSuperAdmin, roleLoading } = useAuth();
  const navigate = useNavigate();
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<string>('전체');

  const fetchTrainings = async () => {
    let query = supabase.from('trainings').select('*').order('event_date', { ascending: false });
    if (!isSuperAdmin && user) query = query.eq('created_by', user.id);
    const { data, error } = await query;
    if (error) { console.error(error); return; }

    const enriched = await Promise.all(
      (data || []).map(async (t) => {
        const [{ count: confirmed }, { count: waitlisted }] = await Promise.all([
          supabase.from('trainees').select('*', { count: 'exact', head: true })
            .eq('training_id', t.id).eq('status', 'confirmed'),
          supabase.from('trainees').select('*', { count: 'exact', head: true })
            .eq('training_id', t.id).eq('status', 'waitlisted'),
        ]);
        return { ...t, confirmed_count: confirmed ?? 0, waitlisted_count: waitlisted ?? 0 };
      })
    );
    setTrainings(enriched);
    setLoading(false);
  };

  useEffect(() => {
    if (user && !roleLoading) fetchTrainings();
  }, [user, isSuperAdmin, roleLoading]);

  const handleDuplicate = async (t: Training) => {
    if (!user) return;
    try {
      const { error } = await supabase.from('trainings').insert({
        title: `${t.title} (복사)`,
        description: t.description,
        event_date: t.event_date,
        start_time: t.start_time,
        end_time: t.end_time,
        location: t.location,
        organizer: t.organizer,
        instructor: t.instructor,
        show_car_number: t.show_car_number,
        capacity_enabled: t.capacity_enabled,
        capacity: t.capacity,
        allow_waitlist: t.allow_waitlist,
        access_code: generateAccessCode(),
        created_by: user.id,
        status: '예정',
      });
      if (error) throw error;
      toast.success('교육이 복제되었습니다.');
      fetchTrainings();
    } catch {
      toast.error('교육 복제에 실패했습니다.');
    }
  };

  const filtered = filter === '전체'
    ? trainings
    : trainings.filter((t) => (t.status || '예정') === filter);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">교육 관리</h1>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1" />새 교육
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto" role="tablist">
        {statusFilters.map((s) => (
          <button key={s} role="tab" aria-selected={filter === s} onClick={() => setFilter(s)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              filter === s ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}>
            {s}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <GraduationCap className="w-12 h-12 mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground">
            {filter === '전체' ? '등록된 교육이 없습니다.' : `'${filter}' 상태의 교육이 없습니다.`}
          </p>
          {filter === '전체' && (
            <Button variant="outline" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-1" />첫 교육 만들기
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((t) => (
            <TrainingCard key={t.id} training={t}
              onClick={() => navigate(`/admin/trainings/${t.id}`)}
              onDuplicate={() => handleDuplicate(t)} />
          ))}
        </div>
      )}

      <CreateTrainingDialog open={showCreate} onOpenChange={setShowCreate} onCreated={fetchTrainings} />
    </div>
  );
};

export default AdminTrainings;