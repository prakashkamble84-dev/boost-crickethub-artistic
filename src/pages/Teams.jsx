import { useState } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ListSkeleton } from '@/components/PageSkeleton';
import { toast } from 'sonner';

const { contains } = window.ApperSDK.CoreSDK;
const TEAM_FIELDS = ['Id', 'Name', 'tournament_c', 'captain_c', 'contact_c', 'color_c', 'CreatedOn'];
const TOURNAMENT_FIELDS = ['Id', 'Name'];

export const route = { path: '/teams', layout: 'owner', access: 'authenticated' };
export const nav = { icon: 'Shield', label: 'Teams', section: 'Manage', order: 30 };

export default function Teams() {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [tournament, setTournament] = useState('');
  const [captain, setCaptain] = useState('');
  const [contact, setContact] = useState('');
  const user = useSelector((state) => state.user.user);
  const { data, loading, error, run } = useFetch(() => {
    let q = sdk.table('squads_c').select(TEAM_FIELDS);
    if (search.trim()) q = q.where(contains('Name', search.trim()));
    return q.orderByDesc('CreatedOn').fetch().then((r) => {
      if (!r.success) throw new Error(r.message);
      return r.data;
    });
  }, [search]);
  const { data: tournaments } = useFetch(() => sdk.table('tournaments_c').select(TOURNAMENT_FIELDS).orderByDesc('CreatedOn').fetch().then((r) => {
    if (!r.success) throw new Error(r.message);
    return r.data;
  }), []);

  async function createTeam(event) {
    event.preventDefault();
    if (!name.trim() || !tournament) return toast.error('Enter a team name and choose its tournament.');
    setSaving(true);
    try {
      const selected = (tournaments ?? []).find((item) => String(item.Id) === String(tournament));
      const result = await sdk.table('squads_c').create({ Name: name.trim(), tournament_c: tournament, captain_c: captain.trim(), contact_c: contact.trim(), Owner: user?.Id });
      if (!result.data?.length) return toast.error(result.messages?.[0] || result.message || 'Team could not be created.');
      toast.success('Team created.');
      setName('');
      setTournament('');
      setCaptain('');
      setContact('');
      setShowForm(false);
      run();
    } catch (e) {
      toast.error(e.message || 'Team could not be created.');
    } finally {
      setSaving(false);
    }
  }

  const teams = data ?? [];
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Competition roster</p><h1 className="mt-2 font-heading text-4xl font-bold uppercase">Teams</h1><p className="mt-1 text-sm text-muted-foreground">Manage squads and player rosters for each tournament.</p></div>
        <Button onClick={() => setShowForm((v) => !v)} className="gap-2"><ApperIcon name="Plus" size={16} /> Add team</Button>
      </div>
      {showForm ? <form onSubmit={createTeam} className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
        <div className="sm:col-span-2"><h2 className="font-heading text-xl font-bold uppercase">New team</h2></div>
        <div className="space-y-2"><Label htmlFor="teamName">Team name *</Label><Input id="teamName" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pune Panthers" required /></div>
        <div className="space-y-2"><Label htmlFor="teamTournament">Tournament *</Label><select id="teamTournament" value={tournament} onChange={(e) => setTournament(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" required><option value="">Choose tournament</option>{(tournaments ?? []).map((item) => <option key={item.Id} value={item.Id}>{item.Name}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="captain">Captain</Label><Input id="captain" value={captain} onChange={(e) => setCaptain(e.target.value)} placeholder="Captain's full name" /></div>
        <div className="space-y-2"><Label htmlFor="contact">Team contact email</Label><Input id="contact" type="email" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="team@example.com" /></div>
        <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button><Button disabled={saving}>{saving ? 'Saving…' : 'Create team'}</Button></div>
      </form> : null}
      <div className="relative max-w-lg"><ApperIcon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search team names..." className="pl-9" /></div>
      {loading && data === undefined ? <ListSkeleton rows={6} /> : null}
      {error ? <div className="rounded-xl border border-destructive/30 p-5"><p className="font-semibold">Teams could not load.</p><p className="mt-1 text-sm text-muted-foreground">{error}</p><Button variant="outline" className="mt-3" onClick={run}>Try again</Button></div> : null}
      {!loading && !error && teams.length === 0 ? <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center"><ApperIcon name="Shield" size={28} className="mx-auto text-muted-foreground" /><p className="mt-3 font-semibold">No teams yet</p><p className="mt-1 text-sm text-muted-foreground">Add the first squad to a tournament.</p><Button className="mt-4" onClick={() => setShowForm(true)}>Add team</Button></div> : null}
      {teams.length > 0 ? <div className="overflow-hidden rounded-xl border border-border bg-card" aria-busy={loading}>
        <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] gap-4 border-b border-border bg-muted/50 px-5 py-3 text-xs font-bold uppercase tracking-wide text-muted-foreground md:grid"><span>Team</span><span>Tournament</span><span>Captain</span><span>Roster</span></div>
        <div className="divide-y divide-border">{teams.map((team) => <Link key={team.Id} to={`/teams/${team.Id}`} className="group grid gap-2 border-l-4 border-l-primary px-4 py-4 transition-colors hover:bg-accent md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] md:items-center md:gap-4 md:px-5"><div><p className="font-semibold group-hover:text-highlight">{team.Name}</p><p className="mt-1 text-xs text-muted-foreground">{team.contact_c || 'No team email'}</p></div><span className="text-sm text-muted-foreground">{team.tournament_c?.Name || 'Tournament not set'}</span><span className="text-sm">{team.captain_c || 'Not assigned'}</span><span className="flex items-center gap-2 text-sm text-primary">Manage squad <ApperIcon name="ChevronRight" size={15} /></span></Link>)}</div>
      </div> : null}
      <p className="text-xs text-muted-foreground">{teams.length} team{teams.length === 1 ? '' : 's'} shown</p>
    </div>
  );
}
