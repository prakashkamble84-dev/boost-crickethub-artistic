import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DetailSkeleton } from '@/components/PageSkeleton';
import { toast } from 'sonner';

const MATCH_FIELDS = ['Id', 'Name', 'team_a_c', 'team_b_c', 'overs_c', 'status_c'];
const INNINGS_FIELDS = ['Id', 'Name', 'match_c', 'batting_team_c', 'bowling_team_c', 'innings_number_c', 'status_c', 'total_runs_c', 'wickets_c', 'legal_balls_c', 'wides_runs_c', 'no_balls_runs_c', 'byes_runs_c', 'leg_byes_runs_c', 'penalty_runs_c', 'target_runs_c', 'current_striker_c', 'current_non_striker_c', 'current_bowler_c'];
const DELIVERY_FIELDS = ['Id', 'Name', 'innings_c', 'sequence_number_c', 'over_number_c', 'ball_number_c', 'striker_c', 'non_striker_c', 'bowler_c', 'batter_runs_c', 'extras_type_c', 'extras_runs_c', 'is_legal_ball_c', 'wicket_type_c', 'dismissed_player_c', 'fielder_c', 'notes_c'];
const PLAYER_FIELDS = ['Id', 'Name', 'squad_c', 'jersey_number_c', 'role_c'];
const EXTRAS = ['None', 'Wide', 'No-ball', 'Bye', 'Leg-bye', 'Penalty'];
const WICKETS = ['None', 'Bowled', 'Caught', 'LBW', 'Run out', 'Stumped', 'Hit wicket', 'Obstructing field', 'Retired out'];

const { eq } = window.ApperSDK.CoreSDK;
const idOf = (v) => String(v?.Id ?? v ?? '');
const labelOf = (p) => p ? (p.jersey_number_c ? `#${p.jersey_number_c} ` : '') + p.Name : 'Choose player';

function scoreDeliveries(rows) {
  return rows.reduce((score, ball) => {
    const type = ball.extras_type_c || 'None';
    const batter = Number(ball.batter_runs_c || 0);
    const extras = Number(ball.extras_runs_c || 0);
    score.runs += batter + extras;
    score.batterRuns += batter;
    score.extras += extras;
    if (ball.is_legal_ball_c) score.legalBalls += 1;
    if (type === 'Wide') score.wides += extras;
    if (type === 'No-ball') score.noBalls += extras;
    if (type === 'Bye') score.byes += extras;
    if (type === 'Leg-bye') score.legByes += extras;
    if (type === 'Penalty') score.penalties += extras;
    if (ball.wicket_type_c && ball.wicket_type_c !== 'None') score.wickets += 1;
    return score;
  }, { runs: 0, batterRuns: 0, extras: 0, legalBalls: 0, wickets: 0, wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0 });
}

