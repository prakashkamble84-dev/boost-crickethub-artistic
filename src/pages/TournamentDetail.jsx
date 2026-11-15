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
const MATCH_FIELDS = ['Id', 'Name', 'team_a_c', 'team_b_c', 'status_c', 'result_type_c', 'winner_team_c', 'overs_c'];
const INNINGS_FIELDS = ['Id', 'match_c', 'batting_team_c', 'bowling_team_c', 'status_c', 'total_runs_c', 'wickets_c', 'legal_balls_c'];
const DELIVERY_FIELDS = ['Id', 'innings_c', 'striker_c', 'bowler_c', 'batter_runs_c', 'extras_type_c', 'extras_runs_c', 'is_legal_ball_c', 'wicket_type_c'];
const PLAYER_FIELDS = ['Id', 'Name', 'squad_c'];

const idOf = value => String(value?.Id ?? value ?? '');

function calculatePlayerLeaders(teams, players, deliveries) {
  const teamNames = new Map((teams ?? []).map(team => [String(team.Id), team.Name]));
  const playerMap = new Map((players ?? []).map(player => [String(player.Id), player]));
  const batting = new Map();
  const bowling = new Map();
  const creditedWickets = new Set(['Bowled', 'Caught', 'LBW', 'Stumped', 'Hit wicket']);

  (deliveries ?? []).forEach(ball => {
    const strikerId = idOf(ball.striker_c);
    const bowlerId = idOf(ball.bowler_c);
    const type = ball.extras_type_c || 'None';
    const batterRuns = Number(ball.batter_runs_c || 0);
    const extras = Number(ball.extras_runs_c || 0);

    if (strikerId) {
      const row = batting.get(strikerId) || { playerId: strikerId, runs: 0, balls: 0, fours: 0, sixes: 0 };
      row.runs += batterRuns;
      if (type !== 'Wide' && type !== 'Penalty') row.balls += 1;
      if (batterRuns === 4) row.fours += 1;
      if (batterRuns === 6) row.sixes += 1;
      batting.set(strikerId, row);
    }

    if (bowlerId) {
      const row = bowling.get(bowlerId) || { playerId: bowlerId, balls: 0, runs: 0, wickets: 0 };
      if (ball.is_legal_ball_c) row.balls += 1;
      if (type === 'Wide' || type === 'No-ball') row.runs += extras + batterRuns;
      else if (!['Bye', 'Leg-bye', 'Penalty'].includes(type)) row.runs += batterRuns;
      if (creditedWickets.has(ball.wicket_type_c)) row.wickets += 1;
      bowling.set(bowlerId, row);
    }
  });

  const battingRows = [...batting.values()].map(row => {
    const player = playerMap.get(row.playerId);
    return { ...row, player, teamName: teamNames.get(idOf(player?.squad_c)) || 'Unknown team', strikeRate: row.balls ? row.runs / row.balls * 100 : 0 };
  }).sort((a, b) => b.runs - a.runs || b.strikeRate - a.strikeRate);

  const bowlingRows = [...bowling.values()].map(row => {
    const player = playerMap.get(row.playerId);
    return { ...row, player, teamName: teamNames.get(idOf(player?.squad_c)) || 'Unknown team', economy: row.balls ? row.runs / (row.balls / 6) : 0, overs: `${Math.floor(row.balls / 6)}.${row.balls % 6}` };
  }).sort((a, b) => b.wickets - a.wickets || a.economy - b.economy);

  const tiedLeaders = (rows, metric, direction = 'max') => {
    if (!rows.length) return [];
    const target = rows.reduce((best, row) => direction === 'min' ? Math.min(best, metric(row)) : Math.max(best, metric(row)), direction === 'min' ? Infinity : -Infinity);
    return rows.filter(row => metric(row) === target);
  };
  const awards = [
    { title: 'Leading run-scorer', detail: row => `${row.runs} runs`, winners: tiedLeaders(battingRows, row => row.runs) },
    { title: 'Leading wicket-taker', detail: row => `${row.wickets} wickets`, winners: tiedLeaders(bowlingRows, row => row.wickets) },
    { title: 'Best strike rate', detail: row => `${row.strikeRate.toFixed(2)} SR · ${row.balls} balls`, winners: tiedLeaders(battingRows.filter(row => row.balls >= 10), row => row.strikeRate) },
    { title: 'Best bowling economy', detail: row => `${row.economy.toFixed(2)} economy · ${row.overs} overs`, winners: tiedLeaders(bowlingRows.filter(row => row.balls >= 12), row => row.economy, 'min') }
  ];
  return { batting: battingRows.slice(0, 10), bowling: bowlingRows.slice(0, 10), awards };
}

