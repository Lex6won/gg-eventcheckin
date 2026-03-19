import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const Index = () => {
  const [accessCode, setAccessCode] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (accessCode.trim()) {
      navigate(`/attend/${accessCode.trim()}`);
    }
  };

  return (
    <div className="min-h-svh bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Search className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            행사 참석 확인
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            행사 접속코드를 입력하여 참석을 등록해주세요.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">접속코드</label>
            <Input
              type="text"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
              placeholder="6자리 접속코드 입력"
              maxLength={6}
              className="text-center text-lg tracking-[0.3em] font-semibold h-14 bg-card"
            />
          </div>
          <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={accessCode.length < 6}>
            참석 등록하기
          </Button>
        </form>

        <div className="pt-4 text-center">
          <button
            onClick={() => navigate('/admin/login')}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Shield className="w-4 h-4" />
            관리자 로그인
          </button>
        </div>
      </div>
    </div>
  );
};

export default Index;
