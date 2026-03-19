import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface CreateEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const generateAccessCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

const CreateEventDialog = ({ open, onOpenChange, onCreated }: CreateEventDialogProps) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    event_date: '',
    start_time: '',
    end_time: '',
    location: '',
    organizer: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      const { error } = await supabase.from('events').insert({
        ...form,
        access_code: generateAccessCode(),
        created_by: user.id,
      });

      if (error) throw error;

      toast.success('행사가 생성되었습니다.');
      onOpenChange(false);
      setForm({ title: '', description: '', event_date: '', start_time: '', end_time: '', location: '', organizer: '' });
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
      <DialogContent className="sm:max-w-md">
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
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">날짜 *</label>
              <Input type="date" value={form.event_date} onChange={(e) => update('event_date', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">시작 *</label>
              <Input type="time" value={form.start_time} onChange={(e) => update('start_time', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">종료 *</label>
              <Input type="time" value={form.end_time} onChange={(e) => update('end_time', e.target.value)} required />
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
          <Button type="submit" className="w-full h-11 font-semibold" disabled={loading}>
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : '행사 생성'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateEventDialog;
