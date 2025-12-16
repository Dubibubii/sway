import { Link, useLocation } from "wouter";
import { Home, User, Activity } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

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
            <User size={24} strokeWidth={isActive('/profile') ? 2.5 : 2} />
          </a>
        </Link>
      </nav>
    </div>
  );
}
