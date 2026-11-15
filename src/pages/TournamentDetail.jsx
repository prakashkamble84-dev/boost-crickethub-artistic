import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { DetailSkeleton } from '@/components/PageSkeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { formatLocalDate, DATE_FORMATS } from '@/utils/date';
import { toast } from 'sonner';

const { eq } = window.ApperSDK.CoreSDK;
const FIELDS = ['Id', 'Name', 'status_c', 'format_c', 'location_c', 'start_date_c', 'end_date_c', 'overs_c', 'teams_count_c', 'is_public_c', 'description_c'];
const TEAM_FIELDS = ['Id', 'Name', 'tournament_c'];
const MATCH_FIELDS = ['Id', 'Name', 'team_a_c', 'team_b_c', 'status_c', 'result_type_c', 'winner_team_c'];

function calculateStandings(teams, matches) {
  const rows = new Map((teams ?? []).map(team => [String(team.Id), {
    team, played: 0, won: 0, lost: 0, tied: 0, noResult: 0, abandoned: 0, points: 0
  }]));
  (matches ?? []).forEach(match => {
    if (!['Completed', 'Abandoned'].includes(match.status_c)) return;
    const a = rows.get(String(match.team_a_c?.Id ?? match.team_a_c ?? ''));
    const b = rows.get(String(match.team_b_c?.Id ?? match.team_b_c ?? ''));
    if (!a || !b || a === b) return;
    a.played += 1;
    b.played += 1;
    if (match.status_c === 'Abandoned' || match.result_type_c === 'Abandoned') {
      a.abandoned += 1; b.abandoned += 1;
      a.points += 1; b.points += 1;
    } else if (match.result_type_c === 'No Result') {
      a.noResult += 1; b.noResult += 1;
      a.points += 1; b.points += 1;
    } else if (match.result_type_c === 'Tie') {
      a.tied += 1; b.tied += 1;
      a.points += 1; b.points += 1;
    } else if (match.result_type_c === 'Win') {
      const winnerId = String(match.winner_team_c?.Id ?? match.winner_team_c ?? '');
      if (winnerId === String(a.team.Id)) { a.won += 1; a.points += 2; b.lost += 1; }
      else if (winnerId === String(b.team.Id)) { b.won += 1; b.points += 2; a.lost += 1; }
    }
  });
  return [...rows.values()].sort((a, b) => b.points - a.points || b.won - a.won || a.team.Name.localeCompare(b.team.Name));
}

const badge = {
  Draft: 'bg-muted text-muted-foreground',
  Upcoming: 'bg-primary/10 text-primary',
  Live: 'bg-highlight/10 text-highlight',
  Completed: 'bg-success-muted text-success',
  Cancelled: 'bg-warning-muted text-warning',
};

export const route = { path: '/tournaments/:id', layout: 'owner', access: 'authenticated' };

