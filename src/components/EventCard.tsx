import { Calendar, MapPin, Users, Hash, Copy, ClipboardCopy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

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
  onDuplicate?: () => void;
}

const statusStyles: Record<string, string> = {
  '예정': 'bg-primary/10 text-primary',
  '진행중': 'bg-success/10 text-success',
  '완료': 'bg-muted text-muted-foreground',
};

const EventCard = ({ event, onClick, onDuplicate }: EventCardProps) => {
  const handleCopyCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(event.access_code);
    toast.success(`접속코드 ${event.access_code} 가 복사되었습니다.`);
  };

  return (
    <div className="bg-card rounded-xl shadow-card border border-border/40 hover:shadow-md transition-all animate-fade-in">
      <button
        onClick={onClick}
        className="w-full text-left p-5 space-y-3"
        aria-label={`${event.title} 행사 상세 보기`}
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-foreground tracking-tight line-clamp-1">{event.title}</h3>
          <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full whitespace-nowrap ${statusStyles[event.status || '예정']}`}>
            {event.status || '예정'}
          </span>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
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
            <span className="tabular-nums font-medium">{event.attendee_count ?? 0}명</span>
          </span>
          <span className="inline-flex items-center gap-1 font-mono">
            <Hash className="w-3.5 h-3.5" />
            {event.access_code}
          </span>
        </div>
      </button>

      <div className="px-5 pb-4 pt-0 flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={handleCopyCode}
          className="text-xs text-muted-foreground hover:text-foreground h-7 px-2"
          aria-label={`접속코드 ${event.access_code} 복사`}
        >
          <ClipboardCopy className="w-3 h-3 mr-1" />
          코드 복사
        </Button>
        {onDuplicate && (
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            className="text-xs text-muted-foreground hover:text-foreground h-7 px-2"
            aria-label={`${event.title} 복제하기`}
          >
            <Copy className="w-3 h-3 mr-1" />
            복제
          </Button>
        )}
      </div>
    </div>
  );
};

export default EventCard;
