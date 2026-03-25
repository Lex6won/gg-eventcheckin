import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { User, Shield, Users, Loader2 } from 'lucide-react';

interface AdminUser {
  user_id: string;
  department: string | null;
  role: string;
  email?: string;
}

const AdminSettings = () => {
  const { user, isSuperAdmin, department } = useAuth();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) return;
    const fetchAdmins = async () => {
      setLoadingAdmins(true);
      // Fetch all roles and profiles (super_admin can see all)
      const [rolesRes, profilesRes] = await Promise.all([
        supabase.from('user_roles').select('user_id, role'),
        supabase.from('profiles').select('user_id, department'),
      ]);

      const profileMap = new Map(
        (profilesRes.data || []).map(p => [p.user_id, p.department])
      );

      // Group by user_id, pick highest role
      const userMap = new Map<string, AdminUser>();
      (rolesRes.data || []).forEach(r => {
        const existing = userMap.get(r.user_id);
        if (!existing || r.role === 'super_admin') {
          userMap.set(r.user_id, {
            user_id: r.user_id,
            department: profileMap.get(r.user_id) || null,
            role: r.role,
          });
        }
      });

      setAdmins(Array.from(userMap.values()));
      setLoadingAdmins(false);
    };
    fetchAdmins();
  }, [isSuperAdmin]);

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
        <div className="flex items-center gap-2 text-sm">
          <span className={`px-2.5 py-1 rounded-lg font-medium ${
            isSuperAdmin
              ? 'bg-primary/10 text-primary'
              : 'bg-secondary text-muted-foreground'
          }`}>
            {isSuperAdmin ? '전체 관리자' : '부서 관리자'}
          </span>
          {department && (
            <span className="text-muted-foreground">{department}</span>
          )}
        </div>
      </div>

      {/* Admin list - super_admin only */}
      {isSuperAdmin && (
        <div className="bg-card rounded-2xl shadow-sm border border-border/50 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">관리자 목록</p>
              <p className="text-sm text-muted-foreground">등록된 모든 관리자 계정</p>
            </div>
          </div>

          {loadingAdmins ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-2">
              {admins.map((admin) => (
                <div
                  key={admin.user_id}
                  className="flex items-center justify-between p-3 rounded-xl bg-secondary/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center">
                      <User className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {admin.department || '(부서 미설정)'}
                      </p>
                      <p className="text-xs text-muted-foreground">{admin.user_id.slice(0, 8)}...</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-md font-medium ${
                    admin.role === 'super_admin'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {admin.role === 'super_admin' ? '전체 관리자' : '부서 관리자'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