export default function TournamentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { data: tournament, loading, error, run } = useFetch(() => sdk.table('tournaments_c').select(FIELDS).get(id).then((result) => {
    if (!result.success) throw new Error(result.message);
    return result.data;
  }), [id]);
  const { data: teams, loading: teamsLoading, error: teamsError, run: reloadTeams } = useFetch(() => sdk.table('squads_c').select(TEAM_FIELDS).where(eq('tournament_c', id)).orderBy('Name').fetch().then(result => {
    if (!result.success) throw new Error(result.message);
    return result.data ?? [];
  }), [id]);
  const { data: matches, loading: matchesLoading, error: matchesError, run: reloadMatches } = useFetch(() => sdk.table('matches_c').select(MATCH_FIELDS).where(eq('tournament_c', id)).fetch().then(result => {
    if (!result.success) throw new Error(result.message);
    return result.data ?? [];
  }), [id]);
  const standings = useMemo(() => calculateStandings(teams, matches), [teams, matches]);

  async function removeTournament() {
    setDeleting(true);
    try {
      const result = await sdk.table('tournaments_c').remove(id);
      if (!result.data?.length) {
        toast.error(result.messages?.[0] || result.message || 'Tournament could not be deleted.');
        return;
      }
      toast.success('Tournament deleted.');
      setDeleteOpen(false);
      navigate('/tournaments');
    } catch (removeError) {
      toast.error(removeError.message || 'Tournament could not be deleted.');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <DetailSkeleton />;
  if (error) return <div className="rounded-xl border border-destructive/30 p-5"><p className="font-medium">Could not load tournament.</p><p className="mt-1 text-sm text-muted-foreground">{error.message}</p><Button variant="outline" className="mt-3" onClick={run}>Try again</Button></div>;
  if (!tournament) return <div className="rounded-xl border border-border p-6">Tournament not found.</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button variant="ghost" size="sm" asChild><Link to="/tournaments"><ApperIcon name="ArrowLeft" size={16} /> Back to Tournaments</Link></Button>
      <div className="flex flex-col gap-4 border-l-4 border-l-primary pl-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Tournament record</p>
          <h1 className="mt-2 font-heading text-3xl font-semibold">{tournament.Name}</h1>
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><ApperIcon name="MapPin" size={15} /> {tournament.location_c}</p>
          <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${badge[tournament.status_c] ?? 'bg-muted text-muted-foreground'}`}>{tournament.status_c}</span>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link to={`/tournaments/${id}/edit`}><ApperIcon name="Pencil" size={15} /> Edit</Link></Button>
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogTrigger asChild><Button variant="destructive">Delete tournament</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {tournament.Name}?</AlertDialogTitle>
                <AlertDialogDescription>This permanently removes this tournament record. This action cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Keep tournament</AlertDialogCancel>
                <AlertDialogAction variant="destructive" disabled={deleting} onClick={(event) => { event.preventDefault(); removeTournament(); }}>{deleting ? 'Deleting…' : 'Delete tournament'}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Format</p><p className="mt-2 font-semibold">{tournament.format_c}</p></div>
        <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Overs per innings</p><p className="mt-2 font-semibold tabular-nums">{tournament.overs_c} overs</p></div>
        <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Expected teams</p><p className="mt-2 font-semibold tabular-nums">{tournament.teams_count_c}</p></div>
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-heading text-lg font-semibold">Competition details</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">Start date</dt><dd className="mt-1 font-medium">{formatLocalDate(tournament.start_date_c, DATE_FORMATS.SHORT)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">End date</dt><dd className="mt-1 font-medium">{tournament.end_date_c ? formatLocalDate(tournament.end_date_c, DATE_FORMATS.SHORT) : 'Not set'}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Public scoreboard</dt><dd className="mt-1 font-medium">{tournament.is_public_c ? 'Enabled' : 'Private'}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Tournament format</dt><dd className="mt-1 font-medium">{tournament.format_c}</dd></div>
        </dl>
        <div className="mt-5 border-t border-border pt-4"><dt className="text-xs text-muted-foreground">Description</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{tournament.description_c || 'No description added.'}</dd></div>
      </div>
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-primary">League table</p>
            <h2 className="mt-1 font-heading text-xl font-bold uppercase">Tournament standings</h2>
            <p className="mt-1 text-sm text-muted-foreground">Calculated from finalized fixtures. Live and scheduled matches do not affect points.</p>
          </div>
          <Button size="sm" variant="outline" disabled={teamsLoading || matchesLoading} onClick={() => { reloadTeams(); reloadMatches(); }}>Refresh standings</Button>
        </div>
        {teamsError || matchesError ? <div className="p-5 text-sm text-destructive">Standings could not be loaded: {teamsError?.message || matchesError?.message}</div> : teamsLoading || matchesLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading standings…</div> : !standings.length ? <div className="p-8 text-center text-sm text-muted-foreground">No teams are registered in this tournament yet.</div> : <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3 text-left">Pos</th><th className="px-4 py-3 text-left">Team</th><th className="px-2 py-3 text-right">P</th><th className="px-2 py-3 text-right">W</th><th className="px-2 py-3 text-right">L</th><th className="px-2 py-3 text-right">T</th><th className="px-2 py-3 text-right">NR</th><th className="px-2 py-3 text-right">A</th><th className="px-4 py-3 text-right">Pts</th></tr></thead>
            <tbody>{standings.map((row, index) => <tr key={row.team.Id} className="border-t border-border"><td className="px-4 py-3 font-semibold tabular-nums">{index + 1}</td><td className="px-4 py-3 font-semibold">{row.team.Name}</td><td className="px-2 py-3 text-right tabular-nums">{row.played}</td><td className="px-2 py-3 text-right tabular-nums">{row.won}</td><td className="px-2 py-3 text-right tabular-nums">{row.lost}</td><td className="px-2 py-3 text-right tabular-nums">{row.tied}</td><td className="px-2 py-3 text-right tabular-nums">{row.noResult}</td><td className="px-2 py-3 text-right tabular-nums">{row.abandoned}</td><td className="px-4 py-3 text-right font-bold tabular-nums">{row.points}</td></tr>)}</tbody>
          </table>
        </div>}
        <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">Points: win 2 · tie 1 · no result 1 · abandoned 1 · loss 0. Tiebreak order: points, wins, then team name. Net run rate is not yet calculated.</div>
      </section>
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-bold uppercase">Tournament operations</h2>
            <p className="mt-1 text-sm text-muted-foreground">Manage registered squads and scheduled matches for this competition.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline"><Link to="/teams">Manage teams</Link></Button>
            <Button asChild><Link to="/matches">View fixtures</Link></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
