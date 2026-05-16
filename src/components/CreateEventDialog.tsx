import { useState, useRef } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import TimePicker from '@/components/TimePicker';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, ImagePlus, X, CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface CreateEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const generateAccessCode = () => {
  const chars = '0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

const CreateEventDialog = ({ open, onOpenChange, onCreated }: CreateEventDialogProps) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterPreview, setPosterPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    event_date: '',
    start_time: '',
    end_time: '',
    location: '',
    organizer: '',
    show_car_number: false,
    recheck_enabled: false,
  });

  const handlePosterSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('이미지 파일만 업로드 가능합니다.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('파일 크기는 5MB 이하로 업로드해주세요.');
      return;
    }
    setPosterFile(file);
    setPosterPreview(URL.createObjectURL(file));
  };

  const removePoster = () => {
    setPosterFile(null);
    if (posterPreview) URL.revokeObjectURL(posterPreview);
    setPosterPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      let poster_url: string | null = null;

      if (posterFile) {
        const ext = posterFile.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('event-posters')
          .upload(fileName, posterFile, { contentType: posterFile.type });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('event-posters').getPublicUrl(fileName);
        poster_url = urlData.publicUrl;
      }

      const { error } = await supabase.from('events').insert({
        ...form,
        poster_url,
        access_code: generateAccessCode(),
        created_by: user.id,
      });

      if (error) throw error;

      toast.success('행사가 생성되었습니다.');
      onOpenChange(false);
      setForm({ title: '', description: '', event_date: '', start_time: '', end_time: '', location: '', organizer: '', show_car_number: false, recheck_enabled: false });
      removePoster();
      onCreated();
    } catch (err) {
      console.error(err);
      toast.error('행사 생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const update = (key: string, value: string) => setForm({ ...form, [key]: value });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>새 행사 만들기</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">행사명 *</label>
            <Input value={form.title} onChange={(e) => update('title', e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">행사 설명</label>
            <Input value={form.description} onChange={(e) => update('description', e.target.value)} />
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">날짜 *</label>
              <Popover open={dateOpen} onOpenChange={setDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal h-10",
                      !form.event_date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.event_date
                      ? format(new Date(form.event_date + 'T00:00:00'), 'yyyy년 MM월 dd일', { locale: ko })
                      : '날짜 선택'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.event_date ? new Date(form.event_date + 'T00:00:00') : undefined}
                    onSelect={(date) => {
                      if (date) {
                        update('event_date', format(date, 'yyyy-MM-dd'));
                        setDateOpen(false);
                      }
                    }}
                    defaultMonth={form.event_date ? new Date(form.event_date + 'T00:00:00') : new Date()}
                    locale={ko}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">시작 시간 *</label>
                <TimePicker value={form.start_time} onChange={(v) => update('start_time', v)} placeholder="시작 시간" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">종료 시간 *</label>
                <TimePicker value={form.end_time} onChange={(v) => update('end_time', v)} placeholder="종료 시간" />
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">장소 *</label>
            <Input value={form.location} onChange={(e) => update('location', e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">주관부서 *</label>
            <Input value={form.organizer} onChange={(e) => update('organizer', e.target.value)} required />
          </div>

          {/* Car number toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">차량번호 입력</p>
              <p className="text-xs text-muted-foreground">참석자에게 차량번호를 입력받습니다</p>
            </div>
            <Switch
              checked={form.show_car_number}
              onCheckedChange={(checked) => setForm({ ...form, show_car_number: checked })}
            />
          </div>

          {/* Recheck toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">참석 재확인 받기</p>
              <p className="text-xs text-muted-foreground">행사 종료 후 30분 이내 QR 재스캔으로 재확인</p>
            </div>
            <Switch
              checked={form.recheck_enabled}
              onCheckedChange={(checked) => setForm({ ...form, recheck_enabled: checked })}
            />
          </div>

          {/* Poster Upload */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">행사 포스터</label>
            {posterPreview ? (
              <div className="relative rounded-lg overflow-hidden border border-border">
                <img src={posterPreview} alt="포스터 미리보기" className="w-full max-h-48 object-contain bg-secondary/30" />
                <button
                  type="button"
                  onClick={removePoster}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-background/80 backdrop-blur flex items-center justify-center hover:bg-background transition-colors"
                  aria-label="포스터 삭제"
                >
                  <X className="w-4 h-4 text-foreground" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-28 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
              >
                <ImagePlus className="w-6 h-6" />
                <span className="text-xs">클릭하여 포스터 이미지 선택</span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePosterSelect}
            />
          </div>

          <Button type="submit" className="w-full h-11 font-semibold" disabled={loading}>
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : '행사 생성'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateEventDialog;
