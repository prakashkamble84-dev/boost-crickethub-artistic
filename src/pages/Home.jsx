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
    <div className="space-y-9">
      <section className="relative isolate overflow-hidden rounded-2xl border border-primary/40 bg-primary px-6 py-7 text-primary-foreground shadow-xl shadow-black/15 md:flex md:min-h-64 md:items-end md:justify-between md:px-9 md:py-8">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-highlight">Organizer workspace · {formatLocalDate(new Date().toISOString(), DATE_FORMATS.SHORT)}</p>
          <h1 className="mt-3 font-heading text-5xl font-extrabold uppercase leading-[0.95] tracking-tight md:text-7xl">Your cricket.<br /><span className="text-highlight">Your tournament.</span></h1>
          <p className="mt-4 max-w-xl text-base leading-6 text-primary-foreground/80">One workspace for every local competition, from first fixture to final ball.</p>
        </div>
        <Button asChild className="h-12 shrink-0 gap-2 bg-highlight px-5 font-bold text-highlight-foreground shadow-lg shadow-black/15 hover:bg-highlight/90">
          <Link to="/tournaments/new"><ApperIcon name="Plus" size={17} /> Create tournament</Link>
        </Button>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div><h2 className="font-heading text-2xl font-bold uppercase tracking-wide">Tournament pulse</h2><p className="text-sm text-muted-foreground">A live view of your competition workspace.</p></div>
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
              <div key={stat.label} className="group rounded-xl border border-border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg hover:shadow-black/10">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{stat.label}</span>
                  <span className={`flex size-9 items-center justify-center rounded-lg ${stat.tone}`}><ApperIcon name={stat.icon} size={17} /></span>
                </div>
                <p className="mt-4 font-heading text-4xl font-bold tabular-nums tracking-tight">{stat.value}</p>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div><h2 className="font-heading text-2xl font-bold uppercase tracking-wide">Recently managed</h2><p className="text-sm text-muted-foreground">Your latest tournament records.</p></div>
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
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-lg shadow-black/10">
            {recent.map((item) => (
              <Link key={item.Id} to={`/tournaments/${item.Id}`} className={`group flex flex-col gap-2 border-l-4 px-5 py-4 transition-all duration-150 hover:bg-accent sm:flex-row sm:items-center sm:justify-between ${statusClass[item.status_c] ?? 'border-l-border'}`}>
                <div><p className="font-semibold transition-colors group-hover:text-highlight">{item.Name}</p><p className="mt-1 text-xs text-muted-foreground">{item.location_c} · {item.format_c} · {item.teams_count_c} teams</p></div>
                <div className="flex items-center gap-3 text-sm"><span className="text-muted-foreground">{formatLocalDate(item.start_date_c, DATE_FORMATS.SHORT)}</span><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">{item.status_c}</span><ApperIcon name="ChevronRight" size={16} className="text-muted-foreground" /></div>
              </Link>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
