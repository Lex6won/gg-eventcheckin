import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * 키오스크 모드 자동 로그아웃 훅.
 * 사용자 인터랙션이 idleMs(기본 15분) 동안 없으면 supabase.auth.signOut() + 로그인 페이지로 이동.
 */
export function useKioskIdleLogout(idleMs: number = 15 * 60 * 1000) {
  const navigate = useNavigate();
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const reset = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(async () => {
        toast.info('비활동으로 자동 로그아웃됩니다.');
        try { sessionStorage.removeItem('kioskMode'); } catch {}
        await supabase.auth.signOut();
        navigate('/admin/login', { replace: true });
      }, idleMs);
    };
    const events: Array<keyof WindowEventMap> = ['mousedown', 'keydown', 'touchstart', 'pointerdown'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [idleMs, navigate]);
}