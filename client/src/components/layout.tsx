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
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm glass-panel rounded-full px-6 py-3 flex justify-between items-center z-50">
        <Link href="/">
          <a className={`flex flex-col items-center gap-1 transition-colors ${isActive('/') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
            <Home size={24} strokeWidth={isActive('/') ? 2.5 : 2} />
          </a>
        </Link>
        <Link href="/activity">
          <a className={`flex flex-col items-center gap-1 transition-colors ${isActive('/activity') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
            <Activity size={24} strokeWidth={isActive('/activity') ? 2.5 : 2} />
          </a>
        </Link>
        <Link href="/profile">
          <a className={`flex flex-col items-center gap-1 transition-colors ${isActive('/profile') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
            <div className="relative">
              <User size={24} strokeWidth={isActive('/profile') ? 2.5 : 2} />
            </div>
            <div className="flex gap-1.5 mt-0.5">
               <div className="flex flex-col items-center">
                  <div className="h-0.5 w-4 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  <span className="text-[10px] font-mono font-black leading-none mt-0.5 text-emerald-400 drop-shadow-sm">${settings.yesWager}</span>
               </div>
               <div className="flex flex-col items-center">
                  <div className="h-0.5 w-4 bg-rose-500 rounded-full shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                  <span className="text-[10px] font-mono font-black leading-none mt-0.5 text-rose-400 drop-shadow-sm">${settings.noWager}</span>
               </div>
            </div>
          </a>
        </Link>
      </nav>
    </div>
  );
}
