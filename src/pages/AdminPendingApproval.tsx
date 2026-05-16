import { useAuth } from '@/lib/auth';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Clock, XCircle, LogOut } from 'lucide-react';

const AdminPendingApproval = () => {
  const { user, approvalStatus, signOut } = useAuth();
  const navigate = useNavigate();
  const rejected = approvalStatus === 'rejected';

  const handleSignOut = async () => {
    await signOut();
    navigate('/admin/login');
  };

  return (
    <div className="min-h-svh bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center space-y-6">
        <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl ${rejected ? 'bg-destructive/10' : 'bg-primary/10'}`}>
          {rejected ? (
            <XCircle className="w-8 h-8 text-destructive" />
          ) : (
            <Clock className="w-8 h-8 text-primary" />
          )}
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-foreground">
            {rejected ? '가입 신청이 거절되었습니다' : '승인 대기 중입니다'}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {rejected
              ? '관리자에게 문의해주세요.'
              : '전체관리자의 승인 후 시스템을 이용할 수 있습니다. 승인 완료 시 다시 로그인해주세요.'}
          </p>
          {user?.email && (
            <p className="text-xs text-muted-foreground pt-2">{user.email}</p>
          )}
        </div>
        <Button onClick={handleSignOut} variant="outline" className="w-full">
          <LogOut className="w-4 h-4 mr-2" />
          로그아웃
        </Button>
      </div>
    </div>
  );
};

export default AdminPendingApproval;