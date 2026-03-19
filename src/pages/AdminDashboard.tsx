import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Plus, LogOut, Calendar, Users, Loader2 } from 'lucide-react';
import EventCard from '@/components/EventCard';
import CreateEventDialog from '@/components/CreateEventDialog';

interface Event {
  id: string;
  title: string;
  event_date: string;
  start_time: string;
  end_time: string;
  location: string;
  organizer: string;
  access_code: string;
  status: string | null;
  attendee_count?: number;
}

const AdminDashboard = () => {
  const { user, signOut, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/admin/login');
    }
  }, [user, authLoading, navigate]);

  const fetchEvents = async () => {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    // Get attendee counts
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
    if (user) fetchEvents();
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/admin/login');
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-svh bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border/50 sticky top-0 z-10 no-print">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            <h1 className="font-bold text-foreground">행사 관리</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-1" />
              새 행사
            </Button>
            <Button size="sm" variant="ghost" onClick={handleSignOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {events.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <Users className="w-12 h-12 mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground">등록된 행사가 없습니다.</p>
            <Button variant="outline" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-1" />
              첫 행사 만들기
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onClick={() => navigate(`/admin/events/${event.id}`)}
              />
            ))}
          </div>
        )}
      </main>

      <CreateEventDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={fetchEvents}
      />
    </div>
  );
};

export default AdminDashboard;
