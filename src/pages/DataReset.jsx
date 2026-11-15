import { useState } from 'react';
import { toast } from 'sonner';
import { sdk } from '@/services/sdk';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
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

// Child tables first so no row is left pointing at a deleted parent.
const RESET_TABLES = [
  'deliveries_c',
  'innings_c',
  'public_match_scoreboards_c',
  'match_scorer_invitations_c',
  'squads_c',
  'players_c',
  'matches_c',
  'tournaments_c',
];
const BATCH_SIZE = 200;

export const route = { path: '/data-reset', layout: 'owner', access: "profile === 'Admin_c'" };

async function clearTable(table) {
  let removed = 0;
  for (;;) {
    const res = await sdk.table(table).select(['Id']).page(1, BATCH_SIZE).fetch();
    if (!res.success) throw new Error(res.message);
    const ids = (res.data ?? []).map((row) => row.Id);
    if (ids.length === 0) return removed;
    const del = await sdk.table(table).remove(ids);
    if (del.messages.length) {
      console.error(`${table} remove failed: ${del.messages.join('; ')}`);
      throw new Error(del.messages[0]);
    }
    if (!del.data.length) throw new Error(`No rows removed from ${table}`);
    removed += del.data.length;
  }
}

export default function DataReset() {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState(null);

  async function handleReset() {
    setRunning(true);
    setReport(null);
    const counts = {};
    try {
      for (const table of RESET_TABLES) {
        counts[table] = await clearTable(table);
      }
      setReport({ ok: true, counts });
      toast.success('Sample data removed');
    } catch (error) {
      console.error(`data reset failed: ${error.message}`);
      setReport({ ok: false, counts, message: error.message });
      toast.error('Reset stopped', { description: error.message });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Owner tools</p>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">Reset sample data</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Permanently deletes all tournaments, matches, squads, players, innings and deliveries. Accounts and subscriptions are kept.
        </p>
      </div>

      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={running} className="gap-2">
              <ApperIcon name="Trash2" size={16} /> {running ? 'Removing…' : 'Remove all sample data'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete all tournament data?</AlertDialogTitle>
              <AlertDialogDescription>
                This cannot be undone. Every tournament and its related records will be deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleReset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete everything
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {report ? (
          <div className="mt-5 space-y-2 text-sm">
            <p className={report.ok ? 'font-medium text-success' : 'font-medium text-destructive'}>
              {report.ok ? 'Reset complete.' : `Reset stopped: ${report.message}`}
            </p>
            <ul className="space-y-1 text-muted-foreground">
              {Object.entries(report.counts).map(([table, count]) => (
                <li key={table} className="flex justify-between tabular-nums"><span>{table}</span><span>{count} removed</span></li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}