function calculateStandings(teams, matches, innings) {
  const rows = new Map((teams ?? []).map(team => [String(team.Id), {
    team, played: 0, won: 0, lost: 0, tied: 0, noResult: 0, abandoned: 0, points: 0,
    runsFor: 0, ballsFaced: 0, runsAgainst: 0, ballsBowled: 0, nrr: null
  }]));
  (matches ?? []).forEach(match => {
    if (!['Completed', 'Abandoned'].includes(match.status_c)) return;
    const a = rows.get(String(match.team_a_c?.Id ?? match.team_a_c ?? ''));
    const b = rows.get(String(match.team_b_c?.Id ?? match.team_b_c ?? ''));
    if (!a || !b || a === b) return;
    if (match.status_c === 'Abandoned' || match.result_type_c === 'Abandoned') {
      a.played += 1; b.played += 1;
      a.abandoned += 1; b.abandoned += 1;
      a.points += 1; b.points += 1;
    } else if (match.status_c === 'Completed' && match.result_type_c === 'No Result') {
      a.played += 1; b.played += 1;
      a.noResult += 1; b.noResult += 1;
      a.points += 1; b.points += 1;
    } else if (match.status_c === 'Completed' && match.result_type_c === 'Tie') {
      a.played += 1; b.played += 1;
      a.tied += 1; b.tied += 1;
      a.points += 1; b.points += 1;
    } else if (match.status_c === 'Completed' && match.result_type_c === 'Win') {
      const winnerId = String(match.winner_team_c?.Id ?? match.winner_team_c ?? '');
      if (winnerId === String(a.team.Id)) { a.played += 1; b.played += 1; a.won += 1; a.points += 2; b.lost += 1; }
      else if (winnerId === String(b.team.Id)) { a.played += 1; b.played += 1; b.won += 1; b.points += 2; a.lost += 1; }
    }
  });
  const eligibleMatches = new Map((matches ?? []).filter(match => match.status_c === 'Completed' && (match.result_type_c === 'Tie' || (match.result_type_c === 'Win' && [String(match.team_a_c?.Id ?? match.team_a_c ?? ''), String(match.team_b_c?.Id ?? match.team_b_c ?? '')].includes(String(match.winner_team_c?.Id ?? match.winner_team_c ?? ''))))).map(match => [String(match.Id), match]));
  const inningsByMatch = new Map();
  (innings ?? []).forEach(frame => {
    const matchId = String(frame.match_c?.Id ?? frame.match_c ?? '');
    if (!eligibleMatches.has(matchId) || frame.status_c !== 'Completed') return;
    if (!inningsByMatch.has(matchId)) inningsByMatch.set(matchId, []);
    inningsByMatch.get(matchId).push(frame);
  });
  inningsByMatch.forEach((frames, matchId) => {
    const match = eligibleMatches.get(matchId);
    if (frames.length !== 2) return;
    const aId = String(match.team_a_c?.Id ?? match.team_a_c ?? '');
    const bId = String(match.team_b_c?.Id ?? match.team_b_c ?? '');
    const battingIds = frames.map(frame => String(frame.batting_team_c?.Id ?? frame.batting_team_c ?? ''));
    if (!battingIds.includes(aId) || !battingIds.includes(bId) || new Set(battingIds).size !== 2) return;
    frames.forEach(frame => {
      const batting = rows.get(String(frame.batting_team_c?.Id ?? frame.batting_team_c ?? ''));
      const bowling = rows.get(String(frame.bowling_team_c?.Id ?? frame.bowling_team_c ?? ''));
      if (!batting || !bowling) return;
      const quota = Math.max(0, Number(match.overs_c || 0) * 6);
      const legalBalls = Number(frame.legal_balls_c || 0);
      const ballsFaced = Number(frame.wickets_c || 0) >= 10 && quota > 0 ? quota : legalBalls;
      batting.runsFor += Number(frame.total_runs_c || 0);
      batting.ballsFaced += ballsFaced;
      bowling.runsAgainst += Number(frame.total_runs_c || 0);
      bowling.ballsBowled += ballsFaced;
    });
  });
  [...rows.values()].forEach(row => {
    row.nrr = row.ballsFaced > 0 && row.ballsBowled > 0
      ? row.runsFor / (row.ballsFaced / 6) - row.runsAgainst / (row.ballsBowled / 6)
      : 0;
  });
  return [...rows.values()].sort((a, b) => b.points - a.points || b.nrr - a.nrr || b.won - a.won || a.team.Name.localeCompare(b.team.Name));
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
  const matchKey = (matches ?? []).map(match => match.Id).join('|');
  const { data: innings, loading: inningsLoading, error: inningsError, run: reloadInnings } = useFetch(async () => {
    const batches = await Promise.all((matches ?? []).map(async match => {
      const result = await sdk.table('innings_c').select(INNINGS_FIELDS).where(eq('match_c', match.Id)).fetch();
      if (!result.success) throw new Error(result.message);
      return result.data ?? [];
    }));
    return batches.flat();
  }, [matchKey]);
  const inningsKey = (innings ?? []).map(frame => frame.Id).join('|');
  const { data: tournamentDeliveries, loading: deliveriesLoading, error: deliveriesError, run: reloadDeliveries } = useFetch(async () => {
    const batches = await Promise.all((innings ?? []).map(async frame => {
      const result = await sdk.table('deliveries_c').select(DELIVERY_FIELDS).where(eq('innings_c', frame.Id)).fetch();
      if (!result.success) throw new Error(result.message);
      return result.data ?? [];
    }));
    return batches.flat();
  }, [inningsKey]);
  const teamKey = (teams ?? []).map(team => team.Id).join('|');
  const { data: tournamentPlayers, loading: playersLoading, error: playersError, run: reloadPlayers } = useFetch(async () => {
    const batches = await Promise.all((teams ?? []).map(async team => {
      const result = await sdk.table('players_c').select(PLAYER_FIELDS).where(eq('squad_c', team.Id)).fetch();
      if (!result.success) throw new Error(result.message);
      return result.data ?? [];
    }));
    return batches.flat();
  }, [teamKey]);
  const playerLeaders = useMemo(() => calculatePlayerLeaders(teams, tournamentPlayers, tournamentDeliveries), [teams, tournamentPlayers, tournamentDeliveries]);
  const standings = useMemo(() => calculateStandings(teams, matches, innings), [teams, matches, innings]);

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
          <Button size="sm" variant="outline" disabled={teamsLoading || matchesLoading || inningsLoading} onClick={() => { reloadTeams(); reloadMatches(); reloadInnings(); }}>Refresh standings</Button>
        </div>
        {teamsError || matchesError || inningsError ? <div className="p-5 text-sm text-destructive">Standings could not be loaded: {teamsError?.message || matchesError?.message || inningsError?.message}</div> : teamsLoading || matchesLoading || inningsLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading standings…</div> : !standings.length ? <div className="p-8 text-center text-sm text-muted-foreground">No teams are registered in this tournament yet.</div> : <div className="overflow-x-auto">
          <table className="w-full min-w-[740px] text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3 text-left">Pos</th><th className="px-4 py-3 text-left">Team</th><th className="px-2 py-3 text-right">P</th><th className="px-2 py-3 text-right">W</th><th className="px-2 py-3 text-right">L</th><th className="px-2 py-3 text-right">T</th><th className="px-2 py-3 text-right">NR</th><th className="px-2 py-3 text-right">A</th><th className="px-2 py-3 text-right">NRR</th><th className="px-4 py-3 text-right">Pts</th></tr></thead>
            <tbody>{standings.map((row, index) => <tr key={row.team.Id} className="border-t border-border"><td className="px-4 py-3 font-semibold tabular-nums">{index + 1}</td><td className="px-4 py-3 font-semibold">{row.team.Name}</td><td className="px-2 py-3 text-right tabular-nums">{row.played}</td><td className="px-2 py-3 text-right tabular-nums">{row.won}</td><td className="px-2 py-3 text-right tabular-nums">{row.lost}</td><td className="px-2 py-3 text-right tabular-nums">{row.tied}</td><td className="px-2 py-3 text-right tabular-nums">{row.noResult}</td><td className="px-2 py-3 text-right tabular-nums">{row.abandoned}</td><td className="px-2 py-3 text-right tabular-nums">{row.nrr === null ? '—' : row.nrr.toFixed(3)}</td><td className="px-4 py-3 text-right font-bold tabular-nums">{row.points}</td></tr>)}</tbody>
          </table>
        </div>}
        <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">Points: win 2 · tie 1 · no result 1 · abandoned 1 · loss 0. Ranking: points, net run rate, wins, then team name. NRR excludes no-result and abandoned matches; all-out innings use the full overs quota.</div>
      </section>
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Awards race</p>
          <h2 className="mt-1 font-heading text-xl font-bold uppercase">Tournament awards</h2>
          <p className="mt-1 text-sm text-muted-foreground">Provisional leaders based on recorded deliveries. Tied leaders are shown jointly.</p>
        </div>
        {deliveriesError || playersError ? <div className="p-5 text-sm text-destructive">Awards could not be calculated: {deliveriesError?.message || playersError?.message}</div> : deliveriesLoading || playersLoading || inningsLoading || teamsLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Calculating awards…</div> : <div className="grid gap-3 p-5 sm:grid-cols-2">
          {playerLeaders.awards.map(award => <div key={award.title} className="rounded-lg border border-border p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{award.title}</p>
            {award.winners.length ? <div className="mt-2 space-y-2">{award.winners.map(row => <div key={row.playerId} className="flex items-start justify-between gap-3"><div><p className="font-semibold">{row.player?.Name || 'Unknown player'}</p><p className="text-xs text-muted-foreground">{row.teamName}</p></div><p className="shrink-0 text-sm font-bold tabular-nums">{award.detail(row)}</p></div>)}</div> : <p className="mt-2 text-sm text-muted-foreground">Not qualified yet</p>}
          </div>)}
        </div>}
        <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">Best strike rate requires at least 10 balls faced. Best bowling economy requires at least 2 legal overs. These are live statistical leaders, not a subjective Player of the Tournament decision.</div>
      </section>
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-primary">Player performance</p>
            <h2 className="mt-1 font-heading text-xl font-bold uppercase">Tournament leaderboards</h2>
            <p className="mt-1 text-sm text-muted-foreground">Calculated from recorded deliveries across this tournament, including live innings.</p>
          </div>
          <Button size="sm" variant="outline" disabled={deliveriesLoading || playersLoading} onClick={() => { reloadDeliveries(); reloadPlayers(); }}>Refresh leaders</Button>
        </div>
        {deliveriesError || playersError ? <div className="p-5 text-sm text-destructive">Player statistics could not be loaded: {deliveriesError?.message || playersError?.message}</div> : deliveriesLoading || playersLoading || inningsLoading || teamsLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Calculating player statistics…</div> : !playerLeaders.batting.length && !playerLeaders.bowling.length ? <div className="p-8 text-center text-sm text-muted-foreground">Player leaderboards will appear after deliveries are recorded.</div> : <div className="grid gap-6 p-5 lg:grid-cols-2">
          <div className="min-w-0">
            <h3 className="font-heading text-lg font-bold uppercase">Top run-scorers</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-2 py-3 text-left">#</th><th className="px-2 py-3 text-left">Player</th><th className="px-2 py-3 text-right">R</th><th className="px-2 py-3 text-right">B</th><th className="px-2 py-3 text-right">4s</th><th className="px-2 py-3 text-right">6s</th><th className="px-2 py-3 text-right">SR</th></tr></thead>
                <tbody>{playerLeaders.batting.map((row, index) => <tr key={row.playerId} className="border-t border-border"><td className="px-2 py-3 tabular-nums">{index + 1}</td><td className="px-2 py-3"><p className="font-semibold">{row.player?.Name || 'Unknown player'}</p><p className="text-xs text-muted-foreground">{row.teamName}</p></td><td className="px-2 py-3 text-right font-bold tabular-nums">{row.runs}</td><td className="px-2 py-3 text-right tabular-nums">{row.balls}</td><td className="px-2 py-3 text-right tabular-nums">{row.fours}</td><td className="px-2 py-3 text-right tabular-nums">{row.sixes}</td><td className="px-2 py-3 text-right tabular-nums">{row.strikeRate.toFixed(2)}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
          <div className="min-w-0">
            <h3 className="font-heading text-lg font-bold uppercase">Top wicket-takers</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[360px] text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-2 py-3 text-left">#</th><th className="px-2 py-3 text-left">Player</th><th className="px-2 py-3 text-right">O</th><th className="px-2 py-3 text-right">R</th><th className="px-2 py-3 text-right">W</th><th className="px-2 py-3 text-right">Econ</th></tr></thead>
                <tbody>{playerLeaders.bowling.map((row, index) => <tr key={row.playerId} className="border-t border-border"><td className="px-2 py-3 tabular-nums">{index + 1}</td><td className="px-2 py-3"><p className="font-semibold">{row.player?.Name || 'Unknown player'}</p><p className="text-xs text-muted-foreground">{row.teamName}</p></td><td className="px-2 py-3 text-right tabular-nums">{row.overs}</td><td className="px-2 py-3 text-right tabular-nums">{row.runs}</td><td className="px-2 py-3 text-right font-bold tabular-nums">{row.wickets}</td><td className="px-2 py-3 text-right tabular-nums">{row.economy.toFixed(2)}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        </div>}
        <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">Batting runs exclude extras; batter balls exclude wides and penalty deliveries. Bowling wickets include bowled, caught, LBW, stumped and hit wicket. Rankings show the top 10 in each category.</div>
      </section>
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-primary">Match centre</p>
            <h2 className="mt-1 font-heading text-xl font-bold uppercase">Fixtures &amp; results</h2>
            <p className="mt-1 text-sm text-muted-foreground">Open any fixture to manage match details, scoring and its public scoreboard.</p>
          </div>
          <Button size="sm" variant="outline" disabled={matchesLoading} onClick={reloadMatches}>Refresh fixtures</Button>
        </div>
        {matchesError ? <div className="p-5 text-sm text-destructive">Fixtures could not be loaded: {matchesError.message}</div> : matchesLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading fixtures…</div> : !(matches ?? []).length ? <div className="p-8 text-center text-sm text-muted-foreground">No fixtures have been created for this tournament yet.</div> : <div className="divide-y divide-border">
          {[...(matches ?? [])].sort((a, b) => {
            const rank = { Live: 0, Upcoming: 1, Scheduled: 1, Completed: 2, Abandoned: 3, Cancelled: 4 };
            return (rank[a.status_c] ?? 5) - (rank[b.status_c] ?? 5) || String(a.Name || '').localeCompare(String(b.Name || ''));
          }).map(match => {
            const teamA = match.team_a_c?.Name || 'Team A';
            const teamB = match.team_b_c?.Name || 'Team B';
            const winnerName = match.winner_team_c?.Name;
            const resultLabel = match.result_type_c === 'Win' && winnerName
              ? `${winnerName} won`
              : match.result_type_c === 'Tie' ? 'Match tied'
              : match.result_type_c === 'No Result' ? 'No result'
              : match.result_type_c === 'Abandoned' || match.status_c === 'Abandoned' ? 'Match abandoned'
              : null;
            return <Link key={match.Id} to={`/matches/${match.Id}`} className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{match.Name || 'Tournament fixture'}</p>
                <p className="mt-1 font-semibold">{teamA} <span className="mx-1 text-muted-foreground">vs</span> {teamB}</p>
                <p className="mt-1 text-sm text-muted-foreground">{resultLabel || `${match.overs_c || tournament.overs_c || '—'} overs · ${match.status_c || 'Status not set'}`}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${badge[match.status_c] ?? 'bg-muted text-muted-foreground'}`}>{match.status_c || 'Unknown'}</span>
                <ApperIcon name="ChevronRight" size={16} className="text-muted-foreground" />
              </div>
            </Link>;
          })}
        </div>}
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
