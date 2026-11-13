import { useState } from 'react';
import { Link } from 'react-router-dom';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ListSkeleton } from '@/components/PageSkeleton';
import { toast } from 'sonner';
import { formatLocalDate, DATE_FORMATS } from '@/utils/date';

const { contains } = window.ApperSDK.CoreSDK;
const MATCH_FIELDS = ['Id', 'Name', 'tournament_c', 'team_a_c', 'team_b_c', 'match_date_c', 'start_time_c', 'venue_c', 'overs_c', 'status_c', 'CreatedOn'];
const TOURNAMENT_FIELDS = ['Id', 'Name', 'overs_c'];
const TEAM_FIELDS = ['Id', 'Name', 'tournament_c'];

const statusStyles = {
  Scheduled: 'bg-primary/10 text-primary',
  Live: 'bg-success-muted text-success',
  Completed: 'bg-muted text-muted-foreground',
  Abandoned: 'bg-destructive/10 text-destructive'
};

export const route = { path: '/matches', layout: 'owner', access: 'authenticated' };
export const nav = { icon: 'CalendarDays', label: 'Fixtures', section: 'Manage', order: 40 };

export default function Matches() {
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [tournament, setTournament] = useState('');
  const [teamA, setTeamA] = useState('');
  const [teamB, setTeamB] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [venue, setVenue] = useState('');
  const [overs, setOvers] = useState('10');
  const { data, loading, error, run } = useFetch(() => {
    let q = sdk.table('matches_c').select(MATCH_FIELDS);
    if (search.trim()) q = q.where(contains('Name', search.trim()));
    return q.orderByDesc('match_date_c').fetch().then((r) => {
      if (!r.success) throw new Error(r.message);
      return r.data;
    });
  }, [search]);
  const { data: tournaments } = useFetch(() => sdk.table('tournaments_c').select(TOURNAMENT_FIELDS).orderByDesc('CreatedOn').fetch().then((r) => {
    if (!r.success) throw new Error(r.message);
    return r.data;
  }), []);
  const { data: teams } = useFetch(() => sdk.table('squads_c').select(TEAM_FIELDS).orderBy('Name').fetch().then((r) => {
    if (!r.success) throw new Error(r.message);
    return r.data;
  }), []);

  const availableTeams = (teams ?? []).filter((team) => !tournament || String(team.tournament_c?.Id ?? team.tournament_c) === String(tournament));

  async function createMatch(event) {
    event.preventDefault();
    if (!name.trim() || !tournament || !teamA || !teamB || teamA === teamB || !date || !Number.isInteger(Number(overs)) || Number(overs) < 1 || Number(overs) > 50) {
      return toast.error('Complete the required fields, choose two different teams and enter 1–50 whole overs.');
    }
    const selectedA = (teams ?? []).find((team) => String(team.Id) === String(teamA));
    const selectedB = (teams ?? []).find((team) => String(team.Id) === String(teamB));
    if (!selectedA || !selectedB || String(selectedA.tournament_c?.Id ?? selectedA.tournament_c) !== String(tournament) || String(selectedB.tournament_c?.Id ?? selectedB.tournament_c) !== String(tournament)) {
      return toast.error('Both teams must belong to the selected tournament.');
    }
    setSaving(true);
    try {
      const result = await sdk.table('matches_c').create({
        Name: name.trim(),
        tournament_c: tournament,
        team_a_c: teamA,
        team_b_c: teamB,
        match_date_c: date,
        start_time_c: time.trim(),
        venue_c: venue.trim(),
        overs_c: Number(overs),
        status_c: 'Scheduled'
      });
      if (!result.data?.length) return toast.error(result.messages?.[0] || result.message || 'Fixture could not be created.');
      toast.success('Fixture created.');
      setName('');
      setTeamA('');
      setTeamB('');
      setDate('');
      setTime('');
      setVenue('');
      setOvers('10');
      setCreating(false);
      run();
    } catch (e) {
      toast.error(e.message || 'Fixture could not be created.');
    } finally {
      setSaving(false);
    }
  }

  const matches = data ?? [];
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Match centre</p><h1 className="mt-2 font-heading text-4xl font-bold uppercase">Fixtures</h1><p className="mt-1 text-sm text-muted-foreground">Schedule matchups and keep every tournament's playing calendar in one place.</p></div>
        <Button onClick={() => setCreating((v) => !v)}><ApperIcon name="Plus" size={16} /> Schedule match</Button>
      </div>
      {creating ? <form onSubmit={createMatch} className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-3"><h2 className="font-heading text-xl font-bold uppercase">New fixture</h2></div>
        <div className="space-y-2"><Label htmlFor="matchName">Match title *</Label><Input id="matchName" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Panthers vs Strikers" required /></div>
        <div className="space-y-2"><Label htmlFor="matchTournament">Tournament *</Label><select id="matchTournament" value={tournament} onChange={(e) => { setTournament(e.target.value); setTeamA(''); setTeamB(''); }} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" required><option value="">Choose tournament</option>{(tournaments ?? []).map((item) => <option key={item.Id} value={item.Id}>{item.Name}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="matchDate">Match date *</Label><Input id="matchDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
        <div className="space-y-2"><Label htmlFor="teamA">Team A *</Label><select id="teamA" value={teamA} onChange={(e) => setTeamA(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" required><option value="">Choose team</option>{availableTeams.map((item) => <option key={item.Id} value={item.Id}>{item.Name}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="teamB">Team B *</Label><select id="teamB" value={teamB} onChange={(e) => setTeamB(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" required><option value="">Choose team</option>{availableTeams.filter((item) => String(item.Id) !== String(teamA)).map((item) => <option key={item.Id} value={item.Id}>{item.Name}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="overs">Overs per innings *</Label><Input id="overs" type="number" min="1" max="50" value={overs} onChange={(e) => setOvers(e.target.value)} required /></div>
        <div className="space-y-2"><Label htmlFor="matchTime">Start time</Label><Input id="matchTime" value={time} onChange={(e) => setTime(e.target.value)} placeholder="e.g. 7:30 PM" /></div>
        <div className="space-y-2"><Label htmlFor="venue">Venue</Label><Input id="venue" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Ground or stadium name" /></div>
        <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-3"><Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button><Button disabled={saving}>{saving ? 'Saving…' : 'Create fixture'}</Button></div>
      </form> : null}
      <div className="relative max-w-lg"><ApperIcon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search fixtures..." className="pl-9" /></div>
      {loading && data === undefined ? <ListSkeleton rows={6} /> : null}
      {error ? <div className="rounded-xl border border-destructive/30 p-5"><p className="font-semibold">Fixtures could not load.</p><p className="mt-1 text-sm text-muted-foreground">{error}</p><Button variant="outline" className="mt-3" onClick={run}>Try again</Button></div> : null}
      {!loading && !error && matches.length === 0 ? <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center"><ApperIcon name="CalendarDays" size={28} className="mx-auto text-muted-foreground" /><p className="mt-3 font-semibold">No fixtures scheduled</p><p className="mt-1 text-sm text-muted-foreground">Create squads first, then schedule the first match.</p><Button className="mt-4" onClick={() => setCreating(true)}>Schedule match</Button></div> : null}
      {matches.length > 0 ? <div className="overflow-hidden rounded-xl border border-border bg-card" aria-busy={loading}>
        <div className="hidden grid-cols-[1.5fr_1.2fr_1fr_auto] gap-4 border-b border-border bg-muted/50 px-5 py-3 text-xs font-bold uppercase tracking-wide text-muted-foreground md:grid"><span>Match</span><span>Tournament</span><span>Date & venue</span><span>Status</span></div>
        <div className="divide-y divide-border">{matches.map((match) => <Link key={match.Id} to={`/matches/${match.Id}`} className="grid gap-2 border-l-4 border-l-primary px-4 py-4 transition-colors hover:bg-accent md:grid-cols-[1.5fr_1.2fr_1fr_auto] md:items-center md:gap-4 md:px-5"><div><p className="font-semibold">{match.team_a_c?.Name || 'Team A'} <span className="text-muted-foreground">vs</span> {match.team_b_c?.Name || 'Team B'}</p><p className="mt-1 text-xs text-muted-foreground">{match.Name}</p></div><span className="text-sm text-muted-foreground">{match.tournament_c?.Name || 'Tournament'}</span><span className="text-sm">{formatLocalDate(match.match_date_c, DATE_FORMATS.SHORT)}{match.start_time_c ? ` · ${match.start_time_c}` : ''}<span className="block text-xs text-muted-foreground">{match.venue_c || 'Venue not set'}</span></span><span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[match.status_c] || 'bg-muted text-muted-foreground'}`}>{match.status_c}</span></Link>)}</div>
      </div> : null}
      <p className="text-xs text-muted-foreground">{matches.length} fixture{matches.length === 1 ? '' : 's'} shown</p>
    </div>
  );
}
