import { Link, NavLink, Outlet } from 'react-router-dom';
import { useOwnerLayoutData } from '@/hooks/useOwnerLayoutData';
import { APP_CONFIG } from '@/config/app.config';
import { cn } from '@/lib/utils';
import ApperIcon from '@/components/ApperIcon';
import UserMenu from '@/components/UserMenu';
import { ErrorBoundary } from '@/components/ui/error-boundary';

export default function OwnerLayout() {
  const { user, logout, homeRoute, navItems, navGroups, initials, displayName } = useOwnerLayoutData();
  const grouped = navGroups.length ? navGroups : [{ label: null, items: navItems }];

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-(--spacing-header) max-w-[1440px] items-center gap-4 px-4 md:px-8">
          <Link to={homeRoute} className="flex shrink-0 items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ApperIcon name="Trophy" size={19} />
            </span>
            <span className="font-heading text-lg font-bold tracking-tight">{APP_CONFIG.name}</span>
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs font-medium text-muted-foreground sm:inline">Organizer workspace</span>
            <UserMenu user={user} initials={initials} displayName={displayName} logout={logout} />
          </div>
        </div>
        <div className="border-t border-border/70">
          <nav className="mx-auto flex max-w-[1440px] items-center gap-2 overflow-x-auto px-4 py-2.5 md:px-8" aria-label="Main navigation">
            {grouped.flatMap((group) => group.items).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => cn(
                  'flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <ApperIcon name={item.icon ?? 'Circle'} size={16} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1440px] px-4 py-7 md:px-8 md:py-9">
        <ErrorBoundary><Outlet /></ErrorBoundary>
      </main>
      <footer className="mx-auto max-w-[1440px] border-t border-border px-4 py-5 text-xs text-muted-foreground md:px-8">
        CricketHub · Built for the local cricket community
      </footer>
    </div>
  );
}
