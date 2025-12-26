import { Link, useLocation } from "wouter";
import { Home, User, Activity, Search } from "lucide-react";
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
        <Link href="/" data-testid="nav-home" className={`flex flex-col items-center gap-1 transition-colors ${isActive('/') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
          <Home size={22} strokeWidth={isActive('/') ? 2.5 : 2} />
        </Link>
        <Link href="/discovery" data-testid="nav-discovery" className={`flex flex-col items-center gap-1 transition-colors ${isActive('/discovery') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
          <Search size={22} strokeWidth={isActive('/discovery') ? 2.5 : 2} />
        </Link>
        <Link href="/activity" data-testid="nav-activity" className={`flex flex-col items-center gap-1 transition-colors ${isActive('/activity') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
          <Activity size={22} strokeWidth={isActive('/activity') ? 2.5 : 2} />
        </Link>
        <Link href="/profile" data-testid="nav-profile" className={`flex items-center gap-3 transition-colors ${isActive('/profile') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
          <User size={22} strokeWidth={isActive('/profile') ? 2.5 : 2} />
          <div className="flex gap-1.5">
             {settings.yesWager === settings.noWager ? (
               <div className="w-auto min-w-[20px] px-1 h-5 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                  <span className="text-[10px] font-mono font-bold text-white leading-none">${settings.yesWager}</span>
               </div>
             ) : (
               <>
                 <div className="w-5 h-5 rounded-full bg-[#1ED78B]/20 border border-[#1ED78B]/50 flex items-center justify-center shadow-[0_0_8px_rgba(30,215,139,0.3)]">
                    <span className="text-[10px] font-mono font-bold text-[#1ED78B] leading-none">${settings.yesWager}</span>
                 </div>
                 <div className="w-5 h-5 rounded-full bg-rose-500/20 border border-rose-500/50 flex items-center justify-center shadow-[0_0_8px_rgba(244,63,94,0.3)]">
                    <span className="text-[10px] font-mono font-bold text-rose-400 leading-none">${settings.noWager}</span>
                 </div>
               </>
             )}
          </div>
        </Link>
      </nav>
    </div>
  );
}
