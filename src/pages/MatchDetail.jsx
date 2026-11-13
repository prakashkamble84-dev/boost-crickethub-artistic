import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DetailSkeleton } from '@/components/PageSkeleton';
import { toast } from 'sonner';
import { formatLocalDate, DATE_FORMATS } from '@/utils/date';

const FIELDS = ['Id', 'Name', 'tournament_c', 'team_a_c', 'team_b_c', 'match_date_c', 'start_time_c', 'venue_c', 'overs_c', 'status_c'];

export const route = { path: '/matches/:id', layout: 'owner', access: 'authenticated' };

export default function MatchDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [venue, setVenue] = useState('');
  const [overs, setOvers] = useState('10');
  const { data: match, loading, error, run } = useFetch(() => sdk.table('matches_c').select(FIELDS).get(id).then((r) => {
    if (!r.success) throw new Error(r.message);
    return r.data;
  }), [id]);

  function beginEdit() {
    setName(match.Name || '');
    setDate(match.match_date_c || '');
    setTime(match.start_time_c || '');
    setVenue(match.venue_c || '');
    setOvers(String(match.overs_c || 10));
    setEditing(true);
  }

  async function save(event) {
    event.preventDefault();
    if (!name.trim() || !date || Number(overs) < 1 || Number(overs) > 50) return toast.error('Check the match title, date and overs.');
    setSaving(true);
    try {
      const result = await sdk.table('matches_c').update({ Id: id, Name: name.trim(), match_date_c: date, start_time_c: time.trim(), venue_c: venue.trim(), overs_c: Number(overs) });
      if (!result.data?.length) return toast.error(result.messages?.[0] || 'Fixture could not be updated.');
      toast.success('Fixture updated.');
      setEditing(false);
      run();
    } catch (e) {
      toast.error(e.message || 'Fixture could not be updated.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete fixture ${match.Name}?`)) return;
    const result = await sdk.table('matches_c').remove(id);
    if (!result.data?.length) return toast.error(result.messages?.[0] || 'Fixture could not be deleted.');
    toast.success('Fixture deleted.');
    navigate('/matches');
  }

  if (loading) return <DetailSkeleton />;
  if (error) return <div className="rounded-xl border border-destructive/30 p-5"><p className="font-semibold">Fixture could not load.</p><p className="mt-1 text-sm text-muted-foreground">{error.message}</p><Button variant="outline" className="mt-3" onClick={run}>Try again</Button></div>;
  if (!match) return <div className="rounded-xl border border-border p-6">Fixture not found. <Link className="text-primary underline" to="/matches">Back to Fixtures</Link></div>;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button variant="ghost" size="sm" asChild><Link to="/matches"><ApperIcon name="ArrowLeft" size={16} /> Back to Fixtures</Link></Button>
      <section className="flex flex-col gap-4 border-l-4 border-l-primary pl-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Fixture details</p><h1 className="mt-2 font-heading text-4xl font-bold uppercase">{match.Name}</h1><p className="mt-2 text-sm text-muted-foreground">{match.tournament_c?.Name || 'Tournament'}</p></div><div className="flex gap-2"><Button variant="outline" onClick={beginEdit}><ApperIcon name="Pencil" size={15} /> Edit fixture</Button><Button variant="destructive" onClick={remove}><ApperIcon name="Trash2" size={15} /> Delete</Button></div></section>
      <div className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2"><div className="sm:col-span-2"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Matchup</p><p className="mt-2 font-heading text-3xl font-bold">{match.team_a_c?.Name || 'Team A'} <span className="text-muted-foreground">vs</span> {match.team_b_c?.Name || 'Team B'}</p></div><div><p className="text-xs text-muted-foreground">Date & start time</p><p className="mt-1 font-semibold">{formatLocalDate(match.match_date_c, DATE_FORMATS.SHORT)} · {match.start_time_c || 'Time not set'}</p></div><div><p className="text-xs text-muted-foreground">Venue</p><p className="mt-1 font-semibold">{match.venue_c || 'Not set'}</p></div><div><p className="text-xs text-muted-foreground">Overs per innings</p><p className="mt-1 font-semibold tabular-nums">{match.overs_c}</p></div><div><p className="text-xs text-muted-foreground">Status</p><p className="mt-1 font-semibold">{match.status_c}</p></div></div>
      {editing ? <form onSubmit={save} className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2"><h2 className="font-heading text-xl font-bold uppercase sm:col-span-2">Edit fixture details</h2><div className="space-y-2"><Label htmlFor="name">Match title</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Panthers vs Strikers" required /></div><div className="space-y-2"><Label htmlFor="date">Match date</Label><Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></div><div className="space-y-2"><Label htmlFor="time">Start time</Label><Input id="time" value={time} onChange={(e) => setTime(e.target.value)} placeholder="e.g. 7:30 PM" /></div><div className="space-y-2"><Label htmlFor="venue">Venue</Label><Input id="venue" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Ground or stadium name" /></div><div className="space-y-2"><Label htmlFor="overs">Overs per innings</Label><Input id="overs" type="number" min="1" max="50" value={overs} onChange={(e) => setOvers(e.target.value)} required /></div><div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button><Button disabled={saving}>{saving ? 'Saving…' : 'Save fixture'}</Button></div></form> : null}
      <div className="rounded-xl border border-dashed border-border p-5"><div className="flex items-center gap-2"><ApperIcon name="RadioTower" size={18} className="text-highlight" /><h2 className="font-semibold">Live scoring setup</h2></div><p className="mt-2 text-sm text-muted-foreground">Scorer invitations and ball-by-ball scoring will attach to this match record in the next build milestone.</p></div>
    </div>
  );
}
