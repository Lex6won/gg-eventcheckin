import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  roleLoading: boolean;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  hasAdminAccess: boolean;
  approvalStatus: 'pending' | 'approved' | 'rejected' | null;
  department: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, department: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null);
  const [department, setDepartment] = useState<string | null>(null);

  const fetchRoleAndProfile = async (userId: string) => {
    setRoleLoading(true);
    const [roleRes, profileRes] = await Promise.all([
      supabase.from('user_roles').select('role').eq('user_id', userId),
      supabase.from('profiles').select('department, approval_status').eq('user_id', userId).maybeSingle(),
    ]);

    const roles = roleRes.data?.map(r => r.role) || [];
    setIsSuperAdmin(roles.includes('super_admin'));
    setIsAdmin(roles.includes('admin') || roles.includes('super_admin'));
    setDepartment(profileRes.data?.department || null);
    setApprovalStatus(
      (profileRes.data as { approval_status?: string } | null)?.approval_status as
        'pending' | 'approved' | 'rejected' | undefined || 'pending'
    );
    setRoleLoading(false);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setRoleLoading(true);
        setTimeout(() => fetchRoleAndProfile(session.user.id), 0);
      } else {
        setIsSuperAdmin(false);
        setIsAdmin(false);
        setApprovalStatus(null);
        setDepartment(null);
        setRoleLoading(false);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setRoleLoading(true);
        fetchRoleAndProfile(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, dept: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { department: dept } },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, roleLoading, isSuperAdmin, isAdmin, hasAdminAccess: isAdmin || isSuperAdmin, approvalStatus, department, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
