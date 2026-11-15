import { sdk } from '@/services/sdk';

const { eq } = window.ApperSDK.CoreSDK;

const MATCH_FIELDS = [
  'Id', 'Name', 'tournament_c', 'team_a_c', 'team_b_c', 'match_date_c',
  'start_time_c', 'venue_c', 'overs_c', 'status_c', 'result_type_c',
  'result_margin_c', 'result_summary_c'
];

const INNINGS_FIELDS = [
  'Id', 'innings_number_c', 'status_c', 'total_runs_c', 'wickets_c',
  'legal_balls_c', 'target_runs_c', 'batting_team_c', 'bowling_team_c',
  'current_striker_c', 'current_non_striker_c', 'current_bowler_c'
];

const SNAPSHOT_FIELDS = ['Id', 'Name', 'match_c', 'public_key_c', 'is_published_c', 'snapshot_json_c'];

const oversText = (balls) => `${Math.floor(Number(balls || 0) / 6)}.${Number(balls || 0) % 6}`;

async function getSnapshot(matchId) {
  const result = await sdk.table('public_match_scoreboards_c')
    .select(SNAPSHOT_FIELDS)
    .where(eq('match_c', matchId))
    .fetch();
  if (!result.success) throw new Error(result.message || 'Could not load public scoreboard settings.');
  return result.data?.[0] ?? null;
}

async function buildPublicSnapshot(matchId) {
  const matchResult = await sdk.table('matches_c').select(MATCH_FIELDS).get(matchId);
  if (!matchResult.success || !matchResult.data) throw new Error(matchResult.message || 'Match not found.');
  const match = matchResult.data;
  const inningsResult = await sdk.table('innings_c')
    .select(INNINGS_FIELDS)
    .where(eq('match_c', matchId))
    .orderBy('innings_number_c')
    .fetch();
  if (!inningsResult.success) throw new Error(inningsResult.message || 'Could not load innings.');

  return {
    matchName: match.Name || 'Cricket match',
    tournamentName: match.tournament_c?.Name || 'Tournament',
    teamA: match.team_a_c?.Name || 'Team A',
    teamB: match.team_b_c?.Name || 'Team B',
    matchDate: match.match_date_c || '',
    startTime: match.start_time_c || '',
    venue: match.venue_c || '',
    oversPerInnings: Number(match.overs_c || 0),
    status: match.status_c || 'Scheduled',
    resultType: match.result_type_c || '',
    resultSummary: match.result_summary_c || '',
    innings: (inningsResult.data ?? []).map((innings) => ({
      inningsNumber: Number(innings.innings_number_c || 0),
      battingTeam: innings.batting_team_c?.Name || 'Batting team',
      bowlingTeam: innings.bowling_team_c?.Name || 'Bowling team',
      runs: Number(innings.total_runs_c || 0),
      wickets: Number(innings.wickets_c || 0),
      legalBalls: Number(innings.legal_balls_c || 0),
      overs: oversText(innings.legal_balls_c),
      target: Number(innings.target_runs_c || 0),
      inningsStatus: innings.status_c || 'Not Started',
      striker: innings.current_striker_c?.Name || '',
      nonStriker: innings.current_non_striker_c?.Name || '',
      bowler: innings.current_bowler_c?.Name || ''
    }))
  };
}

export async function publishMatchScoreboard(matchId) {
  const snapshot = await buildPublicSnapshot(matchId);
  const existing = await getSnapshot(matchId);
  const payload = {
    is_published_c: true,
    snapshot_json_c: JSON.stringify(snapshot),
    published_on_c: new Date().toISOString()
  };
  if (existing) {
    const updated = await sdk.table('public_match_scoreboards_c').update({ Id: existing.Id, ...payload });
    if (!updated.data?.length) throw new Error(updated.messages?.[0] || 'Could not publish scoreboard.');
    return { publicKey: existing.public_key_c, published: true };
  }
  const created = await sdk.table('public_match_scoreboards_c').create({
    Name: `Public scoreboard · ${snapshot.matchName}`,
    match_c: matchId,
    public_key_c: crypto.randomUUID(),
    ...payload
  });
  if (!created.data?.length) throw new Error(created.messages?.[0] || 'Could not publish scoreboard.');
  return { publicKey: created.data[0].public_key_c, published: true };
}

export async function unpublishMatchScoreboard(matchId) {
  const existing = await getSnapshot(matchId);
  if (!existing) return;
  const result = await sdk.table('public_match_scoreboards_c').update({ Id: existing.Id, is_published_c: false });
  if (!result.data?.length) throw new Error(result.messages?.[0] || 'Could not unpublish scoreboard.');
}

export async function refreshPublishedScoreboard(matchId) {
  const existing = await getSnapshot(matchId);
  if (!existing?.is_published_c) return;
  const snapshot = await buildPublicSnapshot(matchId);
  const result = await sdk.table('public_match_scoreboards_c').update({
    Id: existing.Id,
    snapshot_json_c: JSON.stringify(snapshot),
    published_on_c: new Date().toISOString()
  });
  if (!result.data?.length) throw new Error(result.messages?.[0] || 'Could not refresh public scoreboard.');
}
