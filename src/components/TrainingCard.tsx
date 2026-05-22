import { Calendar, MapPin, Users, Hash, Copy, ClipboardCopy, UserCheck, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface TrainingCardProps {
  training: {
    id: string;
    title: string;
    event_date: string;
    location: string;
    access_code: string;
    status: string | null;
    capacity_enabled: boolean;
    capacity: number | null;
    confirmed_count?: number;
    waitlisted_count?: number;
    pre_registration_close_at?: string | null;
  };
  onClick: () => void;
  onDuplicate?: () => void;
}

const statusStyles: Record<string, string> = {
  '예정': 'bg-primary/10 text-primary',
  '진행중': 'bg-success/10 text-success',
  '완료': 'bg-muted text-muted-foreground',
  '사전신청 마감': 'bg-warning/10 text-warning',
};

const TrainingCard = ({ training, onClick, onDuplicate }: TrainingCardProps) => {
  const handleCopyCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(training.access_code);
    toast.success(`접속코드 ${training.access_code} 가 복사되었습니다.`);
  };

  const confirmed = training.confirmed_count ?? 0;
  const waitlisted = training.waitlisted_count ?? 0;
  const status = training.status || '예정';
  const preRegClosed =
    status !== '완료' &&
    !!training.pre_registration_close_at &&
    new Date(training.pre_registration_close_at).getTime() <= Date.now();
  const displayStatus = preRegClosed && status === '예정' ? '사전신청 마감' : status;

  return (
    <div className="bg-card rounded-xl shadow-card border border-border/40 hover:shadow-md transition-all animate-fade-in">
      <button
        onClick={onClick}
        className="w-full text-left p-5 space-y-3"
        aria-label={`${training.title} 교육 상세 보기`}
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-foreground tracking-tight line-clamp-1">{training.title}</h3>
          <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full whitespace-nowrap ${statusStyles[displayStatus] || statusStyles['예정']}`}>
            {displayStatus}
          </span>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {training.event_date}
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" />
            {training.location}
          </span>
          <span className="inline-flex items-center gap-1">
            <UserCheck className="w-3.5 h-3.5" />
            <span className="tabular-nums font-medium">
              {training.capacity_enabled && training.capacity
                ? `${confirmed} / ${training.capacity}명`
                : `${confirmed}명`}
            </span>
          </span>
          {waitlisted > 0 && (
            <span className="inline-flex items-center gap-1 text-warning">
              <Clock className="w-3.5 h-3.5" />
              <span className="tabular-nums font-medium">대기 {waitlisted}</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1 font-mono">
            <Hash className="w-3.5 h-3.5" />
            {training.access_code}
          </span>
        </div>
      </button>

      <div className="px-5 pb-4 pt-0 flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={handleCopyCode}
          className="text-xs text-muted-foreground hover:text-foreground h-7 px-2"
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
          >
            <Copy className="w-3 h-3 mr-1" />
            복제
          </Button>
        )}
      </div>
    </div>
  );
};

export default TrainingCard;