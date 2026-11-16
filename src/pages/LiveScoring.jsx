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
import { refreshPublishedScoreboard } from '@/services/publicScoreboard';

const MATCH_FIELDS = ['Id', 'Name', 'team_a_c', 'team_b_c', 'overs_c', 'status_c', 'result_type_c', 'winner_team_c', 'result_margin_c', 'result_summary_c'];
const INNINGS_FIELDS = ['Id', 'Name', 'match_c', 'batting_team_c', 'bowling_team_c', 'innings_number_c', 'status_c', 'total_runs_c', 'wickets_c', 'legal_balls_c', 'wides_runs_c', 'no_balls_runs_c', 'byes_runs_c', 'leg_byes_runs_c', 'penalty_runs_c', 'target_runs_c', 'current_striker_c', 'current_non_striker_c', 'current_bowler_c'];
const DELIVERY_FIELDS = ['Id', 'Name', 'innings_c', 'sequence_number_c', 'over_number_c', 'ball_number_c', 'striker_c', 'non_striker_c', 'bowler_c', 'batter_runs_c', 'extras_type_c', 'extras_runs_c', 'no_ball_penalty_runs_c', 'is_legal_ball_c', 'wicket_type_c', 'dismissed_player_c', 'fielder_c', 'batters_crossed_c', 'notes_c'];
const PLAYER_FIELDS = ['Id', 'Name', 'squad_c', 'jersey_number_c', 'role_c'];
const EXTRAS = ['None', 'Wide', 'No-ball', 'Bye', 'Leg-bye'];
const WICKETS = ['None', 'Bowled', 'Caught', 'LBW', 'Run out', 'Stumped', 'Hit wicket', 'Obstructing field'];

const { eq } = window.ApperSDK.CoreSDK;
const idOf = (v) => String(v?.Id ?? v ?? '');
const labelOf = (p) => p ? (p.jersey_number_c ? `#${p.jersey_number_c} ` : '') + p.Name : 'Choose player';

