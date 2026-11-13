import { useState } from 'react';
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

const FIELDS = ['Id', 'Name', 'status_c', 'format_c', 'location_c', 'start_date_c', 'end_date_c', 'overs_c', 'teams_count_c', 'is_public_c', 'description_c'];

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
      <div className="rounded-xl border border-dashed border-border p-5">
        <div className="flex items-center gap-2"><ApperIcon name="Construction" size={18} className="text-highlight" /><h2 className="font-semibold">Next setup steps</h2></div>
        <p className="mt-2 text-sm text-muted-foreground">Team registration, fixture generation and configurable playing conditions will be added in the next CricketHub build milestone.</p>
      </div>
    </div>
  );
}
