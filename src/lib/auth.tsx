import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
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

  // Track which userId we've fetched role/profile for, to avoid duplicates
  // across getSession() + onAuthStateChange + TOKEN_REFRESHED events.
  const loadedUserIdRef = useRef<string | null>(null);
  const inFlightUserIdRef = useRef<string | null>(null);

  const fetchRoleAndProfile = async (userId: string) => {
    if (inFlightUserIdRef.current === userId || loadedUserIdRef.current === userId) return;
    inFlightUserIdRef.current = userId;
    // Only show role spinner on the very first load for this user
    if (loadedUserIdRef.current !== userId) setRoleLoading(true);
    const [roleRes, profileRes] = await Promise.all([
      supabase.from('user_roles').select('role').eq('user_id', userId),
      supabase.from('profiles').select('department, approval_status').eq('user_id', userId).maybeSingle(),
    ]);
    // Bail if user changed mid-flight
    if (inFlightUserIdRef.current !== userId) return;

    const roles = roleRes.data?.map(r => r.role) || [];
    setIsSuperAdmin(roles.includes('super_admin'));
    setIsAdmin(roles.includes('admin') || roles.includes('super_admin'));
    setDepartment(profileRes.data?.department || null);
    setApprovalStatus(
      (profileRes.data as { approval_status?: string } | null)?.approval_status as
        'pending' | 'approved' | 'rejected' | undefined || 'pending'
    );
    loadedUserIdRef.current = userId;
    inFlightUserIdRef.current = null;
    setRoleLoading(false);
  };

  useEffect(() => {
    const handleSession = (session: Session | null) => {
      setSession(session);
      setUser(session?.user ?? null);
      const uid = session?.user?.id ?? null;
      if (uid) {
        if (loadedUserIdRef.current !== uid && inFlightUserIdRef.current !== uid) {
          // Defer to avoid running supabase calls inside the auth callback
          setTimeout(() => fetchRoleAndProfile(uid), 0);
        }
      } else {
        loadedUserIdRef.current = null;
        inFlightUserIdRef.current = null;
        setIsSuperAdmin(false);
        setIsAdmin(false);
        setApprovalStatus(null);
        setDepartment(null);
        setRoleLoading(false);
      }
      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSession(session);
    });

    supabase.auth.getSession().then(({ data: { session } }) => handleSession(session));

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
