import { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useIsMobile } from '@/hooks/use-mobile';
import { Calendar, Users, Settings, LogOut, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const navItems = [
  { label: '행사 관리', icon: Calendar, path: '/admin/events' },
  { label: '참석자 현황', icon: Users, path: '/admin/attendees' },
  { label: '설정', icon: Settings, path: '/admin/settings' },
];

const AdminLayout = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/admin/login');
    }
  }, [user, loading, navigate]);

  // Redirect /admin/dashboard to /admin/events
  useEffect(() => {
    if (location.pathname === '/admin' || location.pathname === '/admin/dashboard') {
      navigate('/admin/events', { replace: true });
    }
  }, [location.pathname, navigate]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/admin/login');
  };

  if (loading) {
    return (
      <div className="min-h-svh bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <div className="min-h-svh bg-background flex">
      {/* Desktop Sidebar */}
      {!isMobile && (
        <aside className="w-60 bg-card border-r border-border/50 flex flex-col fixed inset-y-0 left-0 z-20">
          <div className="h-14 px-4 flex items-center gap-2 border-b border-border/50">
            <Calendar className="w-5 h-5 text-primary" />
            <span className="font-bold text-foreground text-sm">행사 관리 시스템</span>
          </div>
          <nav className="flex-1 p-3 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive(item.path)
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <item.icon className="w-4.5 h-4.5" />
                {item.label}
              </button>
            ))}
          </nav>
          <div className="p-3 border-t border-border/50">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="w-full justify-start text-muted-foreground hover:text-destructive"
            >
              <LogOut className="w-4 h-4 mr-2" />
              로그아웃
            </Button>
          </div>
        </aside>
      )}

      {/* Main content */}
      <div className={`flex-1 flex flex-col ${!isMobile ? 'ml-60' : ''} ${isMobile ? 'pb-16' : ''}`}>
        {/* Mobile Header */}
        {isMobile && (
          <header className="bg-card border-b border-border/50 sticky top-0 z-10 h-14 px-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              <span className="font-bold text-foreground text-sm">행사 관리</span>
            </div>
            <Button size="icon" variant="ghost" onClick={handleSignOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </header>
        )}

        <main className="flex-1">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      {isMobile && (
        <nav className="fixed bottom-0 inset-x-0 bg-card border-t border-border/50 z-20 flex h-16 safe-area-bottom">
          {navItems.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
                isActive(item.path)
                  ? 'text-primary'
                  : 'text-muted-foreground'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
};

export default AdminLayout;
