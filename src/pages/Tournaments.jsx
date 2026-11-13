import { useState } from 'react';
import { Link } from 'react-router-dom';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ListSkeleton } from '@/components/PageSkeleton';
import { formatLocalDate, DATE_FORMATS } from '@/utils/date';

const { contains, eq } = window.ApperSDK.CoreSDK;
const FIELDS = ['Id', 'Name', 'status_c', 'format_c', 'location_c', 'start_date_c', 'end_date_c', 'overs_c', 'teams_count_c', 'is_public_c'];

const statusStyles = {
  Draft: 'border-l-slate-400',
  Upcoming: 'border-l-sky-500',
  Live: 'border-l-rose-600',
  Completed: 'border-l-emerald-600',
  Cancelled: 'border-l-amber-500',
};

const statusBadge = {
  Draft: 'bg-muted text-muted-foreground',
  Upcoming: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  Live: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
  Completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  Cancelled: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
};

export const route = { path: '/tournaments', layout: 'owner', access: 'authenticated' };
export const nav = { icon: 'Trophy', label: 'Tournaments', section: 'Manage', order: 20 };

export default function Tournaments() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const { data, loading, error, run } = useFetch(() => {
    let query = sdk.table('tournaments_c').select(FIELDS);
    if (search.trim()) query = query.where(contains('Name', search.trim()));
    if (status !== 'All') query = query.where(eq('status_c', status));
    return query.orderByDesc('CreatedOn').fetch().then((result) => {
      if (!result.success) throw new Error(result.message);
      return result.data;
    });
  }, [search, status]);
  const tournaments = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Competition workspace</p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">Tournaments</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create and manage every local cricket competition from one place.</p>
        </div>
        <Button asChild className="gap-2">
          <Link to="/tournaments/new"><ApperIcon name="Plus" size={16} /> Create tournament</Link>
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row">
        <div className="relative flex-1">
          <ApperIcon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tournaments..." className="pl-9" />
        </div>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          {['All', 'Draft', 'Upcoming', 'Live', 'Completed', 'Cancelled'].map((item) => <option key={item} value={item}>{item === 'All' ? 'All statuses' : item}</option>)}
        </select>
      </div>

      {loading && data === undefined ? <ListSkeleton rows={7} /> : null}
      {error ? <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5"><p className="font-medium">Could not load tournaments</p><p className="mt-1 text-sm text-muted-foreground">{error.message}</p><Button variant="outline" className="mt-3" onClick={run}>Try again</Button></div> : null}
      {!loading && !error && tournaments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <ApperIcon name="Trophy" size={32} className="mx-auto text-muted-foreground" />
          <h2 className="mt-4 font-heading text-xl font-semibold">No tournaments found</h2>
          <p className="mt-1 text-sm text-muted-foreground">Create your first tournament or change the search filters.</p>
          <Button asChild className="mt-5"><Link to="/tournaments/new">Create tournament</Link></Button>
        </div>
      ) : null}
      {tournaments.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="hidden grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_100px] gap-4 border-b border-border bg-muted/50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
            <span>Tournament</span><span>Format</span><span>Start date</span><span>Teams</span><span>Status</span>
          </div>
          <div className="divide-y divide-border">
            {tournaments.map((item) => (
              <Link key={item.Id} to={`/tournaments/${item.Id}`} className={`group grid gap-2 border-l-4 px-4 py-4 transition-colors hover:bg-muted/40 md:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_100px] md:items-center md:gap-4 md:px-5 ${statusStyles[item.status_c] ?? 'border-l-border'}`}>
                <div className="min-w-0">
                  <p className="truncate font-semibold group-hover:text-primary">{item.Name}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><ApperIcon name="MapPin" size={12} /> {item.location_c}</p>
                </div>
                <span className="text-sm text-muted-foreground">{item.format_c}</span>
                <span className="text-sm tabular-nums">{formatLocalDate(item.start_date_c, DATE_FORMATS.SHORT)}</span>
                <span className="text-sm">{item.teams_count_c ?? '—'} teams · {item.overs_c} overs</span>
                <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge[item.status_c] ?? 'bg-muted text-muted-foreground'}`}>{item.status_c}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">{tournaments.length} tournament{tournaments.length === 1 ? '' : 's'} shown</p>
    </div>
  );
}
