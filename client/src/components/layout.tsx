import { Link, useLocation } from "wouter";
import { Home, User, Activity } from "lucide-react";
import { useSettings } from "@/hooks/use-settings";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { settings } = useSettings();

  const isActive = (path: string) => location === path;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col max-w-md mx-auto relative overflow-hidden shadow-2xl">
      <main className="flex-1 relative z-10 overflow-hidden">
        {children}
      </main>
      
      {/* Top Navigation */}
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-sm glass-panel rounded-full px-4 py-2 flex justify-between items-center z-50">
        <Link href="/">
          <a className={`flex flex-col items-center gap-1 transition-colors ${isActive('/') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
            <Home size={24} strokeWidth={isActive('/') ? 2.5 : 2} />
          </a>
        </Link>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <Link href="/activity">
            <a className={`flex flex-col items-center gap-1 transition-colors ${isActive('/activity') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
              <Activity size={24} strokeWidth={isActive('/activity') ? 2.5 : 2} />
            </a>
          </Link>
        </div>
        <Link href="/profile">
          <a className={`flex items-center gap-3 transition-colors ${isActive('/profile') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
            <User size={24} strokeWidth={isActive('/profile') ? 2.5 : 2} />
            <div className="flex gap-1.5">
               <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center shadow-[0_0_8px_rgba(16,185,129,0.3)]">
                  <span className="text-[10px] font-mono font-bold text-emerald-400 leading-none">${settings.yesWager}</span>
               </div>
               <div className="w-5 h-5 rounded-full bg-rose-500/20 border border-rose-500/50 flex items-center justify-center shadow-[0_0_8px_rgba(244,63,94,0.3)]">
                  <span className="text-[10px] font-mono font-bold text-rose-400 leading-none">${settings.noWager}</span>
               </div>
            </div>
          </a>
        </Link>
      </nav>
    </div>
  );
}
