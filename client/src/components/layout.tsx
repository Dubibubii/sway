import { Link, useLocation } from "wouter";
import { Home, User, Wallet, Activity } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const isActive = (path: string) => location === path;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col max-w-md mx-auto relative overflow-hidden shadow-2xl">
      <main className="flex-1 relative z-10 overflow-hidden">
        {children}
      </main>
      
      {/* Bottom Navigation */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm glass-panel rounded-full px-6 py-4 flex justify-between items-center z-50">
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
        <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-primary to-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.4)] flex items-center justify-center -mt-8 border-4 border-background cursor-pointer">
           <Wallet className="text-background" size={24} strokeWidth={2.5} />
        </div>
        <Link href="/profile">
          <a className={`flex flex-col items-center gap-1 transition-colors ${isActive('/profile') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
            <User size={24} strokeWidth={isActive('/profile') ? 2.5 : 2} />
          </a>
        </Link>
      </nav>
    </div>
  );
}