function oversText(balls) {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

export const route = { path: '/matches/:id/score', layout: 'owner', access: 'authenticated' };

export default function LiveScoring() {
  const { id } = useParams();
  const [setupOpen, setSetupOpen] = useState(false);
  const [battingTeam, setBattingTeam] = useState('');
  const [bowlingTeam, setBowlingTeam] = useState('');
  const [striker, setStriker] = useState('');
  const [nonStriker, setNonStriker] = useState('');
  const [bowler, setBowler] = useState('');
  const [batterRuns, setBatterRuns] = useState('0');
  const [extrasType, setExtrasType] = useState('None');
  const [extrasRuns, setExtrasRuns] = useState('0');
  const [wicketType, setWicketType] = useState('None');
  const [dismissedPlayer, setDismissedPlayer] = useState('');
  const [fielder, setFielder] = useState('');
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [nextBatter, setNextBatter] = useState('');
  const { data: match, loading: matchLoading, error: matchError, run: reloadMatch } = useFetch(() => sdk.table('matches_c').select(MATCH_FIELDS).get(id).then(r => {
    if (!r.success) throw new Error(r.message);
    return r.data;
  }), [id]);
  const { data: inningsRows, loading: inningsLoading, run: reloadInnings } = useFetch(() => sdk.table('innings_c').select(INNINGS_FIELDS).where(eq('match_c', id)).orderBy('innings_number_c').fetch().then(r => {
    if (!r.success) throw new Error(r.message);
    return r.data;
  }), [id]);
  const activeInnings = (inningsRows ?? []).find(x => x.status_c === 'In Progress') ?? null;
  const { data: deliveries, loading: deliveriesLoading, run: reloadDeliveries } = useFetch(() => activeInnings
    ? sdk.table('deliveries_c').select(DELIVERY_FIELDS).where(eq('innings_c', activeInnings.Id)).orderBy('sequence_number_c').fetch().then(r => {
      if (!r.success) throw new Error(r.message);
      return r.data;
    })
    : Promise.resolve([]), [activeInnings?.Id]);
  const { data: players } = useFetch(() => sdk.table('players_c').select(PLAYER_FIELDS).orderBy('Name').fetch().then(r => {
    if (!r.success) throw new Error(r.message);
    return r.data;
  }), []);
  const score = useMemo(() => scoreDeliveries(deliveries ?? []), [deliveries]);
  const battingPlayers = (players ?? []).filter(p => idOf(p.squad_c) === idOf(activeInnings?.batting_team_c));
  const bowlingPlayers = (players ?? []).filter(p => idOf(p.squad_c) === idOf(activeInnings?.bowling_team_c));
  const availableBatters = battingPlayers.filter(p => ![striker, nonStriker].includes(String(p.Id)));
  const maxOvers = Number(match?.overs_c || 20);
  const overComplete = score.legalBalls > 0 && score.legalBalls % 6 === 0;

  async function startInnings(event) {
    event.preventDefault();
    if (!match || !battingTeam || !bowlingTeam || battingTeam === bowlingTeam || !striker || !nonStriker || striker === nonStriker || !bowler) {
      return toast.error('Choose two different teams, two different opening batters and a bowler.');
    }
    setStarting(true);
    try {
      const number = (inningsRows ?? []).length + 1;
      const result = await sdk.table('innings_c').create({
        Name: `Innings ${number} · ${match.Name}`,
        match_c: id,
        batting_team_c: battingTeam,
        bowling_team_c: bowlingTeam,
        innings_number_c: number,
        status_c: 'In Progress',
        total_runs_c: 0,
        wickets_c: 0,
        legal_balls_c: 0
      });
      if (!result.data?.length) return toast.error(result.messages?.[0] || 'Could not start innings.');
      setSetupOpen(false);
      toast.success(`Innings ${number} started.`);
      reloadInnings();
    } catch (e) {
      toast.error(e.message || 'Could not start innings.');
    } finally {
      setStarting(false);
    }
  }

  async function recordDelivery(event) {
    event.preventDefault();
    const batRuns = Number(batterRuns);
    const extraRuns = Number(extrasRuns);
    if (!activeInnings || !striker || !nonStriker || !bowler || striker === nonStriker || !Number.isInteger(batRuns) || batRuns < 0 || batRuns > 6 || !Number.isInteger(extraRuns) || extraRuns < 0 || extraRuns > 10) {
      return toast.error('Check the batter, bowler and run values.');
    }
    if (extrasType === 'Wide' || extrasType === 'No-ball') {
      if (batRuns !== 0 && extrasType === 'Wide') return toast.error('Runs from a wide are extras, not batter runs.');
    }
    if (wicketType !== 'None' && (!dismissedPlayer || !nextBatter)) return toast.error('Choose the dismissed batter and the incoming batter.');
    if (wicketType !== 'None' && ![striker, nonStriker].includes(dismissedPlayer)) return toast.error('The dismissed player must be one of the two active batters.');
    if (wicketType !== 'None' && [striker, nonStriker].includes(nextBatter)) return toast.error('The incoming batter must be a different player.');
    if (['Bowled', 'Caught', 'LBW', 'Stumped', 'Hit wicket'].includes(wicketType) && dismissedPlayer !== striker) return toast.error('This dismissal must be recorded against the striker.');
    if (wicketType === 'Caught' && !fielder) return toast.error('Choose the fielder for a catch.');
    const legal = extrasType !== 'Wide' && extrasType !== 'No-ball';
    const previous = deliveries ?? [];
    const current = scoreDeliveries(previous);
    const seq = previous.length + 1;
    const ballNo = current.legalBalls % 6 + 1;
    const overNo = Math.floor(current.legalBalls / 6) + 1;
    setSaving(true);
    try {
      const payload = {
        Name: `I${activeInnings.innings_number_c} ${overNo}.${ballNo} #${seq}`,
        innings_c: activeInnings.Id,
        sequence_number_c: seq,
        over_number_c: overNo,
        ball_number_c: ballNo,
        striker_c: striker,
        non_striker_c: nonStriker,
        bowler_c: bowler,
        batter_runs_c: batRuns,
        extras_type_c: extrasType,
        extras_runs_c: extraRuns,
        is_legal_ball_c: legal,
        wicket_type_c: wicketType,
        dismissed_player_c: dismissedPlayer || null,
        fielder_c: fielder || null
      };
      const result = await sdk.table('deliveries_c').create(payload);
      if (!result.data?.length) return toast.error(result.messages?.[0] || 'Delivery was not saved.');
      const updatedRows = [...previous, result.data[0]];
      const next = scoreDeliveries(updatedRows);
      let newStriker = striker;\n      let newNonStriker = nonStriker;\n      const runningExtras = extrasType === 'Wide' || extrasType === 'No-ball' ? Math.max(0, extraRuns - 1) : extraRuns;\n      const completedRuns = batRuns + (['Bye', 'Leg-bye', 'Wide', 'No-ball'].includes(extrasType) ? runningExtras : 0);\n      if (completedRuns % 2 === 1) [newStriker, newNonStriker] = [newNonStriker, newStriker];\n      if (legal && next.legalBalls % 6 === 0) [newStriker, newNonStriker] = [newNonStriker, newStriker];\n      if (wicketType !== 'None') {\n        if (dismissedPlayer === newStriker) newStriker = nextBatter;\n        else if (dismissedPlayer === newNonStriker) newNonStriker = nextBatter;\n      }\n      const update = await sdk.table('innings_c').update({
        Id: activeInnings.Id,
        total_runs_c: next.runs,
        wickets_c: next.wickets,
        legal_balls_c: next.legalBalls,
        wides_runs_c: next.wides,
        no_balls_runs_c: next.noBalls,
        byes_runs_c: next.byes,
        leg_byes_runs_c: next.legByes,
        penalty_runs_c: next.penalties
      });
      if (!update.data?.length) {
        toast.error('Ball saved, but the innings summary did not update. Refresh before continuing.');
      } else {
        toast.success('Delivery recorded.');
      }
      let newStriker = striker;
      let newNonStriker = nonStriker;
      const runningExtras = extrasType === 'Wide' || extrasType === 'No-ball' ? Math.max(0, extraRuns - 1) : extraRuns;
      const completedRuns = batRuns + (['Bye', 'Leg-bye', 'Wide', 'No-ball'].includes(extrasType) ? runningExtras : 0);
      if (completedRuns % 2 === 1) [newStriker, newNonStriker] = [newNonStriker, newStriker];
      if (legal && next.legalBalls % 6 === 0) [newStriker, newNonStriker] = [newNonStriker, newStriker];
      if (wicketType !== 'None') {
        if (dismissedPlayer === newStriker) newStriker = nextBatter;
        else if (dismissedPlayer === newNonStriker) newNonStriker = nextBatter;
      }
      setStriker(newStriker);
      setNonStriker(newNonStriker);
      setNextBatter('');
      setBatterRuns('0');
      setExtrasType('None');
      setExtrasRuns('0');
      setWicketType('None');
      setDismissedPlayer('');
      setFielder('');
      reloadDeliveries();
      reloadInnings();
      reloadMatch();
    } catch (e) {
      toast.error(e.message || 'Could not record delivery.');
    } finally {
      setSaving(false);
    }
  }

  async function completeInnings() {
    if (!activeInnings) return;
    setSaving(true);
    try {
      const result = await sdk.table('innings_c').update({ Id: activeInnings.Id, status_c: 'Completed' });
      if (!result.data?.length) return toast.error(result.messages?.[0] || 'Could not complete innings.');
      toast.success('Innings completed.');
      reloadInnings();
    } catch (e) {
      toast.error(e.message || 'Could not complete innings.');
    } finally {
      setSaving(false);
    }
  }

  if (matchLoading) return <DetailSkeleton />;
  if (matchError || !match) return <div className="rounded-xl border border-destructive/30 p-5"><p className="font-semibold">Match could not load.</p><p className="mt-2 text-sm text-muted-foreground">{matchError?.message || 'Match not found.'}</p><Button asChild variant="outline" className="mt-3"><Link to={`/matches/${id}`}>Back to match</Link></Button></div>;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Button asChild variant="ghost" size="sm"><Link to={`/matches/${id}`}><ApperIcon name="ArrowLeft" size={16} /> Back to match</Link></Button>
      <header className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Live match centre</p>
          <h1 className="mt-2 font-heading text-4xl font-bold uppercase">{match.Name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{match.team_a_c?.Name} vs {match.team_b_c?.Name} · {match.overs_c} overs per innings</p>
        </div>
        {!activeInnings ? <Button onClick={() => { setBattingTeam(idOf(match.team_a_c)); setBowlingTeam(idOf(match.team_b_c)); setSetupOpen(true); }}>Start innings</Button> : <Button variant="outline" disabled={saving} onClick={completeInnings}>Complete innings</Button>}
      </header>

      {setupOpen ? <form onSubmit={startInnings} className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
        <div className="sm:col-span-2"><h2 className="font-heading text-2xl font-bold uppercase">Innings setup</h2><p className="text-sm text-muted-foreground">Set the batting order and opening bowler before the first ball.</p></div>
        <div className="space-y-2"><Label>Batting team</Label><select className="h-11 w-full rounded-md border border-input bg-background px-3" value={battingTeam} onChange={e => { setBattingTeam(e.target.value); setStriker(''); setNonStriker(''); }} required><option value="">Choose team</option>{[match.team_a_c, match.team_b_c].filter(Boolean).map(t => <option key={t.Id} value={t.Id}>{t.Name}</option>)}</select></div>
        <div className="space-y-2"><Label>Bowling team</Label><select className="h-11 w-full rounded-md border border-input bg-background px-3" value={bowlingTeam} onChange={e => setBowlingTeam(e.target.value)} required><option value="">Choose team</option>{[match.team_a_c, match.team_b_c].filter(t => t && String(t.Id) !== battingTeam).map(t => <option key={t.Id} value={t.Id}>{t.Name}</option>)}</select></div>
        <div className="space-y-2"><Label>Opening striker</Label><select className="h-11 w-full rounded-md border border-input bg-background px-3" value={striker} onChange={e => setStriker(e.target.value)} required><option value="">Choose batter</option>{(players ?? []).filter(p => idOf(p.squad_c) === battingTeam).map(p => <option key={p.Id} value={p.Id}>{labelOf(p)}</option>)}</select></div>
        <div className="space-y-2"><Label>Opening non-striker</Label><select className="h-11 w-full rounded-md border border-input bg-background px-3" value={nonStriker} onChange={e => setNonStriker(e.target.value)} required><option value="">Choose batter</option>{(players ?? []).filter(p => idOf(p.squad_c) === battingTeam && String(p.Id) !== striker).map(p => <option key={p.Id} value={p.Id}>{labelOf(p)}</option>)}</select></div>
        <div className="space-y-2 sm:col-span-2"><Label>Opening bowler</Label><select className="h-11 w-full rounded-md border border-input bg-background px-3" value={bowler} onChange={e => setBowler(e.target.value)} required><option value="">Choose bowler</option>{(players ?? []).filter(p => idOf(p.squad_c) === bowlingTeam).map(p => <option key={p.Id} value={p.Id}>{labelOf(p)}</option>)}</select></div>
        <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={() => setSetupOpen(false)}>Cancel</Button><Button disabled={starting}>{starting ? 'Starting…' : 'Start innings'}</Button></div>
      </form> : null}

      {activeInnings ? <>
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-5 py-3"><div><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Innings {activeInnings.innings_number_c}</p><h2 className="font-heading text-2xl font-bold uppercase">{activeInnings.batting_team_c?.Name || 'Batting team'}</h2></div><span className="rounded-full bg-success-muted px-3 py-1 text-xs font-bold text-success">LIVE</span></div>
          <div className="grid gap-4 p-5 sm:grid-cols-[1.3fr_1fr]">
            <div><p className="font-heading text-5xl font-bold tabular-nums">{score.runs}<span className="text-2xl text-muted-foreground">/{score.wickets}</span></p><p className="mt-1 text-sm text-muted-foreground">{oversText(score.legalBalls)} overs · {maxOvers} overs · Run rate {score.legalBalls ? (score.runs / (score.legalBalls / 6)).toFixed(2) : '0.00'}</p><p className="mt-3 text-sm text-muted-foreground">Extras {score.extras} · Wides {score.wides} · No-balls {score.noBalls} · Byes {score.byes} · Leg-byes {score.legByes}</p></div>
            <div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-lg bg-muted/50 p-3"><p className="text-muted-foreground">Striker</p><p className="mt-1 font-semibold">{labelOf(battingPlayers.find(p => String(p.Id) === striker))}</p></div><div className="rounded-lg bg-muted/50 p-3"><p className="text-muted-foreground">Non-striker</p><p className="mt-1 font-semibold">{labelOf(battingPlayers.find(p => String(p.Id) === nonStriker))}</p></div><div className="col-span-2 rounded-lg bg-muted/50 p-3"><p className="text-muted-foreground">Bowler</p><select aria-label="Current bowler" className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2" value={bowler} onChange={e => setBowler(e.target.value)}><option value="">Choose bowler</option>{bowlingPlayers.map(p => <option key={p.Id} value={p.Id}>{labelOf(p)}</option>)}</select></div></div>
          </div>
        </section>

        <form onSubmit={recordDelivery} className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between"><h2 className="font-heading text-2xl font-bold uppercase">Record delivery</h2><span className="text-sm tabular-nums text-muted-foreground">Over {Math.floor(score.legalBalls / 6) + 1} · Ball {score.legalBalls % 6 + 1}</span></div>
            <div className="grid grid-cols-4 gap-2">{[0, 1, 2, 3, 4, 5, 6].map(n => <Button key={n} type="button" variant={batterRuns === String(n) ? 'default' : 'outline'} className="h-12 text-lg font-bold" onClick={() => { setBatterRuns(String(n)); if (n > 0) { setExtrasType('None'); setExtrasRuns('0'); } }}>{n}</Button>)}<Button type="button" variant="outline" className="h-12" onClick={() => { setBatterRuns('0'); setExtrasType('Wide'); setExtrasRuns('1'); }}>Wd</Button><Button type="button" variant="outline" className="h-12" onClick={() => { setBatterRuns('0'); setExtrasType('No-ball'); setExtrasRuns('1'); }}>Nb</Button></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label>Extras type</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3" value={extrasType} onChange={e => setExtrasType(e.target.value)}>{EXTRAS.map(x => <option key={x}>{x}</option>)}</select></div>
              <div className="space-y-2"><Label>Extras runs</Label><Input type="number" min="0" max="10" value={extrasRuns} onChange={e => setExtrasRuns(e.target.value)} /></div>
              <div className="space-y-2"><Label>Wicket</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3" value={wicketType} onChange={e => setWicketType(e.target.value)}>{WICKETS.map(x => <option key={x}>{x}</option>)}</select></div>
              {wicketType !== 'None' ? <><div className="space-y-2"><Label>Dismissed batter</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3" value={dismissedPlayer} onChange={e => setDismissedPlayer(e.target.value)}><option value="">Choose batter</option>{battingPlayers.filter(p => [striker, nonStriker].includes(String(p.Id))).map(p => <option key={p.Id} value={p.Id}>{labelOf(p)}</option>)}</select></div><div className="space-y-2"><Label>Fielder (if applicable)</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3" value={fielder} onChange={e => setFielder(e.target.value)}><option value="">Not applicable</option>{bowlingPlayers.map(p => <option key={p.Id} value={p.Id}>{labelOf(p)}</option>)}</select></div><div className="space-y-2"><Label>Next batter</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3" value={nextBatter} onChange={e => setNextBatter(e.target.value)}><option value="">Choose after wicket</option>{availableBatters.map(p => <option key={p.Id} value={p.Id}>{labelOf(p)}</option>)}</select></div></> : null}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><p className="text-xs text-muted-foreground">Wide and no-ball do not count as legal balls. Extras are added to the team total.</p><Button disabled={saving || deliveriesLoading || !striker || !nonStriker || !bowler || score.wickets >= 10 || score.legalBalls >= maxOvers * 6}>{saving ? 'Saving…' : 'Record ball'}</Button></div>
          </section>
          <aside className="space-y-4">
            <section className="rounded-xl border border-border bg-card p-5"><h3 className="font-heading text-xl font-bold uppercase">This over</h3><div className="mt-3 flex flex-wrap gap-2">{(deliveries ?? []).filter(d => d.over_number_c === Math.floor(score.legalBalls / 6) + 1).map(d => <span key={d.Id} className="grid h-9 min-w-9 place-items-center rounded-md border border-border px-2 text-sm font-semibold">{d.wicket_type_c && d.wicket_type_c !== 'None' ? 'W' : d.extras_type_c === 'Wide' ? 'Wd' : d.extras_type_c === 'No-ball' ? 'Nb' : Number(d.batter_runs_c || 0) + Number(d.extras_runs_c || 0)}</span>)}{!(deliveries ?? []).some(d => d.over_number_c === Math.floor(score.legalBalls / 6) + 1) ? <p className="text-sm text-muted-foreground">No balls yet in this over.</p> : null}</div><p className="mt-3 text-sm text-muted-foreground">{overComplete ? 'Over complete. Change bowler before the next delivery.' : 'Ball-by-ball entries are saved as the scoring ledger.'}</p></section>
            <section className="rounded-xl border border-border bg-card p-5"><h3 className="font-heading text-xl font-bold uppercase">Recent deliveries</h3><div className="mt-3 space-y-2">{(deliveries ?? []).slice(-8).reverse().map(d => <div key={d.Id} className="flex items-center justify-between border-b border-border pb-2 text-sm"><span className="text-muted-foreground">{d.over_number_c}.{d.ball_number_c} · {d.striker_c?.Name || 'Batter'}</span><strong>{d.wicket_type_c && d.wicket_type_c !== 'None' ? 'Wicket' : `+${Number(d.batter_runs_c || 0) + Number(d.extras_runs_c || 0)}`}</strong></div>)}{!(deliveries ?? []).length ? <p className="text-sm text-muted-foreground">The first delivery has not been recorded.</p> : null}</div></section>
          </aside>
        </form>
      </> : <section className="rounded-xl border border-dashed border-border bg-card p-8 text-center"><ApperIcon name="PlayCircle" size={32} className="mx-auto text-muted-foreground" /><h2 className="mt-3 font-heading text-2xl font-bold uppercase">{inningsLoading ? 'Loading innings…' : 'Ready for the toss'}</h2><p className="mt-1 text-sm text-muted-foreground">{(inningsRows ?? []).length ? 'Previous innings are saved. Start the next innings when the teams are ready.' : 'Set the batting order and opening bowler to begin ball-by-ball scoring.'}</p>{!inningsLoading ? <Button className="mt-4" onClick={() => { setBattingTeam(idOf(match.team_a_c)); setBowlingTeam(idOf(match.team_b_c)); setSetupOpen(true); }}>Set up innings</Button> : null}</section>}
    </div>
  );
}
