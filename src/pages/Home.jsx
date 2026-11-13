import { Link } from 'react-router-dom';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { StatsSkeleton, ListSkeleton } from '@/components/PageSkeleton';
import { formatLocalDate, DATE_FORMATS } from '@/utils/date';

const FIELDS = ['Id', 'Name', 'status_c', 'format_c', 'location_c', 'start_date_c', 'end_date_c', 'overs_c', 'teams_count_c', 'is_public_c'];

const statusClass = {
  Draft: 'border-l-slate-400',
  Upcoming: 'border-l-primary',
  Live: 'border-l-highlight',
  Completed: 'border-l-success',
  Cancelled: 'border-l-warning',
};

export const route = { path: '/', layout: 'owner', access: 'authenticated' };
export const nav = { icon: 'LayoutDashboard', label: 'Overview', section: 'Workspace', order: 10 };

export default function Home() {
  const { data, loading, error, run } = useFetch(() => sdk.table('tournaments_c').select(FIELDS).orderByDesc('CreatedOn').fetch().then((result) => {
    if (!result.success) throw new Error(result.message);
    return result.data;
  }), []);
  const tournaments = data ?? [];
  const live = tournaments.filter((item) => item.status_c === 'Live');
  const upcoming = tournaments.filter((item) => item.status_c === 'Upcoming');
  const completed = tournaments.filter((item) => item.status_c === 'Completed');
  const recent = tournaments.slice(0, 5);

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 md:flex-row md:items-end md:justify-between md:p-8">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Organizer workspace · {formatLocalDate(new Date().toISOString(), DATE_FORMATS.SHORT)}</p>
          <h1 className="mt-3 font-heading text-3xl font-bold leading-tight tracking-tight md:text-4xl">Your cricket, <span className="text-highlight">organized.</span></h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Run tournaments, keep teams moving and bring every match into one clear view.</p>
        </div>
        <Button asChild className="h-11 shrink-0 gap-2">
          <Link to="/tournaments/new"><ApperIcon name="Plus" size={17} /> Create tournament</Link>
        </Button>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div><h2 className="font-heading text-lg font-semibold">Tournament pulse</h2><p className="text-sm text-muted-foreground">A live view of your competition workspace.</p></div>
          <Link to="/tournaments" className="text-sm font-semibold text-primary hover:underline">All tournaments</Link>
        </div>
        {loading && data === undefined ? <StatsSkeleton count={4} /> : null}
        {error ? <div className="rounded-xl border border-destructive/30 p-5"><p className="font-medium">Dashboard data could not load.</p><p className="mt-1 text-sm text-muted-foreground">{error.message}</p><Button variant="outline" className="mt-3" onClick={run}>Try again</Button></div> : null}
        {!loading && !error ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Total tournaments', value: tournaments.length, icon: 'Trophy', tone: 'text-primary bg-primary/10' },
              { label: 'Live now', value: live.length, icon: 'Radio', tone: 'text-highlight bg-highlight/10' },
              { label: 'Upcoming', value: upcoming.length, icon: 'CalendarClock', tone: 'text-primary bg-primary/10' },
              { label: 'Completed', value: completed.length, icon: 'Flag', tone: 'text-success bg-success-muted' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{stat.label}</span>
                  <span className={`flex size-9 items-center justify-center rounded-lg ${stat.tone}`}><ApperIcon name={stat.icon} size={17} /></span>
                </div>
                <p className="mt-4 font-heading text-3xl font-semibold tabular-nums">{stat.value}</p>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div><h2 className="font-heading text-lg font-semibold">Recently managed</h2><p className="text-sm text-muted-foreground">Your latest tournament records.</p></div>
          <Link to="/tournaments" className="text-sm font-semibold text-primary hover:underline">View list</Link>
        </div>
        {loading && data === undefined ? <ListSkeleton rows={4} /> : null}
        {!loading && !error && recent.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
            <ApperIcon name="Trophy" size={28} className="mx-auto text-muted-foreground" />
            <p className="mt-3 font-semibold">Your first tournament starts here</p>
            <p className="mt-1 text-sm text-muted-foreground">Create a tournament to begin building your cricket calendar.</p>
            <Button asChild className="mt-4"><Link to="/tournaments/new">Create tournament</Link></Button>
          </div>
        ) : null}
        {recent.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {recent.map((item) => (
              <Link key={item.Id} to={`/tournaments/${item.Id}`} className={`flex flex-col gap-2 border-l-4 px-5 py-4 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between ${statusClass[item.status_c] ?? 'border-l-border'}`}>
                <div><p className="font-semibold">{item.Name}</p><p className="mt-1 text-xs text-muted-foreground">{item.location_c} · {item.format_c} · {item.teams_count_c} teams</p></div>
                <div className="flex items-center gap-3 text-sm"><span className="text-muted-foreground">{formatLocalDate(item.start_date_c, DATE_FORMATS.SHORT)}</span><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">{item.status_c}</span><ApperIcon name="ChevronRight" size={16} className="text-muted-foreground" /></div>
              </Link>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