function scoreDeliveries(rows) {
  return rows.reduce((score, ball) => {
    const type = ball.extras_type_c || 'None';
    const batter = Number(ball.batter_runs_c || 0);
    const extras = Number(ball.extras_runs_c || 0);
    const separateNoBallPenalty = ball.no_ball_penalty_runs_c != null;
    const noBallPenalty = type === 'No-ball' && separateNoBallPenalty ? Number(ball.no_ball_penalty_runs_c || 0) : 0;
    score.runs += batter + extras + noBallPenalty;
    score.batterRuns += batter;
    score.extras += extras + noBallPenalty;
    if (ball.is_legal_ball_c) score.legalBalls += 1;
    if (type === 'Wide') {
      score.wides += Math.min(1, extras);
      score.byes += Math.max(0, extras - 1);
    }
    if (type === 'No-ball') {
      if (separateNoBallPenalty) {
        score.noBalls += noBallPenalty;
        score.byes += extras;
      } else {
        score.noBalls += extras;
      }
    }
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

function ballRuns(d) {
  const type = d.extras_type_c || 'None';
  const penalty = type === 'No-ball' && d.no_ball_penalty_runs_c != null ? Number(d.no_ball_penalty_runs_c || 0) : 0;
  return Number(d.batter_runs_c || 0) + Number(d.extras_runs_c || 0) + penalty;
}

function chipLabel(d) {
  if (d.wicket_type_c && d.wicket_type_c !== 'None') return 'W';
  const runs = ballRuns(d);
  if (d.extras_type_c === 'Wide') return runs > 1 ? `Wd+${runs - 1}` : 'Wd';
  if (d.extras_type_c === 'No-ball') return runs > 1 ? `Nb+${runs - 1}` : 'Nb';
  return runs;
}

function extrasNote(d) {
  const bat = Number(d.batter_runs_c || 0);
  const extras = Number(d.extras_runs_c || 0);
  if (d.extras_type_c === 'Wide') {
    const byes = Math.max(0, extras - 1);
    return `Wide${byes ? ` · ${byes} bye/leg-bye run${byes === 1 ? '' : 's'}` : ''}`;
  }
  if (d.extras_type_c === 'No-ball') {
    const parts = ['No-ball'];
    if (bat) parts.push(`${bat} off the bat`);
    if (extras) parts.push(`${extras} bye/leg-bye run${extras === 1 ? '' : 's'}`);
    return parts.join(' · ');
  }
  return `${d.extras_type_c}: ${extras} extra${extras === 1 ? '' : 's'}`;
}

function buildScorecards(rows, battingPlayers, bowlingPlayers) {
  const batters = new Map();
  const bowlers = new Map();
  const dismissals = new Map();
  const overFigures = new Map();
  const creditedWickets = new Set(['Bowled', 'Caught', 'LBW', 'Stumped', 'Hit wicket']);

  rows.forEach(ball => {
    const strikerId = idOf(ball.striker_c);
    const nonStrikerId = idOf(ball.non_striker_c);
    const bowlerId = idOf(ball.bowler_c);
    const type = ball.extras_type_c || 'None';
    const batterRuns = Number(ball.batter_runs_c || 0);
    const extras = Number(ball.extras_runs_c || 0);
    const wicketType = ball.wicket_type_c || 'None';

    [strikerId, nonStrikerId].forEach(playerId => {
      if (playerId && !batters.has(playerId)) {
        batters.set(playerId, { playerId, runs: 0, balls: 0, fours: 0, sixes: 0, dismissal: 'not out' });
      }
    });

    if (strikerId) {
      const batter = batters.get(strikerId);
      batter.runs += batterRuns;
      if (type !== 'Wide' && type !== 'Penalty') batter.balls += 1;
      if (batterRuns === 4) batter.fours += 1;
      if (batterRuns === 6) batter.sixes += 1;
    }

    if (ball.dismissed_player_c && wicketType !== 'None') {
      const dismissedId = idOf(ball.dismissed_player_c);
      const dismissed = batters.get(dismissedId) || { playerId: dismissedId, runs: 0, balls: 0, fours: 0, sixes: 0, dismissal: 'not out' };
      const fielderName = ball.fielder_c?.Name;
      const bowlerName = ball.bowler_c?.Name;
      const detail = wicketType === 'Caught' && fielderName
        ? `c ${fielderName} b ${bowlerName || 'bowler'}`
        : wicketType === 'Run out' && fielderName
          ? `run out (${fielderName})`
          : wicketType === 'Run out' || wicketType === 'Obstructing field'
            ? wicketType.toLowerCase()
            : wicketType === 'LBW'
              ? `lbw b ${bowlerName || 'bowler'}`
              : wicketType === 'Stumped'
                ? `st ${fielderName || 'wicketkeeper'} b ${bowlerName || 'bowler'}`
                : wicketType === 'Hit wicket'
                  ? `hit wicket b ${bowlerName || 'bowler'}`
                  : `b ${bowlerName || 'bowler'}`;
      dismissed.dismissal = detail;
      dismissals.set(dismissedId, detail);
      batters.set(dismissedId, dismissed);
    }

    if (bowlerId) {
      if (!bowlers.has(bowlerId)) {
        bowlers.set(bowlerId, { playerId: bowlerId, balls: 0, runs: 0, wickets: 0 });
      }
      const bowler = bowlers.get(bowlerId);
      if (ball.is_legal_ball_c) bowler.balls += 1;
      if (type === 'Wide') bowler.runs += Math.min(1, extras) + batterRuns;
      else if (type === 'No-ball') bowler.runs += (ball.no_ball_penalty_runs_c != null ? Number(ball.no_ball_penalty_runs_c || 0) : extras) + batterRuns;
      else if (type !== 'Bye' && type !== 'Leg-bye' && type !== 'Penalty') bowler.runs += batterRuns;
      if (creditedWickets.has(wicketType)) bowler.wickets += 1;

      const overKey = `${bowlerId}:${ball.over_number_c}`;
      if (!overFigures.has(overKey)) overFigures.set(overKey, { bowlerId, over: Number(ball.over_number_c), legalBalls: 0, conceded: 0 });
      const over = overFigures.get(overKey);
      if (ball.is_legal_ball_c) over.legalBalls += 1;
      if (type === 'Wide') over.conceded += Math.min(1, extras) + batterRuns;
      else if (type === 'No-ball') over.conceded += (ball.no_ball_penalty_runs_c != null ? Number(ball.no_ball_penalty_runs_c || 0) : extras) + batterRuns;
      else if (type !== 'Bye' && type !== 'Leg-bye' && type !== 'Penalty') over.conceded += batterRuns;
    }
  });

  const maidenCounts = new Map();
  overFigures.forEach(over => {
    if (over.legalBalls === 6 && over.conceded === 0) {
      maidenCounts.set(over.bowlerId, (maidenCounts.get(over.bowlerId) || 0) + 1);
    }
  });

  const playerName = (list, playerId) => list.find(player => String(player.Id) === String(playerId));
  const batting = [...batters.values()].map(item => ({
    ...item,
    player: playerName(battingPlayers, item.playerId),
    strikeRate: item.balls ? (item.runs / item.balls * 100).toFixed(2) : '0.00'
  }));
  const bowling = [...bowlers.values()].map(item => ({
    ...item,
    player: playerName(bowlingPlayers, item.playerId),
    maidens: maidenCounts.get(item.playerId) || 0,
    overs: oversText(item.balls),
    economy: item.balls ? (item.runs / (item.balls / 6)).toFixed(2) : '0.00'
  }));

  return { batting, bowling };
}

function AddPlayerInline({ squadId, role, onAdded }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || !squadId) return;
    setSaving(true);
    try {
      const res = await sdk.table('players_c').create({ Name: trimmed, squad_c: squadId, role_c: role });
      if (!res.data?.length) {
        const message = res.messages?.join('; ') || 'Player was not saved.';
        toast.error(message);
        console.error(`players_c create failed: ${message}`);
        return;
      }
      setName('');
      setOpen(false);
      await onAdded(String(res.data[0].Id));
      toast.success(`${trimmed} added.`);
    } catch (error) {
      toast.error(error.message || 'Could not add player.');
      console.error(`players_c create failed: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" className="mt-2" disabled={!squadId} onClick={() => setOpen(true)}>
        <ApperIcon name="Plus" size={14} />
        Add new player
      </Button>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Input value={name} onChange={e => setName(e.target.value)} placeholder="Player name" className="h-9 min-w-0 flex-1" />
      <Button type="button" size="sm" disabled={saving || !name.trim()} onClick={save}>{saving ? 'Adding…' : 'Save'}</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => { setOpen(false); setName(''); }}>Cancel</Button>
    </div>
  );
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
  const [battersCrossed, setBattersCrossed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const [starting, setStarting] = useState(false);
  const [nextBatter, setNextBatter] = useState('');
  const [pendingResultAction, setPendingResultAction] = useState('');
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
  const { data: players, run: reloadPlayers } = useFetch(() => sdk.table('players_c').select(PLAYER_FIELDS).orderBy('Name').fetch().then(r => {
    if (!r.success) throw new Error(r.message);
    return r.data;
  }), []);
  const inningsKey = (inningsRows ?? []).map(row => row.Id).join('|');
  const { data: allMatchDeliveries } = useFetch(async () => {
    const batches = await Promise.all((inningsRows ?? []).map(async row => {
      const result = await sdk.table('deliveries_c').select(DELIVERY_FIELDS).where(eq('innings_c', row.Id)).orderBy('sequence_number_c').fetch();
      if (!result.success) throw new Error(result.message);
      return result.data ?? [];
    }));
    return batches.flat();
  }, [inningsKey, deliveries?.length]);
  const score = useMemo(() => scoreDeliveries(deliveries ?? []), [deliveries]);
  const battingPlayers = (players ?? []).filter(p => idOf(p.squad_c) === idOf(activeInnings?.batting_team_c));
  const bowlingPlayers = (players ?? []).filter(p => idOf(p.squad_c) === idOf(activeInnings?.bowling_team_c));
  const scorecards = useMemo(() => buildScorecards(deliveries ?? [], battingPlayers, bowlingPlayers), [deliveries, battingPlayers, bowlingPlayers]);
  const completedInnings = (inningsRows ?? []).filter(row => row.status_c === 'Completed');
  const historicalScorecards = useMemo(() => completedInnings.map(row => {
    const rows = (allMatchDeliveries ?? []).filter(ball => idOf(ball.innings_c) === String(row.Id));
    const batters = (players ?? []).filter(player => idOf(player.squad_c) === idOf(row.batting_team_c));
    const bowlers = (players ?? []).filter(player => idOf(player.squad_c) === idOf(row.bowling_team_c));
    return { innings: row, score: scoreDeliveries(rows), figures: buildScorecards(rows, batters, bowlers) };
  }), [completedInnings, allMatchDeliveries, players]);
  const maxOvers = Number(match?.overs_c || 20);
  const firstInnings = (inningsRows ?? []).find(row => Number(row.innings_number_c) === 1);
  const target = Number(activeInnings?.target_runs_c || (Number(activeInnings?.innings_number_c) === 2 ? Number(firstInnings?.total_runs_c || 0) + 1 : 0));
  const runsNeeded = target > 0 ? Math.max(0, target - score.runs) : null;
  const ballsRemaining = Math.max(0, maxOvers * 6 - score.legalBalls);
  const chaseWon = target > 0 && score.runs >= target;
  const chaseLost = target > 0 && (score.wickets >= 10 || ballsRemaining === 0) && !chaseWon;
  const dismissedBatterIds = new Set((deliveries ?? []).filter(ball => ball.wicket_type_c && ball.wicket_type_c !== 'None').map(ball => idOf(ball.dismissed_player_c)));
  const availableBatters = battingPlayers.filter(p => ![striker, nonStriker].includes(String(p.Id)) && !dismissedBatterIds.has(String(p.Id)));
  const overComplete = score.legalBalls > 0 && score.legalBalls % 6 === 0;

  useEffect(() => {
    if (!activeInnings) return;
    setStriker(idOf(activeInnings.current_striker_c));
    setNonStriker(idOf(activeInnings.current_non_striker_c));
    setBowler(idOf(activeInnings.current_bowler_c));
  }, [
    activeInnings?.Id,
    idOf(activeInnings?.current_striker_c),
    idOf(activeInnings?.current_non_striker_c),
    idOf(activeInnings?.current_bowler_c)
  ]);

  useEffect(() => {
    if (!match || !inningsRows) return;
    refreshPublishedScoreboard(id).catch(() => {});
  }, [id, match?.status_c, inningsKey, deliveries?.length, activeInnings?.total_runs_c, activeInnings?.wickets_c, activeInnings?.legal_balls_c, activeInnings?.status_c]);

  async function startInnings(event) {
    event.preventDefault();
    if (!match || ['Completed', 'Abandoned'].includes(match.status_c)) return toast.error('This match has already been finalized.');
    if (!battingTeam || !bowlingTeam || battingTeam === bowlingTeam || !striker || !nonStriker || striker === nonStriker || !bowler) {
      return toast.error('Choose two different teams, two different opening batters and a bowler.');
    }
    const matchTeamIds = [idOf(match.team_a_c), idOf(match.team_b_c)];
    const selectedStriker = (players ?? []).find(player => String(player.Id) === striker);
    const selectedNonStriker = (players ?? []).find(player => String(player.Id) === nonStriker);
    const selectedBowler = (players ?? []).find(player => String(player.Id) === bowler);
    if (!matchTeamIds.includes(battingTeam) || !matchTeamIds.includes(bowlingTeam)) {
      return toast.error('Only the two teams registered for this match can take part.');
    }
    if (idOf(selectedStriker?.squad_c) !== battingTeam || idOf(selectedNonStriker?.squad_c) !== battingTeam || idOf(selectedBowler?.squad_c) !== bowlingTeam) {
      return toast.error('Opening batters must belong to the batting team and the bowler must belong to the bowling team.');
    }
    if ((players ?? []).length === 0) return toast.error('Load the registered team players before starting an innings.');
    const number = (inningsRows ?? []).length + 1;
    const previousInnings = (inningsRows ?? []).find(row => Number(row.innings_number_c) === number - 1);
    if (number > 2) return toast.error('This match format currently supports two innings only.');
    if (number > 1 && previousInnings?.status_c !== 'Completed') {
      return toast.error('Complete the previous innings before starting the next one.');
    }
    if (number === 2 && (battingTeam !== idOf(previousInnings?.bowling_team_c) || bowlingTeam !== idOf(previousInnings?.batting_team_c))) {
      return toast.error('The second innings must reverse the first innings batting and bowling teams.');
    }
    if (number === 1 && !matchTeamIds.includes(battingTeam)) {
      return toast.error('The first innings must use one of the teams registered for this match.');
    }
    setStarting(true);
    try {
      const result = await sdk.table('innings_c').create({
        Name: `Innings ${number} · ${match.Name}`,
        match_c: id,
        batting_team_c: battingTeam,
        bowling_team_c: bowlingTeam,
        innings_number_c: number,
        status_c: 'In Progress',
        total_runs_c: 0,
        wickets_c: 0,
        legal_balls_c: 0,
        current_striker_c: striker,
        current_non_striker_c: nonStriker,
        current_bowler_c: bowler,
        target_runs_c: number === 2 ? Number((inningsRows ?? []).find(row => Number(row.innings_number_c) === 1)?.total_runs_c || 0) + 1 : null
      });
      if (!result.data?.length) return toast.error(result.messages?.[0] || 'Could not start innings.');
      setSetupOpen(false);
      await sdk.table('matches_c').update({ Id: id, status_c: 'Live' });
      toast.success(`Innings ${number} started.`);
      reloadInnings();
      reloadMatch();
    } catch (e) {
      toast.error(e.message || 'Could not start innings.');
    } finally {
      setStarting(false);
    }
  }

  async function recordDelivery(event) {
    event.preventDefault();
    if (recoveryRequired) return toast.error('Reload this page to reconcile the saved match state before scoring again.');
    const batRuns = Number(batterRuns);
    const extraRuns = Number(extrasRuns);
    if (!activeInnings || !striker || !nonStriker || !bowler || striker === nonStriker || !Number.isInteger(batRuns) || batRuns < 0 || batRuns > 6 || !Number.isInteger(extraRuns) || extraRuns < 0 || extraRuns > 10) {
      return toast.error('Check the batter, bowler and run values.');
    }
    if (extrasType === 'None' && extraRuns !== 0) {
      return toast.error('Choose an extras type before entering extras runs.');
    }
    if (extrasType === 'Wide' && (batRuns !== 0 || extraRuns < 1)) {
      return toast.error('A wide must include at least one extra run and no batter runs.');
    }
    if (['Bye', 'Leg-bye'].includes(extrasType) && batRuns !== 0) {
      return toast.error('Bye and leg-bye runs must be entered as extras, not batter runs.');
    }
    const validWicketsForDelivery = extrasType === 'No-ball'
      ? ['None', 'Run out', 'Obstructing field']
      : extrasType === 'Wide'
        ? ['None', 'Run out', 'Stumped', 'Hit wicket', 'Obstructing field']
        : WICKETS;
    if (!validWicketsForDelivery.includes(wicketType)) {
      return toast.error(`A ${extrasType.toLowerCase()} cannot result in ${wicketType.toLowerCase()}.`);
    }
    if (wicketType === 'Retired out') return toast.error('Retired out is not a delivery dismissal. Use a dedicated retirement action when available.');
    const previous = deliveries ?? [];
    const current = scoreDeliveries(previous);
    const inningsBallLimit = Math.max(0, Number(match?.overs_c || 0) * 6);
    if (current.wickets >= 10) return toast.error('The innings has ended: all ten wickets have fallen.');
    if (inningsBallLimit > 0 && current.legalBalls >= inningsBallLimit) return toast.error('The allotted overs are complete. Finalize the innings before recording another delivery.');
    if (Number(activeInnings.innings_number_c) === 2 && Number(activeInnings.target_runs_c || 0) > 0 && current.runs >= Number(activeInnings.target_runs_c)) return toast.error('The target has been reached. Finalize the innings to record the result.');
    if (current.legalBalls > 0 && current.legalBalls % 6 === 0) {
      const lastLegalDelivery = [...previous].reverse().find(ball => ball.is_legal_ball_c);
      if (lastLegalDelivery && idOf(lastLegalDelivery.bowler_c) === bowler) {
        return toast.error('A bowler cannot bowl consecutive overs. Select a different bowler before continuing.');
      }
    }
    const isWicket = wicketType !== 'None';
    const needsIncomingBatter = isWicket && current.wickets < 9;
    if (isWicket && (!dismissedPlayer || (needsIncomingBatter && !nextBatter))) return toast.error('Choose the dismissed batter and, unless this is the tenth wicket, the incoming batter.');
    if (isWicket && ![striker, nonStriker].includes(dismissedPlayer)) return toast.error('The dismissed player must be one of the two active batters.');
    if (needsIncomingBatter && [striker, nonStriker, dismissedPlayer].includes(nextBatter)) return toast.error('The incoming batter must be a different, not-yet-dismissed player.');
    if (needsIncomingBatter && dismissedBatterIds.has(nextBatter)) return toast.error('A previously dismissed batter cannot return as the incoming batter.');
    if (['Bowled', 'Caught', 'LBW', 'Stumped', 'Hit wicket'].includes(wicketType) && dismissedPlayer !== striker) return toast.error('This dismissal must be recorded against the striker.');
    if (wicketType === 'Caught' && !fielder) return toast.error('Choose the fielder for a catch.');
    const noBallInvalidDismissals = ['Bowled', 'Caught', 'LBW', 'Stumped', 'Hit wicket'];
    const wideInvalidDismissals = ['Bowled', 'Caught', 'LBW', 'Hit wicket'];
    if (extrasType === 'No-ball' && noBallInvalidDismissals.includes(wicketType)) return toast.error('That dismissal cannot be recorded from a no-ball.');
    if (extrasType === 'Wide' && wideInvalidDismissals.includes(wicketType)) return toast.error('That dismissal cannot be recorded from a wide.');
    const legal = extrasType !== 'Wide' && extrasType !== 'No-ball';
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
        no_ball_penalty_runs_c: extrasType === 'No-ball' ? 1 : 0,
        is_legal_ball_c: legal,
        wicket_type_c: wicketType,
        dismissed_player_c: dismissedPlayer || null,
        fielder_c: fielder || null,
        batters_crossed_c: wicketType === 'Run out' ? battersCrossed : false
      };
      const result = await sdk.table('deliveries_c').create(payload);
      if (!result.data?.length) return toast.error(result.messages?.[0] || 'Delivery was not saved.');
      const updatedRows = [...previous, result.data[0]];
      const next = scoreDeliveries(updatedRows);
      let newStriker = striker;
      let newNonStriker = nonStriker;
      const runningExtras = extrasType === 'Wide' ? Math.max(0, extraRuns - 1) : extraRuns;
      const completedRuns = batRuns + (['Bye', 'Leg-bye', 'Wide', 'No-ball'].includes(extrasType) ? runningExtras : 0);
      if (wicketType === 'Run out') {
        // Use the ends occupied at the instant the wicket is broken.
        if (battersCrossed) [newStriker, newNonStriker] = [newNonStriker, newStriker];
      } else if (completedRuns % 2 === 1) {
        [newStriker, newNonStriker] = [newNonStriker, newStriker];
      }
      if (legal && next.legalBalls % 6 === 0) [newStriker, newNonStriker] = [newNonStriker, newStriker];
      if (wicketType !== 'None') {
        if (dismissedPlayer === newStriker) newStriker = nextBatter;
        else if (dismissedPlayer === newNonStriker) newNonStriker = nextBatter;
      }
      const update = await sdk.table('innings_c').update({
        Id: activeInnings.Id,
        total_runs_c: next.runs,
        wickets_c: next.wickets,
        legal_balls_c: next.legalBalls,
        wides_runs_c: next.wides,
        no_balls_runs_c: next.noBalls,
        byes_runs_c: next.byes,
        leg_byes_runs_c: next.legByes,
        penalty_runs_c: next.penalties,
        current_striker_c: newStriker,
        current_non_striker_c: newNonStriker,
        current_bowler_c: bowler
      });
      if (!update.data?.length) {
        toast.error('Ball saved, but the innings state did not update. Scoring is paused until the saved state is reloaded.');
        await Promise.all([reloadDeliveries(), reloadInnings(), reloadMatch()]);
        return;
      }
      toast.success('Delivery recorded.');
      setStriker(newStriker);
      setNonStriker(newNonStriker);
      setNextBatter('');
      setBatterRuns('0');
      setExtrasType('None');
      setExtrasRuns('0');
      setWicketType('None');
      setDismissedPlayer('');
      setFielder('');
      setBattersCrossed(false);
      await Promise.all([reloadDeliveries(), reloadInnings(), reloadMatch()]);
    } catch (e) {
      toast.error(e.message || 'Could not record delivery.');
    } finally {
      setSaving(false);
    }
  }

  async function applyCurrentBowler(value) {
    setSaving(true);
    try {
      const saved = await sdk.table('innings_c').update({ Id: activeInnings.Id, current_bowler_c: value });
      if (!saved.data?.length) throw new Error(saved.messages?.[0] || 'Bowler selection was not saved.');
      setBowler(value);
      await reloadInnings();
    } catch (error) {
      toast.error(error.message || 'Bowler selection was not saved.');
      console.error(`innings_c bowler update failed: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function undoLastDelivery() {
    if (!activeInnings || !(deliveries ?? []).length || saving || recoveryRequired) return;
    const last = deliveries[deliveries.length - 1];
    const remaining = deliveries.slice(0, -1);
    const next = scoreDeliveries(remaining);
    let deliveryRemoved = false;
    setSaving(true);
    try {
      const removed = await sdk.table('deliveries_c').remove(last.Id);
      if (!removed.data?.length) {
        return toast.error(removed.messages?.[0] || 'Could not undo the last delivery.');
      }
      deliveryRemoved = true;
      setRecoveryRequired(true);
      const updated = await sdk.table('innings_c').update({
        Id: activeInnings.Id,
        total_runs_c: next.runs,
        wickets_c: next.wickets,
        legal_balls_c: next.legalBalls,
        wides_runs_c: next.wides,
        no_balls_runs_c: next.noBalls,
        byes_runs_c: next.byes,
        leg_byes_runs_c: next.legByes,
        penalty_runs_c: next.penalties,
        current_striker_c: idOf(last.striker_c),
        current_non_striker_c: idOf(last.non_striker_c),
        current_bowler_c: idOf(last.bowler_c)
      });
      if (!updated.data?.length) {
        toast.error('The delivery was removed, but the innings summary did not save. Reload this page before scoring again.');
        await Promise.all([reloadDeliveries(), reloadInnings(), reloadMatch()]);
        return;
      }
      setStriker(idOf(last.striker_c));
      setNonStriker(idOf(last.non_striker_c));
      setBowler(idOf(last.bowler_c));
      setRecoveryRequired(false);
      toast.success('Last delivery undone.');
      await Promise.all([reloadDeliveries(), reloadInnings(), reloadMatch()]);
    } catch (error) {
      if (deliveryRemoved) {
        setRecoveryRequired(true);
        toast.error('Undo partially completed. Scoring is locked until you reload and reconcile the saved match state.');
        await Promise.all([reloadDeliveries(), reloadInnings(), reloadMatch()]);
      } else {
        toast.error(error.message || 'Could not undo the last delivery.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function persistMatchResult(secondInnings) {
    const first = (inningsRows ?? []).find(row => Number(row.innings_number_c) === 1);
    if (!first || !secondInnings || secondInnings.status_c !== 'Completed') {
      return toast.error('Both innings must be completed before saving a match result.');
    }
    const firstRuns = Number(first.total_runs_c || 0);
    const secondRuns = Number(secondInnings.total_runs_c || 0);
    const secondWickets = Number(secondInnings.wickets_c || 0);
    let resultType = 'Win';
    let winnerId = '';
    let margin = 0;
    let summary = '';

    if (secondRuns === firstRuns) {
      resultType = 'Tie';
      summary = 'Match tied';
    } else if (secondRuns > firstRuns) {
      winnerId = idOf(secondInnings.batting_team_c);
      margin = Math.max(0, 10 - secondWickets);
      summary = `${secondInnings.batting_team_c?.Name || 'Chasing team'} won by ${margin} wicket${margin === 1 ? '' : 's'}`;
    } else {
      winnerId = idOf(secondInnings.bowling_team_c);
      margin = firstRuns - secondRuns;
      summary = `${secondInnings.bowling_team_c?.Name || 'Defending team'} won by ${margin} run${margin === 1 ? '' : 's'}`;
    }

    const matchResult = await sdk.table('matches_c').update({
      Id: id,
      status_c: 'Completed',
      result_type_c: resultType,
      winner_team_c: winnerId || null,
      result_margin_c: margin,
      result_summary_c: summary
    });
    if (!matchResult.data?.length) throw new Error(matchResult.messages?.[0] || 'Could not save the match result.');
    toast.success(summary);
    reloadMatch();
  }

  async function finalizeWithoutWinner(resultType) {
    if (saving || !['No Result', 'Abandoned'].includes(resultType) || ['Completed', 'Abandoned'].includes(match?.status_c)) return;
    setSaving(true);
    try {
      if (activeInnings) {
        const stopped = await sdk.table('innings_c').update({ Id: activeInnings.Id, status_c: 'Abandoned' });
        if (!stopped.data?.length) throw new Error(stopped.messages?.[0] || 'Could not close the active innings.');
      }
      const isAbandoned = resultType === 'Abandoned';
      const summary = isAbandoned ? 'Match abandoned' : 'No result';
      const saved = await sdk.table('matches_c').update({
        Id: id,
        status_c: isAbandoned ? 'Abandoned' : 'Completed',
        result_type_c: resultType,
        winner_team_c: null,
        result_margin_c: 0,
        result_summary_c: summary
      });
      if (!saved.data?.length) throw new Error(saved.messages?.[0] || 'Could not save the match outcome.');
      setPendingResultAction('');
      toast.success(`${summary} recorded.`);
      reloadInnings();
      reloadMatch();
    } catch (error) {
      toast.error(error.message || 'Could not finalize the match. Refresh and check its status.');
      reloadInnings();
      reloadMatch();
    } finally {
      setSaving(false);
    }
  }

  async function retryMatchResult() {
    if (saving) return;
    const second = (inningsRows ?? []).find(row => Number(row.innings_number_c) === 2);
    setSaving(true);
    try {
      await persistMatchResult(second);
    } catch (e) {
      toast.error(e.message || 'Could not save the match result.');
    } finally {
      setSaving(false);
    }
  }

  async function completeInnings() {
    if (!activeInnings || saving) return;
    if (Number(activeInnings.innings_number_c) === 2 && !chaseWon && !chaseLost) {
      return toast.error('The chase is still in progress. Reach the target, lose all wickets, or use all overs before finalizing.');
    }
    setSaving(true);
    try {
      const completed = await sdk.table('innings_c').update({ Id: activeInnings.Id, status_c: 'Completed' });
      if (!completed.data?.length) return toast.error(completed.messages?.[0] || 'Could not complete innings.');
      if (Number(activeInnings.innings_number_c) === 1) {
        await sdk.table('matches_c').update({ Id: id, status_c: 'Live' });
        toast.success('First innings completed. Set up the second innings.');
      } else {
        const completedSecond = {...activeInnings, status_c: 'Completed', total_runs_c: score.runs, wickets_c: score.wickets, legal_balls_c: score.legalBalls};
        await persistMatchResult(completedSecond);
      }
      reloadInnings();
      reloadMatch();
    } catch (e) {
      toast.error(e.message || 'Could not complete innings. If the innings is already completed, use Retry result save.');
      reloadInnings();
    } finally {
      setSaving(false);
    }
  }

  if (matchLoading) return <DetailSkeleton />;
  if (matchError || !match) return <div className="rounded-xl border border-destructive/30 p-5"><p className="font-semibold">Match could not load.</p><p className="mt-2 text-sm text-muted-foreground">{matchError?.message || 'Match not found.'}</p><Button asChild variant="outline" className="mt-3"><Link to={`/matches/${id}`}>Back to match</Link></Button></div>;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {recoveryRequired ? <section role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4"><p className="font-semibold text-destructive">Scoring paused: match state needs reconciliation</p><p className="mt-1 text-sm text-muted-foreground">An undo removed the delivery but the innings summary could not be confirmed. Reload the page to rebuild the displayed state from saved records before continuing.</p><Button className="mt-3" variant="outline" onClick={() => window.location.reload()}>Reload match state</Button></section> : null}
      <Button asChild variant="ghost" size="sm"><Link to={`/matches/${id}`}><ApperIcon name="ArrowLeft" size={16} /> Back to match</Link></Button>
      <header className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Live match centre</p>
          <h1 className="mt-2 font-heading text-4xl font-bold uppercase">{match.Name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{match.team_a_c?.Name} vs {match.team_b_c?.Name} · {match.overs_c} overs per innings</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!activeInnings && !['Completed', 'Abandoned'].includes(match.status_c) && (inningsRows ?? []).some(row => Number(row.innings_number_c) === 2 && row.status_c === 'Completed') ? <Button variant="outline" disabled={saving} onClick={retryMatchResult}>{saving ? 'Saving…' : 'Retry result save'}</Button> : !activeInnings && !['Completed', 'Abandoned'].includes(match.status_c) ? <Button onClick={() => { setBattingTeam(idOf(match.team_a_c)); setBowlingTeam(idOf(match.team_b_c)); setSetupOpen(true); }}>Start innings</Button> : activeInnings ? <Button variant="outline" disabled={saving || (Number(activeInnings.innings_number_c) === 2 && !chaseWon && !chaseLost)} onClick={completeInnings}>{saving ? 'Saving…' : Number(activeInnings.innings_number_c) === 2 ? 'Finalize match' : 'Complete innings'}</Button> : <span className="rounded-full bg-success-muted px-3 py-2 text-sm font-semibold text-success">{match.status_c === 'Abandoned' ? 'MATCH ABANDONED' : 'MATCH COMPLETED'}</span>}
          {!['Completed', 'Abandoned'].includes(match.status_c) ? <>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setPendingResultAction('No Result')}>Record no result</Button>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setPendingResultAction('Abandoned')}>Abandon match</Button>
          </> : null}
        </div>
      </header>

      {pendingResultAction ? <section className="rounded-xl border border-destructive/30 bg-card p-5">
        <p className="font-semibold">Confirm {pendingResultAction === 'Abandoned' ? 'match abandonment' : 'no result'}</p>
        <p className="mt-1 text-sm text-muted-foreground">{pendingResultAction === 'Abandoned' ? 'This permanently marks the match as abandoned.' : 'Use this only when competition rules or match conditions mean neither team receives a result.'} {activeInnings ? 'The active innings will also be closed as abandoned.' : ''} Scoring cannot continue after confirmation.</p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={saving} onClick={() => setPendingResultAction('')}>Cancel</Button>
          <Button type="button" disabled={saving} onClick={() => finalizeWithoutWinner(pendingResultAction)}>{saving ? 'Saving…' : `Confirm ${pendingResultAction === 'Abandoned' ? 'abandonment' : 'no result'}`}</Button>
        </div>
      </section> : null}

      {(match.status_c === 'Completed' || match.status_c === 'Abandoned') && match.result_summary_c ? <section className="rounded-xl border border-primary/30 bg-primary/5 p-5"><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Match result</p><h2 className="mt-1 font-heading text-2xl font-bold">{match.result_summary_c}</h2><p className="mt-1 text-sm text-muted-foreground">{match.result_type_c === 'Tie' ? 'Scores level after both innings.' : match.result_type_c === 'No Result' ? 'No winner recorded under the competition outcome.' : match.result_type_c === 'Abandoned' ? 'The match was stopped without a result.' : match.winner_team_c?.Name || 'Winning team'}</p></section> : null}

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
            <div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-lg bg-muted/50 p-3"><p className="text-muted-foreground">Striker</p><p className="mt-1 font-semibold">{labelOf(battingPlayers.find(p => String(p.Id) === striker))}</p></div><div className="rounded-lg bg-muted/50 p-3"><p className="text-muted-foreground">Non-striker</p><p className="mt-1 font-semibold">{labelOf(battingPlayers.find(p => String(p.Id) === nonStriker))}</p></div><div className="col-span-2 rounded-lg bg-muted/50 p-3"><p className="text-muted-foreground">Bowler</p><select aria-label="Current bowler" disabled={recoveryRequired || saving} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2" value={bowler} onChange={async e => { const value = e.target.value; const previousBowler = bowler; setSaving(true); try { const saved = await sdk.table('innings_c').update({ Id: activeInnings.Id, current_bowler_c: value }); if (!saved.data?.length) throw new Error(saved.messages?.[0] || 'Bowler selection was not saved.'); setBowler(value); await reloadInnings(); } catch (error) { setBowler(previousBowler); toast.error(error.message || 'Bowler selection was not saved. The previous bowler has been restored.'); await reloadInnings(); } finally { setSaving(false); } }}><option value="">Choose bowler</option>{bowlingPlayers.map(p => <option key={p.Id} value={p.Id}>{labelOf(p)}</option>)}</select><AddPlayerInline squadId={idOf(activeInnings.bowling_team_c)} role="Bowler" onAdded={async id => { await reloadPlayers(); await applyCurrentBowler(id); }} /></div></div>
          </div>
        </section>

        {target > 0 ? <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Second innings · target {target}</p>
              <h2 className="mt-1 font-heading text-3xl font-bold">{chaseWon ? 'Target reached' : chaseLost ? 'Chase closed' : `${runsNeeded} runs needed`}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{chaseWon ? `${activeInnings.batting_team_c?.Name || 'Batting team'} have reached the target.` : chaseLost ? 'The innings has reached its limit before the target was reached.' : `${ballsRemaining} legal balls remaining · Required rate ${ballsRemaining ? (runsNeeded / (ballsRemaining / 6)).toFixed(2) : '—'}`}</p>
            </div>
            <p className="font-heading text-2xl font-bold tabular-nums">{score.runs}/{score.wickets}<span className="ml-2 text-sm font-normal text-muted-foreground">of {target - 1}</span></p>
          </div>
        </section> : null}

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-heading text-xl font-bold uppercase">Batting scorecard</h2>
              <p className="mt-1 text-xs text-muted-foreground">Runs · balls · boundaries · strike rate</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Batter</th>
                    <th className="px-2 py-3 text-right font-semibold">R</th>
                    <th className="px-2 py-3 text-right font-semibold">B</th>
                    <th className="px-2 py-3 text-right font-semibold">4s</th>
                    <th className="px-2 py-3 text-right font-semibold">6s</th>
                    <th className="px-4 py-3 text-right font-semibold">SR</th>
                  </tr>
                </thead>
                <tbody>
                  {scorecards.batting.map(row => (
                    <tr key={row.playerId} className="border-t border-border">
                      <td className="px-4 py-3">
                        <p className="font-semibold">{row.player ? labelOf(row.player) : 'Unknown batter'}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{row.dismissal}</p>
                      </td>
                      <td className="px-2 py-3 text-right font-bold tabular-nums">{row.runs}</td>
                      <td className="px-2 py-3 text-right tabular-nums">{row.balls}</td>
                      <td className="px-2 py-3 text-right tabular-nums">{row.fours}</td>
                      <td className="px-2 py-3 text-right tabular-nums">{row.sixes}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.strikeRate}</td>
                    </tr>
                  ))}
                  {!scorecards.batting.length ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">Batting figures appear after the first delivery.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-heading text-xl font-bold uppercase">Bowling figures</h2>
              <p className="mt-1 text-xs text-muted-foreground">Overs · maidens · runs · wickets · economy</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Bowler</th>
                    <th className="px-2 py-3 text-right font-semibold">O</th>
                    <th className="px-2 py-3 text-right font-semibold">M</th>
                    <th className="px-2 py-3 text-right font-semibold">R</th>
                    <th className="px-2 py-3 text-right font-semibold">W</th>
                    <th className="px-4 py-3 text-right font-semibold">Econ</th>
                  </tr>
                </thead>
                <tbody>
                  {scorecards.bowling.map(row => (
                    <tr key={row.playerId} className="border-t border-border">
                      <td className="px-4 py-3 font-semibold">{row.player ? labelOf(row.player) : 'Unknown bowler'}</td>
                      <td className="px-2 py-3 text-right tabular-nums">{row.overs}</td>
                      <td className="px-2 py-3 text-right tabular-nums">{row.maidens}</td>
                      <td className="px-2 py-3 text-right tabular-nums">{row.runs}</td>
                      <td className="px-2 py-3 text-right font-bold tabular-nums">{row.wickets}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.economy}</td>
                    </tr>
                  ))}
                  {!scorecards.bowling.length ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">Bowling figures appear after the first delivery.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <form onSubmit={recordDelivery} className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between"><h2 className="font-heading text-2xl font-bold uppercase">Record delivery</h2><span className="text-sm tabular-nums text-muted-foreground">Over {Math.floor(score.legalBalls / 6) + 1} · Ball {score.legalBalls % 6 + 1}</span></div>
            <div className="grid grid-cols-4 gap-2">{[0, 1, 2, 3, 4, 5, 6].map(n => <Button key={n} type="button" variant={batterRuns === String(n) ? 'default' : 'outline'} className="h-12 text-lg font-bold" onClick={() => { setBatterRuns(String(n)); if (n > 0 && extrasType !== 'No-ball') { setExtrasType('None'); setExtrasRuns('0'); } }}>{n}</Button>)}<Button type="button" variant="outline" className="h-12" onClick={() => { setBatterRuns('0'); setExtrasType('Wide'); setExtrasRuns('1'); }}>Wd</Button><Button type="button" variant="outline" className="h-12" onClick={() => { setBatterRuns('0'); setExtrasType('No-ball'); setExtrasRuns('0'); }}>Nb</Button></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label>Extras type</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3" value={extrasType} onChange={e => { const nextType = e.target.value; const allowedWickets = nextType === 'No-ball' ? ['None', 'Run out', 'Obstructing field'] : nextType === 'Wide' ? ['None', 'Run out', 'Stumped', 'Hit wicket', 'Obstructing field'] : WICKETS; setExtrasType(nextType); if (!allowedWickets.includes(wicketType)) { setWicketType('None'); setDismissedPlayer(''); setFielder(''); setNextBatter(''); setBattersCrossed(false); } }}>{EXTRAS.map(x => <option key={x}>{x}</option>)}</select></div>
              <div className="space-y-2"><Label>{extrasType === 'No-ball' ? 'Additional byes / leg-byes' : extrasType === 'Wide' ? 'Wide runs (1 + byes/leg-byes)' : 'Extras runs'}</Label><Input type="number" min="0" max="10" value={extrasRuns} onChange={e => setExtrasRuns(e.target.value)} /></div>
              <div className="space-y-2"><Label>Wicket</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3" value={wicketType} onChange={e => setWicketType(e.target.value)}>{(extrasType === 'No-ball' ? ['None', 'Run out', 'Obstructing field'] : extrasType === 'Wide' ? ['None', 'Run out', 'Stumped', 'Hit wicket', 'Obstructing field'] : WICKETS).map(x => <option key={x}>{x}</option>)}</select></div>
              {wicketType !== 'None' ? <>{wicketType === 'Run out' ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={battersCrossed} onChange={e => setBattersCrossed(e.target.checked)} />Batters had crossed when the wicket was broken</label> : null}<div className="space-y-2"><Label>Dismissed batter</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3" value={dismissedPlayer} onChange={e => setDismissedPlayer(e.target.value)}><option value="">Choose batter</option>{battingPlayers.filter(p => [striker, nonStriker].includes(String(p.Id))).map(p => <option key={p.Id} value={p.Id}>{labelOf(p)}</option>)}</select></div><div className="space-y-2"><Label>Fielder (if applicable)</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3" value={fielder} onChange={e => setFielder(e.target.value)}><option value="">Not applicable</option>{bowlingPlayers.map(p => <option key={p.Id} value={p.Id}>{labelOf(p)}</option>)}</select></div><div className="space-y-2"><Label>Next batter</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3" value={nextBatter} onChange={e => setNextBatter(e.target.value)}><option value="">Choose after wicket</option>{availableBatters.map(p => <option key={p.Id} value={p.Id}>{labelOf(p)}</option>)}</select><AddPlayerInline squadId={idOf(activeInnings?.batting_team_c)} role="Batter" onAdded={async id => { await reloadPlayers(); setNextBatter(id); }} /></div></> : null}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><p className="text-xs text-muted-foreground">Wide and no-ball do not count as legal balls. Extras are added to the team total.</p><Button disabled={recoveryRequired || saving || deliveriesLoading || !striker || !nonStriker || !bowler || score.wickets >= 10 || score.legalBalls >= maxOvers * 6 || chaseWon}>{saving ? 'Saving…' : 'Record ball'}</Button></div>
          </section>
          <aside className="space-y-4">
            <section className="rounded-xl border border-border bg-card p-5"><h3 className="font-heading text-xl font-bold uppercase">This over</h3><div className="mt-3 flex flex-wrap gap-2">{(deliveries ?? []).filter(d => d.over_number_c === Math.floor(score.legalBalls / 6) + 1).map(d => <span key={d.Id} className="grid h-9 min-w-9 place-items-center rounded-md border border-border px-2 text-sm font-semibold">{chipLabel(d)}</span>)}{!(deliveries ?? []).some(d => d.over_number_c === Math.floor(score.legalBalls / 6) + 1) ? <p className="text-sm text-muted-foreground">No balls yet in this over.</p> : null}</div><p className="mt-3 text-sm text-muted-foreground">{overComplete ? 'Over complete. Change bowler before the next delivery.' : 'Ball-by-ball entries are saved as the scoring ledger.'}</p></section>
            <section className="rounded-xl border border-border bg-card p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-heading text-xl font-bold uppercase">Delivery audit trail</h3><p className="mt-1 text-xs text-muted-foreground">{(deliveries ?? []).length} recorded entries · newest first</p></div><Button type="button" size="sm" variant="outline" disabled={recoveryRequired || saving || deliveriesLoading || !(deliveries ?? []).length} onClick={undoLastDelivery}>Undo last ball</Button></div><div className="mt-3 max-h-[480px] space-y-2 overflow-y-auto pr-1">{(deliveries ?? []).slice().reverse().map(d => <div key={d.Id} className="grid grid-cols-[52px_1fr_auto] items-start gap-2 border-b border-border pb-2 text-sm"><span className="font-semibold tabular-nums">{d.over_number_c}.{d.ball_number_c}</span><div className="min-w-0"><p className="truncate font-medium">{d.striker_c?.Name || 'Batter'} <span className="font-normal text-muted-foreground">vs {d.bowler_c?.Name || 'Bowler'}</span></p><p className="text-xs text-muted-foreground">{d.wicket_type_c && d.wicket_type_c !== 'None' ? `${d.wicket_type_c} · ${d.dismissed_player_c?.Name || 'Dismissed batter'}${d.fielder_c?.Name ? ` · ${d.fielder_c.Name}` : ''}` : d.extras_type_c && d.extras_type_c !== 'None' ? extrasNote(d) : 'Legal delivery'}</p></div><strong className="tabular-nums">{d.wicket_type_c && d.wicket_type_c !== 'None' ? 'W' : `+${ballRuns(d)}`}</strong></div>)}{!(deliveries ?? []).length ? <p className="text-sm text-muted-foreground">The first delivery has not been recorded.</p> : null}</div><p className="mt-3 text-xs text-muted-foreground">Only the most recent delivery can currently be undone. Historical edits are intentionally disabled to avoid corrupting later batter and bowler state.</p></section>
          </aside>
        </form>
      </> : <section className="rounded-xl border border-dashed border-border bg-card p-8 text-center"><ApperIcon name="PlayCircle" size={32} className="mx-auto text-muted-foreground" /><h2 className="mt-3 font-heading text-2xl font-bold uppercase">{inningsLoading ? 'Loading innings…' : 'Ready for the toss'}</h2><p className="mt-1 text-sm text-muted-foreground">{(inningsRows ?? []).length ? 'Previous innings are saved. Start the next innings when the teams are ready.' : 'Set the batting order and opening bowler to begin ball-by-ball scoring.'}</p>{!inningsLoading && !['Completed', 'Abandoned'].includes(match.status_c) ? <Button className="mt-4" onClick={() => { setBattingTeam(idOf(match.team_a_c)); setBowlingTeam(idOf(match.team_b_c)); setSetupOpen(true); }}>Set up innings</Button> : null}</section>}
      {historicalScorecards.map(item => <section key={item.innings.Id} className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Completed innings {item.innings.innings_number_c}</p>
            <h2 className="font-heading text-2xl font-bold uppercase">{item.innings.batting_team_c?.Name || 'Batting team'}</h2>
          </div>
          <p className="font-heading text-3xl font-bold tabular-nums">{item.score.runs}/{item.score.wickets}<span className="ml-2 text-sm font-normal text-muted-foreground">({oversText(item.score.legalBalls)} overs)</span></p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="overflow-x-auto">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide">Batting</h3>
            <table className="w-full min-w-[420px] text-sm">
              <thead className="text-xs text-muted-foreground"><tr><th className="py-2 text-left">Batter</th><th className="px-2 text-right">R</th><th className="px-2 text-right">B</th><th className="px-2 text-right">4s</th><th className="px-2 text-right">6s</th><th className="text-right">SR</th></tr></thead>
              <tbody>{item.figures.batting.map(row => <tr key={row.playerId} className="border-t border-border"><td className="py-2"><p className="font-medium">{row.player ? labelOf(row.player) : 'Unknown batter'}</p><p className="text-xs text-muted-foreground">{row.dismissal}</p></td><td className="px-2 text-right tabular-nums">{row.runs}</td><td className="px-2 text-right tabular-nums">{row.balls}</td><td className="px-2 text-right tabular-nums">{row.fours}</td><td className="px-2 text-right tabular-nums">{row.sixes}</td><td className="text-right tabular-nums">{row.strikeRate}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="overflow-x-auto">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide">Bowling</h3>
            <table className="w-full min-w-[360px] text-sm">
              <thead className="text-xs text-muted-foreground"><tr><th className="py-2 text-left">Bowler</th><th className="px-2 text-right">O</th><th className="px-2 text-right">M</th><th className="px-2 text-right">R</th><th className="px-2 text-right">W</th><th className="text-right">Econ</th></tr></thead>
              <tbody>{item.figures.bowling.map(row => <tr key={row.playerId} className="border-t border-border"><td className="py-2 font-medium">{row.player ? labelOf(row.player) : 'Unknown bowler'}</td><td className="px-2 text-right tabular-nums">{row.overs}</td><td className="px-2 text-right tabular-nums">{row.maidens}</td><td className="px-2 text-right tabular-nums">{row.runs}</td><td className="px-2 text-right tabular-nums">{row.wickets}</td><td className="text-right tabular-nums">{row.economy}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      </section>)}
    </div>
  );
}
