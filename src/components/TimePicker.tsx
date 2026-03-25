import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimePickerProps {
  value: string; // "HH:mm" 24h format
  onChange: (value: string) => void;
  placeholder?: string;
}

const hours12 = Array.from({ length: 12 }, (_, i) => i + 1); // 1~12
const minutes = Array.from({ length: 7 }, (_, i) => i * 10); // 0,10,20,30,40,50,60 → 60 treated as 0 of next hour

const TimePicker = ({ value, onChange, placeholder = '시간 선택' }: TimePickerProps) => {
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<'오전' | '오후'>('오전');
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [selectedMinute, setSelectedMinute] = useState<number | null>(null);

  // Parse initial value
  useEffect(() => {
    if (!value) return;
    const [hStr, mStr] = value.split(':');
    const h24 = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (isNaN(h24)) return;

    if (h24 === 0) {
      setPeriod('오전');
      setSelectedHour(12);
    } else if (h24 < 12) {
      setPeriod('오전');
      setSelectedHour(h24);
    } else if (h24 === 12) {
      setPeriod('오후');
      setSelectedHour(12);
    } else {
      setPeriod('오후');
      setSelectedHour(h24 - 12);
    }
    // Round minute to nearest 10
    const roundedMin = Math.round(m / 10) * 10;
    setSelectedMinute(roundedMin >= 60 ? 0 : roundedMin);
  }, []);

  const to24Hour = (h12: number, p: '오전' | '오후'): number => {
    if (p === '오전') return h12 === 12 ? 0 : h12;
    return h12 === 12 ? 12 : h12 + 12;
  };

  const applyTime = (h: number, m: number, p: '오전' | '오후') => {
    let h24 = to24Hour(h, p);
    let finalMin = m;
    if (m === 60) {
      finalMin = 0;
      h24 = (h24 + 1) % 24;
    }
    const timeStr = `${String(h24).padStart(2, '0')}:${String(finalMin).padStart(2, '0')}`;
    onChange(timeStr);
    setOpen(false);
  };

  const handleHourClick = (h: number) => {
    setSelectedHour(h);
    if (selectedMinute !== null) {
      applyTime(h, selectedMinute, period);
    }
  };

  const handleMinuteClick = (m: number) => {
    setSelectedMinute(m);
    if (selectedHour !== null) {
      applyTime(selectedHour, m, period);
    }
  };

  const handlePeriodChange = (p: '오전' | '오후') => {
    setPeriod(p);
    if (selectedHour !== null && selectedMinute !== null) {
      applyTime(selectedHour, selectedMinute, p);
    }
  };

  const displayValue = value
    ? (() => {
        const [hStr, mStr] = value.split(':');
        const h24 = parseInt(hStr, 10);
        const m = parseInt(mStr, 10);
        const p = h24 < 12 ? '오전' : '오후';
        const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
        return `${p} ${h12}시 ${String(m).padStart(2, '0')}분`;
      })()
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal h-10",
            !value && "text-muted-foreground"
          )}
        >
          <Clock className="mr-2 h-4 w-4" />
          {displayValue || placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3 pointer-events-auto" align="start">
        <div className="space-y-3">
          {/* AM/PM */}
          <div className="flex gap-1">
            {(['오전', '오후'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handlePeriodChange(p)}
                className={cn(
                  "flex-1 py-1.5 rounded-md text-sm font-medium transition-colors",
                  period === p
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                )}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Hours */}
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">시</p>
            <div className="grid grid-cols-6 gap-1">
              {hours12.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => handleHourClick(h)}
                  className={cn(
                    "w-9 h-8 rounded text-sm transition-colors",
                    selectedHour === h
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent text-foreground"
                  )}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>

          {/* Minutes */}
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">분</p>
            <div className="grid grid-cols-7 gap-1">
              {minutes.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleMinuteClick(m)}
                  className={cn(
                    "w-9 h-8 rounded text-sm transition-colors",
                    selectedMinute === m
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent text-foreground"
                  )}
                >
                  {String(m).padStart(2, '0')}
                </button>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default TimePicker;
