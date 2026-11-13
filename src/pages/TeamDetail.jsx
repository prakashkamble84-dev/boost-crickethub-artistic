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

const TEAM_FIELDS = ['Id', 'Name', 'tournament_c', 'captain_c', 'contact_c'];
const PLAYER_FIELDS = ['Id', 'Name', 'squad_c', 'jersey_number_c', 'role_c', 'CreatedOn'];

export const route = { path: '/teams/:id', layout: 'owner', access: 'authenticated' };

export default function TeamDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [teamEditing, setTeamEditing] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [captain, setCaptain] = useState('');
  const [contact, setContact] = useState('');
  const [playerForm, setPlayerForm] = useState(false);
  const [playerEditing, setPlayerEditing] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [jersey, setJersey] = useState('');
  const [role, setRole] = useState('All-rounder');
  const [saving, setSaving] = useState(false);
  const { data: team, loading, error, run } = useFetch(() => sdk.table('squads_c').select(TEAM_FIELDS).get(id).then((r) => {
    if (!r.success) throw new Error(r.message);
    return r.data;
  }), [id]);
  const { data: players, loading: playersLoading, error: playersError, run: runPlayers } = useFetch(() => {
    const { eq } = window.ApperSDK.CoreSDK;
    return sdk.table('players_c').select(PLAYER_FIELDS).where(eq('squad_c', id)).orderByDesc('CreatedOn').fetch().then((r) => {
      if (!r.success) throw new Error(r.message);
      return r.data;
    });
  }, [id]);

  function beginTeamEdit() {
    setTeamName(team.Name || '');
    setCaptain(team.captain_c || '');
    setContact(team.contact_c || '');
    setTeamEditing(true);
  }

  async function saveTeam(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await sdk.table('squads_c').update({ Id: id, Name: teamName.trim(), captain_c: captain.trim(), contact_c: contact.trim() });
      if (!result.data?.length) return toast.error(result.messages?.[0] || 'Team could not be updated.');
      toast.success('Team updated.');
      setTeamEditing(false);
      run();
    } catch (e) {
      toast.error(e.message || 'Team could not be updated.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteTeam() {
    if (!window.confirm(`Delete ${team.Name}? Its player records should be removed first.`)) return;
    if ((players ?? []).length) return toast.error('Remove the players from this squad before deleting it.');
    const result = await sdk.table('squads_c').remove(id);
    if (!result.data?.length) return toast.error(result.messages?.[0] || 'Team could not be deleted.');
    toast.success('Team deleted.');
    navigate('/teams');
  }

  function startPlayerEdit(player) {
    setPlayerEditing(player);
    setPlayerName(player.Name);
    setJersey(player.jersey_number_c ?? '');
    setRole(player.role_c || 'All-rounder');
    setPlayerForm(true);
  }

  async function savePlayer(event) {
    event.preventDefault();
    if (!playerName.trim()) return toast.error('Enter the player name.');
    if (jersey !== '' && (!Number.isInteger(Number(jersey)) || Number(jersey) < 0 || Number(jersey) > 999)) return toast.error('Jersey number must be a whole number from 0 to 999.');
    setSaving(true);
    try {
      const payload = { Name: playerName.trim(), squad_c: id, jersey_number_c: jersey === '' ? null : Number(jersey), role_c: role };
      const result = playerEditing
        ? await sdk.table('players_c').update({ Id: playerEditing.Id, ...payload })
        : await sdk.table('players_c').create(payload);
      if (!result.data?.length) return toast.error(result.messages?.[0] || result.message || 'Player could not be saved.');
      toast.success(playerEditing ? 'Player updated.' : 'Player added.');
      setPlayerName('');
      setJersey('');
      setRole('All-rounder');
      setPlayerEditing(null);
      setPlayerForm(false);
      runPlayers();
    } catch (e) {
      toast.error(e.message || 'Player could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function removePlayer(player) {
    if (!window.confirm(`Remove ${player.Name} from this squad?`)) return;
    const result = await sdk.table('players_c').remove(player.Id);
    if (!result.data?.length) return toast.error(result.messages?.[0] || 'Player could not be removed.');
    toast.success('Player removed.');
    runPlayers();
  }

  if (loading) return <DetailSkeleton />;
  if (error) return <div className="rounded-xl border border-destructive/30 p-5"><p className="font-semibold">Team could not load.</p><p className="mt-1 text-sm text-muted-foreground">{error}</p><Button variant="outline" className="mt-3" onClick={run}>Try again</Button></div>;
  if (!team) return <div className="rounded-xl border border-border p-6">Team not found. <Link className="text-primary underline" to="/teams">Back to Teams</Link></div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Button asChild size="sm" variant="ghost"><Link to="/teams"><ApperIcon name="ArrowLeft" size={16} /> Back to Teams</Link></Button>
      <section className="flex flex-col gap-4 border-l-4 border-l-primary pl-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Team record</p><h1 className="mt-2 font-heading text-5xl font-bold uppercase">{team.Name}</h1><p className="mt-2 text-sm text-muted-foreground">{team.tournament_c?.Name || 'Tournament'} · Captain: {team.captain_c || 'Not assigned'}</p></div><div className="flex gap-2"><Button variant="outline" onClick={beginTeamEdit}><ApperIcon name="Pencil" size={15} /> Edit team</Button><Button variant="destructive" onClick={deleteTeam}><ApperIcon name="Trash2" size={15} /> Delete</Button></div></section>
      {teamEditing ? <form onSubmit={saveTeam} className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-3"><div className="space-y-2"><Label htmlFor="teamName">Team name</Label><Input id="teamName" value={teamName} onChange={(e) => setTeamName(e.target.value)} required /></div><div className="space-y-2"><Label htmlFor="captain">Captain</Label><Input id="captain" value={captain} onChange={(e) => setCaptain(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="contact">Contact email</Label><Input id="contact" type="email" value={contact} onChange={(e) => setContact(e.target.value)} /></div><div className="flex justify-end gap-2 sm:col-span-3"><Button type="button" variant="outline" onClick={() => setTeamEditing(false)}>Cancel</Button><Button disabled={saving}>{saving ? 'Saving…' : 'Save team'}</Button></div></form> : null}
      <section className="space-y-4">
        <div className="flex items-end justify-between"><div><h2 className="font-heading text-2xl font-bold uppercase">Squad roster</h2><p className="text-sm text-muted-foreground">Manage players, shirt numbers and playing roles.</p></div><Button onClick={() => { setPlayerEditing(null); setPlayerName(''); setJersey(''); setRole('All-rounder'); setPlayerForm((v) => !v); }}><ApperIcon name="UserPlus" size={16} /> Add player</Button></div>
        {playerForm ? <form onSubmit={savePlayer} className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-3"><div className="sm:col-span-3"><h3 className="font-heading text-xl font-bold uppercase">{playerEditing ? 'Edit player' : 'Add player'}</h3></div><div className="space-y-2"><Label htmlFor="playerName">Player name *</Label><Input id="playerName" value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="e.g. Rohan Jadhav" required /></div><div className="space-y-2"><Label htmlFor="jersey">Jersey number</Label><Input id="jersey" type="number" min="0" max="999" value={jersey} onChange={(e) => setJersey(e.target.value)} placeholder="e.g. 18" /></div><div className="space-y-2"><Label htmlFor="role">Playing role</Label><select id="role" value={role} onChange={(e) => setRole(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option>Batter</option><option>Bowler</option><option>All-rounder</option><option>Wicketkeeper</option></select></div><div className="flex justify-end gap-2 sm:col-span-3"><Button type="button" variant="outline" onClick={() => setPlayerForm(false)}>Cancel</Button><Button disabled={saving}>{saving ? 'Saving…' : playerEditing ? 'Save player' : 'Add player'}</Button></div></form> : null}
        {playersLoading && players === undefined ? <DetailSkeleton /> : null}
        {playersError ? <div className="rounded-xl border border-destructive/30 p-4"><p>{playersError}</p><Button variant="outline" className="mt-2" onClick={runPlayers}>Try again</Button></div> : null}
        {!playersLoading && !playersError && (players ?? []).length === 0 ? <div className="rounded-xl border border-dashed border-border p-8 text-center"><ApperIcon name="Users" size={26} className="mx-auto text-muted-foreground" /><p className="mt-3 font-semibold">No players in this squad yet</p><p className="mt-1 text-sm text-muted-foreground">Add players to build the match roster.</p></div> : null}
        {(players ?? []).map((player) => <div key={player.Id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center"><div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-heading text-xl font-bold text-primary">{player.jersey_number_c ?? '—'}</div><div className="min-w-0 flex-1"><p className="font-semibold">{player.Name}</p><p className="mt-1 text-xs text-muted-foreground">{player.role_c}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => startPlayerEdit(player)}><ApperIcon name="Pencil" size={14} /> Edit</Button><Button size="sm" variant="ghost" onClick={() => removePlayer(player)}><ApperIcon name="Trash2" size={14} /> Remove</Button></div></div>)}
      </section>
    </div>
  );
}
