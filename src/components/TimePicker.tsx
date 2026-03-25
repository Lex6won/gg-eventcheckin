import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const hours12 = Array.from({ length: 12 }, (_, i) => i + 1);
const minutes = [0, 10, 20, 30, 40, 50];

const TimePicker = ({ value, onChange, placeholder = '시간 선택' }: TimePickerProps) => {
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<'오전' | '오후'>('오전');
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [selectedMinute, setSelectedMinute] = useState<number | null>(null);
  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!value) return;
    const [hStr, mStr] = value.split(':');
    const h24 = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (isNaN(h24)) return;

    if (h24 === 0) { setPeriod('오전'); setSelectedHour(12); }
    else if (h24 < 12) { setPeriod('오전'); setSelectedHour(h24); }
    else if (h24 === 12) { setPeriod('오후'); setSelectedHour(12); }
    else { setPeriod('오후'); setSelectedHour(h24 - 12); }

    const roundedMin = Math.round(m / 10) * 10;
    setSelectedMinute(roundedMin >= 60 ? 50 : roundedMin);
  }, []);

  // Scroll to selected item when opened
  useEffect(() => {
    if (!open) return;
    setTimeout(() => {
      if (selectedHour !== null && hourRef.current) {
        const el = hourRef.current.querySelector(`[data-hour="${selectedHour}"]`);
        el?.scrollIntoView({ block: 'center' });
      }
      if (selectedMinute !== null && minuteRef.current) {
        const el = minuteRef.current.querySelector(`[data-minute="${selectedMinute}"]`);
        el?.scrollIntoView({ block: 'center' });
      }
    }, 50);
  }, [open]);

  const to24Hour = (h12: number, p: '오전' | '오후'): number => {
    if (p === '오전') return h12 === 12 ? 0 : h12;
    return h12 === 12 ? 12 : h12 + 12;
  };

  const buildTimeStr = (h: number, m: number, p: '오전' | '오후') => {
    const h24 = to24Hour(h, p);
    return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const handleHourClick = (h: number) => {
    setSelectedHour(h);
    if (selectedMinute !== null) {
      onChange(buildTimeStr(h, selectedMinute, period));
    }
  };

  const handleMinuteClick = (m: number) => {
    setSelectedMinute(m);
    if (selectedHour !== null) {
      onChange(buildTimeStr(selectedHour, m, period));
      setOpen(false);
    }
  };

  const handlePeriodChange = (p: '오전' | '오후') => {
    setPeriod(p);
    if (selectedHour !== null && selectedMinute !== null) {
      onChange(buildTimeStr(selectedHour, selectedMinute, p));
    }
  };

  const displayValue = value
    ? (() => {
        const [hStr, mStr] = value.split(':');
        const h24 = parseInt(hStr, 10);
        const m = parseInt(mStr, 10);
        const p = h24 < 12 ? '오전' : '오후';
        const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
        return `${p} ${h12}:${String(m).padStart(2, '0')}`;
      })()
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal h-10 text-xs px-2",
            !value && "text-muted-foreground"
          )}
        >
          <Clock className="mr-1 h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{displayValue || placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0 pointer-events-auto" align="start" sideOffset={4}>
        <div className="flex flex-col">
          {/* AM/PM */}
          <div className="flex border-b border-border">
            {(['오전', '오후'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handlePeriodChange(p)}
                className={cn(
                  "flex-1 py-2 text-sm font-medium transition-colors",
                  period === p
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent"
                )}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Scrollable columns */}
          <div className="flex divide-x divide-border" style={{ height: '200px' }}>
            {/* Hours */}
            <div className="flex-1 flex flex-col">
              <p className="text-[10px] text-muted-foreground text-center py-1 border-b border-border">시</p>
              <ScrollArea className="flex-1">
                <div ref={hourRef} className="py-1">
                  {hours12.map((h) => (
                    <button
                      key={h}
                      type="button"
                      data-hour={h}
                      onClick={() => handleHourClick(h)}
                      className={cn(
                        "w-full py-2 text-sm text-center transition-colors",
                        selectedHour === h
                          ? "bg-primary text-primary-foreground font-medium"
                          : "text-foreground hover:bg-accent"
                      )}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Minutes */}
            <div className="flex-1 flex flex-col">
              <p className="text-[10px] text-muted-foreground text-center py-1 border-b border-border">분</p>
              <ScrollArea className="flex-1">
                <div ref={minuteRef} className="py-1">
                  {minutes.map((m) => (
                    <button
                      key={m}
                      type="button"
                      data-minute={m}
                      onClick={() => handleMinuteClick(m)}
                      className={cn(
                        "w-full py-2 text-sm text-center transition-colors",
                        selectedMinute === m
                          ? "bg-primary text-primary-foreground font-medium"
                          : "text-foreground hover:bg-accent"
                      )}
                    >
                      {String(m).padStart(2, '0')}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default TimePicker;
