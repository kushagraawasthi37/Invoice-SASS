import { useNavigate } from 'react-router-dom';
import { Menu, Bell, Plus, LogOut, User, CreditCard } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import { authApi } from '@/api/auth.api';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  const navigate = useNavigate();
  const { user, refreshToken, logout } = useAuthStore();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  const handleLogout = async () => {
    if (refreshToken) await authApi.logout(refreshToken);
    logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-10 h-[60px] border-b border-border bg-card/80 backdrop-blur-md flex items-center gap-4 px-4 lg:px-6">
      <button
        onClick={toggleSidebar}
        className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors lg:hidden"
      >
        <Menu className="w-4 h-4" />
      </button>

      {title && (
        <h1 className="text-[15px] font-semibold text-foreground hidden sm:block">{title}</h1>
      )}

      <div className="ml-auto flex items-center gap-2">
        <Button
          size="sm"
          className="hidden sm:flex gap-1.5 h-8 text-xs"
          onClick={() => navigate('/invoices/new')}
        >
          <Plus className="w-3.5 h-3.5" />
          New Invoice
        </Button>

        <button className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors relative">
          <Bell className="w-4 h-4" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted transition-colors">
              <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-semibold text-sm">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.name} className="w-7 h-7 rounded-full object-cover" />
                ) : (
                  user?.name?.charAt(0).toUpperCase()
                )}
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/settings')}>
              <User className="w-4 h-4 mr-2" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/billing')}>
              <CreditCard className="w-4 h-4 mr-2" />
              Billing
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
