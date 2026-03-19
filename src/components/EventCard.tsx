import { Calendar, MapPin, Users, Hash } from 'lucide-react';

interface EventCardProps {
  event: {
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
  };
  onClick: () => void;
}

const statusStyles: Record<string, string> = {
  '예정': 'bg-secondary text-secondary-foreground',
  '진행중': 'bg-primary/10 text-primary',
  '완료': 'bg-muted text-muted-foreground',
};

const EventCard = ({ event, onClick }: EventCardProps) => {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-card rounded-2xl shadow-card p-5 space-y-3 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-bold text-foreground tracking-tight line-clamp-1">{event.title}</h3>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${statusStyles[event.status || '예정']}`}>
          {event.status || '예정'}
        </span>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" />
          {event.event_date}
        </span>
        <span className="inline-flex items-center gap-1">
          <MapPin className="w-3.5 h-3.5" />
          {event.location}
        </span>
        <span className="inline-flex items-center gap-1">
          <Users className="w-3.5 h-3.5" />
          <span className="tabular-nums">{event.attendee_count ?? 0}명</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Hash className="w-3.5 h-3.5" />
          {event.access_code}
        </span>
      </div>
    </button>
  );
};

export default EventCard;
