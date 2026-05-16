import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { User, Shield, Users, Loader2, Check, X, Trash2, ArrowUp, ArrowDown, UserMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface AdminUser {
  user_id: string;
  email: string | null;
  department: string | null;
  approval_status: 'pending' | 'approved' | 'rejected';
  role: 'super_admin' | 'admin' | 'none';
  created_at: string;
  approved_at: string | null;
  rejected_reason: string | null;
}

type ConfirmAction = {
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
  destructive?: boolean;
} | null;

const roleLabel = (r: AdminUser['role']) =>
  r === 'super_admin' ? '전체 관리자' : r === 'admin' ? '부서 관리자' : '권한 없음';

const statusLabel = (s: AdminUser['approval_status']) =>
  s === 'approved' ? '승인됨' : s === 'rejected' ? '거절됨' : '승인 대기';

const AdminSettings = () => {
  const { user, isSuperAdmin, department } = useAuth();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminUser | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const fetchAdmins = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('list_admin_users');
    if (error) {
      toast.error('관리자 목록을 불러오지 못했습니다.');
    } else {
      setAdmins((data || []) as AdminUser[]);
    }
    setLoading(false);
  }, [isSuperAdmin]);

  useEffect(() => {
    fetchAdmins();
  }, [fetchAdmins]);

  const runRpc = async (
    fn: 'approve_admin' | 'reject_admin' | 'revoke_admin' | 'promote_super_admin' | 'demote_super_admin' | 'delete_admin_user',
    userId: string,
    successMsg: string,
    reason?: string,
  ) => {
    setBusyId(userId);
    const args: Record<string, unknown> = { p_user_id: userId };
    if (fn === 'reject_admin') args.p_reason = reason ?? null;
    const { error } = await supabase.rpc(fn, args as never);
    if (error) {
      toast.error(error.message || '작업에 실패했습니다.');
    } else {
      toast.success(successMsg);
      await fetchAdmins();
    }
    setBusyId(null);
  };

  const pending = admins.filter(a => a.approval_status === 'pending');
  const rejected = admins.filter(a => a.approval_status === 'rejected');
  const active = admins.filter(a => a.approval_status === 'approved');

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <h1 className="text-xl font-bold text-foreground">설정</h1>

      {/* 본인 계정 */}
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
            isSuperAdmin ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'
          }`}>
            {isSuperAdmin ? '전체 관리자' : '부서 관리자'}
          </span>
          {department && <span className="text-muted-foreground">{department}</span>}
        </div>
      </div>

      {isSuperAdmin && (
        <>
          {/* 승인 대기 */}
          <SectionCard
            icon={<Users className="w-5 h-5 text-primary" />}
            title="승인 대기"
            subtitle={`${pending.length}건의 가입 신청`}
          >
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto my-6" />
            ) : pending.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">대기 중인 신청이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {pending.map(a => (
                  <AdminRow key={a.user_id} admin={a} busy={busyId === a.user_id}>
                    <Button size="sm" disabled={busyId === a.user_id}
                      onClick={() => runRpc('approve_admin', a.user_id, '승인되었습니다.')}>
                      <Check className="w-4 h-4 mr-1" />승인
                    </Button>
                    <Button size="sm" variant="outline" disabled={busyId === a.user_id}
                      onClick={() => { setRejectTarget(a); setRejectReason(''); }}>
                      <X className="w-4 h-4 mr-1" />거절
                    </Button>
                  </AdminRow>
                ))}
              </div>
            )}
          </SectionCard>

          {/* 활성 관리자 */}
          <SectionCard
            icon={<Shield className="w-5 h-5 text-primary" />}
            title="활성 관리자"
            subtitle={`${active.length}명`}
          >
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto my-6" />
            ) : (
              <div className="space-y-2">
                {active.map(a => {
                  const isSelf = a.user_id === user?.id;
                  return (
                    <AdminRow key={a.user_id} admin={a} busy={busyId === a.user_id}>
                      {!isSelf && a.role === 'admin' && (
                        <Button size="sm" variant="outline" disabled={busyId === a.user_id}
                          onClick={() => setConfirm({
                            title: '전체관리자로 승급',
                            description: `${a.email} 계정을 전체관리자로 승급하시겠습니까?`,
                            onConfirm: () => runRpc('promote_super_admin', a.user_id, '승급되었습니다.'),
                          })}>
                          <ArrowUp className="w-4 h-4 mr-1" />승급
                        </Button>
                      )}
                      {!isSelf && a.role === 'super_admin' && (
                        <Button size="sm" variant="outline" disabled={busyId === a.user_id}
                          onClick={() => setConfirm({
                            title: '전체관리자 강등',
                            description: `${a.email} 계정을 전체관리자에서 강등하시겠습니까? (부서관리자 권한은 유지)`,
                            onConfirm: () => runRpc('demote_super_admin', a.user_id, '강등되었습니다.'),
                          })}>
                          <ArrowDown className="w-4 h-4 mr-1" />강등
                        </Button>
                      )}
                      {!isSelf && a.role === 'admin' && (
                        <Button size="sm" variant="outline" disabled={busyId === a.user_id}
                          onClick={() => setConfirm({
                            title: '권한 회수',
                            description: `${a.email} 계정의 관리자 권한을 회수하시겠습니까?`,
                            destructive: true,
                            onConfirm: () => runRpc('revoke_admin', a.user_id, '권한이 회수되었습니다.'),
                          })}>
                          <UserMinus className="w-4 h-4 mr-1" />회수
                        </Button>
                      )}
                      {!isSelf && (
                        <Button size="sm" variant="destructive" disabled={busyId === a.user_id}
                          onClick={() => setConfirm({
                            title: '계정 삭제',
                            description: `${a.email} 계정을 완전히 삭제하시겠습니까? (등록한 행사/교육이 있으면 삭제할 수 없습니다)`,
                            destructive: true,
                            onConfirm: () => runRpc('delete_admin_user', a.user_id, '삭제되었습니다.'),
                          })}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                      {isSelf && <span className="text-xs text-muted-foreground px-2">본인</span>}
                    </AdminRow>
                  );
                })}
              </div>
            )}
          </SectionCard>

          {/* 거절됨 */}
          {rejected.length > 0 && (
            <SectionCard
              icon={<X className="w-5 h-5 text-destructive" />}
              title="거절됨"
              subtitle={`${rejected.length}명`}
            >
              <div className="space-y-2">
                {rejected.map(a => (
                  <AdminRow key={a.user_id} admin={a} busy={busyId === a.user_id}>
                    <Button size="sm" variant="outline" disabled={busyId === a.user_id}
                      onClick={() => runRpc('approve_admin', a.user_id, '승인되었습니다.')}>
                      <Check className="w-4 h-4 mr-1" />승인
                    </Button>
                    <Button size="sm" variant="destructive" disabled={busyId === a.user_id}
                      onClick={() => setConfirm({
                        title: '계정 삭제',
                        description: `${a.email} 계정을 완전히 삭제하시겠습니까?`,
                        destructive: true,
                        onConfirm: () => runRpc('delete_admin_user', a.user_id, '삭제되었습니다.'),
                      })}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AdminRow>
                ))}
              </div>
            </SectionCard>
          )}
        </>
      )}

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className={confirm?.destructive ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground' : ''}
              onClick={async () => {
                const fn = confirm?.onConfirm;
                setConfirm(null);
                if (fn) await fn();
              }}
            >
              확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>가입 신청 거절</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {rejectTarget?.email} 계정의 가입을 거절합니다. 사유를 입력해주세요 (선택).
            </p>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="거절 사유"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>취소</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                const target = rejectTarget;
                const reason = rejectReason.trim();
                setRejectTarget(null);
                if (target) await runRpc('reject_admin', target.user_id, '거절되었습니다.', reason || undefined);
              }}
            >
              거절
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const SectionCard = ({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode }) => (
  <div className="bg-card rounded-2xl shadow-sm border border-border/50 p-6 space-y-4">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">{icon}</div>
      <div>
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
    {children}
  </div>
);

const AdminRow = ({ admin, busy, children }: { admin: AdminUser; busy: boolean; children: React.ReactNode }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-secondary/50">
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-9 h-9 rounded-lg bg-background flex items-center justify-center shrink-0">
        <User className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{admin.email || '(이메일 없음)'}</p>
        <p className="text-xs text-muted-foreground truncate">
          {admin.department || '부서 미설정'} · {roleLabel(admin.role)} · {statusLabel(admin.approval_status)}
        </p>
        {admin.rejected_reason && (
          <p className="text-xs text-destructive mt-0.5">사유: {admin.rejected_reason}</p>
        )}
      </div>
    </div>
    <div className="flex items-center gap-2 flex-wrap">
      {busy ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : children}
    </div>
  </div>
);

export default AdminSettings;
