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

const MATCH_FIELDS = ['Id', 'Name', 'team_a_c', 'team_b_c', 'overs_c', 'status_c', 'result_type_c', 'winner_team_c', 'result_margin_c', 'result_summary_c'];
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
          : wicketType === 'Run out' || wicketType === 'Obstructing field' || wicketType === 'Retired out'
            ? wicketType.toLowerCase()
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
      if (type === 'Wide' || type === 'No-ball') bowler.runs += extras + batterRuns;
      else if (type !== 'Bye' && type !== 'Leg-bye' && type !== 'Penalty') bowler.runs += batterRuns;
      if (creditedWickets.has(wicketType)) bowler.wickets += 1;

      const overKey = `${bowlerId}:${ball.over_number_c}`;
      if (!overFigures.has(overKey)) overFigures.set(overKey, { bowlerId, over: Number(ball.over_number_c), legalBalls: 0, conceded: 0 });
      const over = overFigures.get(overKey);
      if (ball.is_legal_ball_c) over.legalBalls += 1;
      if (type === 'Wide' || type === 'No-ball') over.conceded += extras + batterRuns;
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
  const { data: players } = useFetch(() => sdk.table('players_c').select(PLAYER_FIELDS).orderBy('Name').fetch().then(r => {
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
  const availableBatters = battingPlayers.filter(p => ![striker, nonStriker].includes(String(p.Id)));
  const overComplete = score.legalBalls > 0 && score.legalBalls % 6 === 0;

  useEffect(() => {
    if (!activeInnings) return;
    setStriker(idOf(activeInnings.current_striker_c));
    setNonStriker(idOf(activeInnings.current_non_striker_c));
    setBowler(idOf(activeInnings.current_bowler_c));
  }, [activeInnings?.Id]);

  async function startInnings(event) {
    event.preventDefault();
    if (!match || ['Completed', 'Abandoned'].includes(match.status_c)) return toast.error('This match has already been finalized.');
    if (!battingTeam || !bowlingTeam || battingTeam === bowlingTeam || !striker || !nonStriker || striker === nonStriker || !bowler) {
      return toast.error('Choose two different teams, two different opening batters and a bowler.');
    }
    setStarting(true);
    try {
      const number = (inningsRows ?? []).length + 1;
      const previousInnings = (inningsRows ?? []).find(row => Number(row.innings_number_c) === number - 1);
      if (number > 1 && previousInnings?.status_c !== 'Completed') {
        return toast.error('Complete the previous innings before starting the next one.');
      }
      if (number > 2) {
        return toast.error('This match format currently supports two innings only.');
      }
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
    const batRuns = Number(batterRuns);
    const extraRuns = Number(extrasRuns);
    if (!activeInnings || !striker || !nonStriker || !bowler || striker === nonStriker || !Number.isInteger(batRuns) || batRuns < 0 || batRuns > 6 || !Number.isInteger(extraRuns) || extraRuns < 0 || extraRuns > 10) {
      return toast.error('Check the batter, bowler and run values.');
    }
    if (extrasType === 'Wide' && (batRuns !== 0 || extraRuns < 1)) {
      return toast.error('A wide must include at least one extra run and no batter runs.');
    }
    if (extrasType === 'No-ball' && extraRuns < 1) {
      return toast.error('A no-ball must include at least one extra run.');
    }
    if (['Bye', 'Leg-bye', 'Penalty'].includes(extrasType) && batRuns !== 0) {
      return toast.error('Bye, leg-bye and penalty runs must be entered as extras, not batter runs.');
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
        toast.error('Ball saved, but the innings summary did not update. Refresh before continuing.');
      } else {
        toast.success('Delivery recorded.');
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

  async function undoLastDelivery() {
    if (!activeInnings || !(deliveries ?? []).length || saving) return;
    const last = deliveries[deliveries.length - 1];
    const remaining = deliveries.slice(0, -1);
    const next = scoreDeliveries(remaining);
    setSaving(true);
    try {
      const removed = await sdk.table('deliveries_c').remove(last.Id);
      if (!removed.data?.length) {
        return toast.error(removed.messages?.[0] || 'Could not undo the last delivery.');
      }
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
        current_non_striker_c: idOf(last.non_striker_c)
      });
      setStriker(idOf(last.striker_c));
      setNonStriker(idOf(last.non_striker_c));
      if (!updated.data?.length) {
        toast.error('Delivery removed, but the innings summary needs a refresh.');
      } else {
        toast.success('Last delivery undone.');
      }
      reloadDeliveries();
      reloadInnings();
    } catch (error) {
      toast.error(error.message || 'Could not undo the last delivery.');
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
            <div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-lg bg-muted/50 p-3"><p className="text-muted-foreground">Striker</p><p className="mt-1 font-semibold">{labelOf(battingPlayers.find(p => String(p.Id) === striker))}</p></div><div className="rounded-lg bg-muted/50 p-3"><p className="text-muted-foreground">Non-striker</p><p className="mt-1 font-semibold">{labelOf(battingPlayers.find(p => String(p.Id) === nonStriker))}</p></div><div className="col-span-2 rounded-lg bg-muted/50 p-3"><p className="text-muted-foreground">Bowler</p><select aria-label="Current bowler" className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2" value={bowler} onChange={async e => { const value = e.target.value; setBowler(value); try { const saved = await sdk.table('innings_c').update({ Id: activeInnings.Id, current_bowler_c: value }); if (!saved.data?.length) toast.error('Bowler selection was not saved.'); } catch (error) { toast.error(error.message || 'Bowler selection was not saved.'); } }}><option value="">Choose bowler</option>{bowlingPlayers.map(p => <option key={p.Id} value={p.Id}>{labelOf(p)}</option>)}</select></div></div>
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
            <div className="grid grid-cols-4 gap-2">{[0, 1, 2, 3, 4, 5, 6].map(n => <Button key={n} type="button" variant={batterRuns === String(n) ? 'default' : 'outline'} className="h-12 text-lg font-bold" onClick={() => { setBatterRuns(String(n)); if (n > 0) { setExtrasType('None'); setExtrasRuns('0'); } }}>{n}</Button>)}<Button type="button" variant="outline" className="h-12" onClick={() => { setBatterRuns('0'); setExtrasType('Wide'); setExtrasRuns('1'); }}>Wd</Button><Button type="button" variant="outline" className="h-12" onClick={() => { setBatterRuns('0'); setExtrasType('No-ball'); setExtrasRuns('1'); }}>Nb</Button></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label>Extras type</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3" value={extrasType} onChange={e => setExtrasType(e.target.value)}>{EXTRAS.map(x => <option key={x}>{x}</option>)}</select></div>
              <div className="space-y-2"><Label>Extras runs</Label><Input type="number" min="0" max="10" value={extrasRuns} onChange={e => setExtrasRuns(e.target.value)} /></div>
              <div className="space-y-2"><Label>Wicket</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3" value={wicketType} onChange={e => setWicketType(e.target.value)}>{WICKETS.map(x => <option key={x}>{x}</option>)}</select></div>
              {wicketType !== 'None' ? <><div className="space-y-2"><Label>Dismissed batter</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3" value={dismissedPlayer} onChange={e => setDismissedPlayer(e.target.value)}><option value="">Choose batter</option>{battingPlayers.filter(p => [striker, nonStriker].includes(String(p.Id))).map(p => <option key={p.Id} value={p.Id}>{labelOf(p)}</option>)}</select></div><div className="space-y-2"><Label>Fielder (if applicable)</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3" value={fielder} onChange={e => setFielder(e.target.value)}><option value="">Not applicable</option>{bowlingPlayers.map(p => <option key={p.Id} value={p.Id}>{labelOf(p)}</option>)}</select></div><div className="space-y-2"><Label>Next batter</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3" value={nextBatter} onChange={e => setNextBatter(e.target.value)}><option value="">Choose after wicket</option>{availableBatters.map(p => <option key={p.Id} value={p.Id}>{labelOf(p)}</option>)}</select></div></> : null}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><p className="text-xs text-muted-foreground">Wide and no-ball do not count as legal balls. Extras are added to the team total.</p><Button disabled={saving || deliveriesLoading || !striker || !nonStriker || !bowler || score.wickets >= 10 || score.legalBalls >= maxOvers * 6 || chaseWon}>{saving ? 'Saving…' : 'Record ball'}</Button></div>
          </section>
          <aside className="space-y-4">
            <section className="rounded-xl border border-border bg-card p-5"><h3 className="font-heading text-xl font-bold uppercase">This over</h3><div className="mt-3 flex flex-wrap gap-2">{(deliveries ?? []).filter(d => d.over_number_c === Math.floor(score.legalBalls / 6) + 1).map(d => <span key={d.Id} className="grid h-9 min-w-9 place-items-center rounded-md border border-border px-2 text-sm font-semibold">{d.wicket_type_c && d.wicket_type_c !== 'None' ? 'W' : d.extras_type_c === 'Wide' ? 'Wd' : d.extras_type_c === 'No-ball' ? 'Nb' : Number(d.batter_runs_c || 0) + Number(d.extras_runs_c || 0)}</span>)}{!(deliveries ?? []).some(d => d.over_number_c === Math.floor(score.legalBalls / 6) + 1) ? <p className="text-sm text-muted-foreground">No balls yet in this over.</p> : null}</div><p className="mt-3 text-sm text-muted-foreground">{overComplete ? 'Over complete. Change bowler before the next delivery.' : 'Ball-by-ball entries are saved as the scoring ledger.'}</p></section>
            <section className="rounded-xl border border-border bg-card p-5"><div className="flex items-center justify-between gap-3"><h3 className="font-heading text-xl font-bold uppercase">Recent deliveries</h3><Button type="button" size="sm" variant="outline" disabled={saving || deliveriesLoading || !(deliveries ?? []).length} onClick={undoLastDelivery}>Undo last ball</Button></div><div className="mt-3 space-y-2">{(deliveries ?? []).slice(-8).reverse().map(d => <div key={d.Id} className="flex items-center justify-between border-b border-border pb-2 text-sm"><span className="text-muted-foreground">{d.over_number_c}.{d.ball_number_c} · {d.striker_c?.Name || 'Batter'}</span><strong>{d.wicket_type_c && d.wicket_type_c !== 'None' ? 'Wicket' : `+${Number(d.batter_runs_c || 0) + Number(d.extras_runs_c || 0)}`}</strong></div>)}{!(deliveries ?? []).length ? <p className="text-sm text-muted-foreground">The first delivery has not been recorded.</p> : null}</div></section>
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
