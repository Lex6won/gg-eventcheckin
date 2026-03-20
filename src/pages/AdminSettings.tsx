import { useAuth } from '@/lib/auth';
import { Settings, User, Shield } from 'lucide-react';

const AdminSettings = () => {
  const { user } = useAuth();

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <h1 className="text-xl font-bold text-foreground">설정</h1>

      <div className="bg-card rounded-2xl shadow-sm border border-border/50 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-medium text-foreground">관리자 계정</p>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl shadow-sm border border-border/50 p-6 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
            <Shield className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium text-foreground">시스템 정보</p>
            <p className="text-sm text-muted-foreground">행사 참석 확인 시스템 v1.0</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminSettings;
