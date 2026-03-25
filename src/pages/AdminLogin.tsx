import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const AdminLogin = () => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [department, setDepartment] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'login') {
        await signIn(email, password);
        navigate('/admin/events');
      } else {
        if (!department.trim()) {
          toast.error('부서명을 입력해주세요.');
          setLoading(false);
          return;
        }
        await signUp(email, password, department.trim());
        toast.success('회원가입이 완료되었습니다. 이메일 인증 후 로그인해주세요.');
        setMode('login');
      }
    } catch {
      toast.error(
        mode === 'login'
          ? '로그인에 실패했습니다. 이메일과 비밀번호를 확인해주세요.'
          : '회원가입에 실패했습니다. 다시 시도해주세요.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-svh bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-2">
            <Shield className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            {mode === 'login' ? '관리자 로그인' : '관리자 회원가입'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'login' ? '행사를 관리하려면 로그인하세요.' : '부서별 관리자 계정을 생성합니다.'}
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex bg-secondary rounded-lg p-1">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === 'login'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            로그인
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === 'signup'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            회원가입
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">부서명</label>
              <Input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="예: AI프런티어정책과"
                className="bg-card"
                required
              />
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">이메일</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-card"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">비밀번호</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-card"
              required
              minLength={6}
            />
          </div>
          <Button type="submit" className="w-full h-12 font-semibold" disabled={loading}>
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : mode === 'login' ? '로그인' : '회원가입'}
          </Button>
        </form>

        <div className="text-center">
          <button
            onClick={() => navigate('/')}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← 참석 등록으로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
