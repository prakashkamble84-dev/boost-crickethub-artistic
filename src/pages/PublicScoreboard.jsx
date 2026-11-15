import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import { DetailSkeleton } from '@/components/PageSkeleton';
import { Button } from '@/components/ui/button';

const { eq } = window.ApperSDK.CoreSDK;
const FIELDS = ['Id', 'public_key_c', 'is_published_c', 'snapshot_json_c'];

export const route = { path: '/scoreboard/:publicKey', layout: 'public', access: 'public' };

const oversText = (balls) => `${Math.floor(Number(balls || 0) / 6)}.${Number(balls || 0) % 6}`;

export default function PublicScoreboard() {
  const { publicKey } = useParams();
  const { data: row, loading, error, run } = useFetch(() => sdk.table('public_match_scoreboards_c')
    .select(FIELDS)
    .where(eq('public_key_c', publicKey))
    .fetch()
    .then((result) => {
      if (!result.success) throw new Error(result.message || 'Scoreboard could not be loaded.');
      return result.data?.[0] ?? null;
    }), [publicKey]);
  const snapshot = useMemo(() => {
    if (!row?.is_published_c || !row.snapshot_json_c) return null;
    try { return JSON.parse(row.snapshot_json_c); } catch { return null; }
  }, [row]);

  useEffect(() => {
    const intervalId = window.setInterval(() => run(), 15000);
    return () => window.clearInterval(intervalId);
  }, [publicKey]);

  if (loading) return <div className="mx-auto max-w-4xl px-4 py-12"><DetailSkeleton /></div>;
  if (error || !snapshot) return (
    <main className="mx-auto grid min-h-svh max-w-xl place-items-center px-5 py-16 text-center">
      <div className="space-y-4">
        <div className="text-5xl">🏏</div>
        <h1 className="font-heading text-3xl font-bold uppercase">Scoreboard unavailable</h1>
        <p className="text-sm text-muted-foreground">This scoreboard is not published, the link is invalid, or the match owner has taken it offline.</p>
        <Button variant="outline" onClick={run}>Try again</Button>
      </div>
    </main>
  );

  const current = [...(snapshot.innings ?? [])].reverse().find((item) => item.inningsStatus === 'In Progress');
  return (
    <main className="mx-auto min-h-svh max-w-5xl space-y-6 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">CricketHub · Public scoreboard</p>
          <p className="mt-1 text-sm text-muted-foreground">{snapshot.tournamentName}</p>
        </div>
        <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold">{snapshot.status}</span>
      </header>
      <section className="rounded-2xl border border-border bg-card p-6 sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{snapshot.matchName}</p>
        <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <h1 className="font-heading text-3xl font-bold uppercase sm:text-4xl">{snapshot.teamA}</h1>
          <span className="text-sm font-semibold text-muted-foreground">VS</span>
          <h2 className="font-heading text-3xl font-bold uppercase sm:text-right sm:text-4xl">{snapshot.teamB}</h2>
        </div>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
          {snapshot.matchDate ? <span>{snapshot.matchDate}</span> : null}
          {snapshot.startTime ? <span>{snapshot.startTime}</span> : null}
          {snapshot.venue ? <span>{snapshot.venue}</span> : null}
          <span>{snapshot.oversPerInnings} overs per innings</span>
        </div>
      </section>
      {current ? (
        <section className="rounded-2xl border border-primary/30 bg-card p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Live innings {current.inningsNumber}</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-heading text-2xl font-bold uppercase">{current.battingTeam}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Batting · {current.bowlingTeam} bowling</p>
            </div>
            <p className="font-heading text-5xl font-bold tabular-nums">{current.runs}/{current.wickets}<span className="ml-2 text-base font-medium text-muted-foreground">({oversText(current.legalBalls)} ov)</span></p>
          </div>
          {current.target ? <p className="mt-3 text-sm text-muted-foreground">Target: {current.target}</p> : null}
          <div className="mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
            <div><p className="text-xs text-muted-foreground">Striker</p><p className="mt-1 font-semibold">{current.striker || 'Not set'}</p></div>
            <div><p className="text-xs text-muted-foreground">Non-striker</p><p className="mt-1 font-semibold">{current.nonStriker || 'Not set'}</p></div>
            <div><p className="text-xs text-muted-foreground">Bowler</p><p className="mt-1 font-semibold">{current.bowler || 'Not set'}</p></div>
          </div>
        </section>
      ) : null}
      <section className="space-y-3">
        <h2 className="font-heading text-xl font-bold uppercase">Innings summary</h2>
        {(snapshot.innings ?? []).map((innings) => (
          <article key={innings.inningsNumber} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
            <div><p className="font-semibold">{innings.battingTeam}</p><p className="text-xs text-muted-foreground">Innings {innings.inningsNumber} · {innings.inningsStatus}</p></div>
            <p className="font-heading text-2xl font-bold tabular-nums">{innings.runs}/{innings.wickets}<span className="ml-2 text-sm font-medium text-muted-foreground">({oversText(innings.legalBalls)} ov)</span></p>
          </article>
        ))}
        {!snapshot.innings?.length ? <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">The match has not started yet.</p> : null}
      </section>
      {snapshot.resultSummary ? <section className="rounded-xl border border-border bg-card p-5"><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Result</p><p className="mt-2 text-xl font-semibold">{snapshot.resultSummary}</p></section> : null}
      <footer className="border-t border-border pt-4 text-center text-xs text-muted-foreground">Public match information shared by the tournament organizer.</footer>
    </main>
  );
}
