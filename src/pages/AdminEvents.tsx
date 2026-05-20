import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, Calendar } from 'lucide-react';
import EventCard from '@/components/EventCard';
import CreateEventDialog from '@/components/CreateEventDialog';
import { toast } from 'sonner';

interface Event {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string;
  end_time: string;
  location: string;
  organizer: string;
  access_code: string;
  status: string | null;
  created_by: string | null;
  attendee_count?: number;
}

const statusFilters = ['전체', '예정', '진행중', '완료'] as const;

const generateAccessCode = () => {
  const chars = '0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
};

const AdminEvents = () => {
  const { user, isSuperAdmin, roleLoading } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<string>('전체');

  const fetchEvents = async () => {
    let query = supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: false });

    // Regular admins only see their own events
    if (!isSuperAdmin && user) {
      query = query.eq('created_by', user.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error(error);
      return;
    }

    const eventsWithCounts = await Promise.all(
      (data || []).map(async (event) => {
        const { count } = await supabase
          .from('attendees')
          .select('*', { count: 'exact', head: true })
          .eq('event_id', event.id);
        return { ...event, attendee_count: count ?? 0 };
      })
    );

    setEvents(eventsWithCounts);
    setLoading(false);
  };

  useEffect(() => {
    if (user && !roleLoading) fetchEvents();
  }, [user, isSuperAdmin, roleLoading]);

  const handleDuplicate = async (event: Event) => {
    if (!user) return;
    try {
      const { error } = await supabase.from('events').insert({
        title: `${event.title} (복사)`,
        description: event.description,
        event_date: event.event_date,
        start_time: event.start_time,
        end_time: event.end_time,
        location: event.location,
        organizer: event.organizer,
        access_code: generateAccessCode(),
        created_by: user.id,
        status: '예정',
      });
      if (error) throw error;
      toast.success('행사가 복제되었습니다.');
      fetchEvents();
    } catch {
      toast.error('행사 복제에 실패했습니다.');
    }
  };

  const filtered = filter === '전체'
    ? events
    : events.filter((e) => (e.status || '예정') === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">행사 관리</h1>
        <Button size="sm" onClick={() => setShowCreate(true)} aria-label="새 행사 만들기">
          <Plus className="w-4 h-4 mr-1" />
          새 행사
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label="행사 상태 필터">
        {statusFilters.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={filter === s}
            onClick={() => setFilter(s)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              filter === s
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <Calendar className="w-12 h-12 mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground">
            {filter === '전체' ? '등록된 행사가 없습니다.' : `'${filter}' 상태의 행사가 없습니다.`}
          </p>
          {filter === '전체' && (
            <Button variant="outline" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-1" />
              첫 행사 만들기
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onClick={() => navigate(`/admin/events/${event.id}`)}
              onDuplicate={() => handleDuplicate(event)}
            />
          ))}
        </div>
      )}

      <CreateEventDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={fetchEvents}
      />
    </div>
  );
};

export default AdminEvents;
