import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

const FIELDS = ['Id', 'Name', 'status_c', 'format_c', 'location_c', 'start_date_c', 'end_date_c', 'overs_c', 'teams_count_c', 'is_public_c', 'description_c'];

function localDateInputValue() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
}

const emptyForm = {
  Name: '',
  status_c: 'Draft',
  format_c: 'League',
  location_c: '',
  start_date_c: localDateInputValue(),
  end_date_c: '',
  overs_c: 10,
  teams_count_c: 8,
  is_public_c: true,
  description_c: '',
};

export default function TournamentForm({ recordId = null, mode = 'create' }) {
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const { data: record, loading, error, run } = useFetch(() => {
    if (!recordId) return Promise.resolve(null);
    return sdk.table('tournaments_c').select(FIELDS).get(recordId).then((result) => {
      if (!result.success) throw new Error(result.message);
      return result.data;
    });
  }, [recordId]);

  useEffect(() => {
    if (record) {
      setForm({
        Name: record.Name ?? '',
        status_c: record.status_c ?? 'Draft',
        format_c: record.format_c ?? 'League',
        location_c: record.location_c ?? '',
        start_date_c: record.start_date_c ?? '',
        end_date_c: record.end_date_c ?? '',
        overs_c: record.overs_c ?? 10,
        teams_count_c: record.teams_count_c ?? 8,
        is_public_c: record.is_public_c ?? true,
        description_c: record.description_c ?? '',
      });
    }
  }, [record]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save(event) {
    event.preventDefault();
    if (!form.Name.trim() || !form.location_c.trim() || !form.start_date_c) {
      toast.error('Add a tournament name, location and start date.');
      return;
    }
    if (form.end_date_c && form.end_date_c < form.start_date_c) {
      toast.error('The end date cannot be before the start date.');
      return;
    }
    const overs = Number(form.overs_c);
    const teams = Number(form.teams_count_c);
    if (!Number.isInteger(overs) || overs < 1 || overs > 50) {
      toast.error('Overs per innings must be a whole number from 1 to 50.');
      return;
    }
    if (!Number.isInteger(teams) || teams < 2 || teams > 64) {
      toast.error('Expected teams must be a whole number from 2 to 64.');
      return;
    }
    setSaving(true);
    const payload = {
      Name: form.Name.trim(),
      status_c: form.status_c,
      format_c: form.format_c,
      location_c: form.location_c.trim(),
      start_date_c: form.start_date_c,
      end_date_c: form.end_date_c || null,
      overs_c: overs,
      teams_count_c: teams,
      is_public_c: Boolean(form.is_public_c),
      description_c: form.description_c.trim(),
    };
    try {
      const result = mode === 'edit'
        ? await sdk.table('tournaments_c').update({ Id: recordId, ...payload })
        : await sdk.table('tournaments_c').create(payload);
      if (!result.data?.length) {
        toast.error(result.messages?.[0] || result.message || 'Tournament could not be saved.');
        return;
      }
      const saved = result.data[0];
      toast.success(mode === 'edit' ? 'Tournament updated.' : 'Tournament created.');
      navigate(mode === 'edit' ? `/tournaments/${recordId}` : `/tournaments/${saved.Id}`);
    } catch (saveError) {
      toast.error(saveError.message || 'Tournament could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  if (loading && recordId) return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-64 w-full" /></div>;
  if (error) return <div className="rounded-xl border border-destructive/30 p-5"><p className="font-medium">Could not load this tournament.</p><p className="mt-1 text-sm text-muted-foreground">{error.message}</p><Button variant="outline" className="mt-3" onClick={run}>Try again</Button></div>;
  if (recordId && !record && !loading) return <div className="rounded-xl border border-border p-6">Tournament not found.</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" asChild><Link to={mode === 'edit' ? `/tournaments/${recordId}` : '/tournaments'}><ApperIcon name="ArrowLeft" size={16} /> Back to {mode === 'edit' ? 'Tournament' : 'Tournaments'}</Link></Button>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Tournament setup</p>
        <h1 className="mt-2 font-heading text-3xl font-semibold">{mode === 'edit' ? 'Edit tournament' : 'Create tournament'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Set the competition details now. You can configure its fixtures and teams in the next steps.</p>
      </div>
      <form onSubmit={save} className="space-y-6 rounded-xl border border-border bg-card p-5 md:p-7">
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="Name">Tournament name *</Label>
            <Input id="Name" value={form.Name} onChange={(event) => update('Name', event.target.value)} placeholder="e.g. Pune Monsoon Cup" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Location *</Label>
            <Input id="location" value={form.location_c} onChange={(event) => update('location_c', event.target.value)} placeholder="e.g. Pune, Maharashtra" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="format">Tournament format</Label>
            <select id="format" value={form.format_c} onChange={(event) => update('format_c', event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option>League</option><option>Knockout</option><option>Hybrid</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="start">Start date *</Label>
            <Input id="start" type="date" value={form.start_date_c} onChange={(event) => update('start_date_c', event.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end">End date</Label>
            <Input id="end" type="date" value={form.end_date_c} onChange={(event) => update('end_date_c', event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="overs">Overs per innings</Label>
            <Input id="overs" type="number" min="1" max="50" value={form.overs_c} onChange={(event) => update('overs_c', event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="teams">Expected teams</Label>
            <Input id="teams" type="number" min="2" max="64" value={form.teams_count_c} onChange={(event) => update('teams_count_c', event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Tournament status</Label>
            <select id="status" value={form.status_c} onChange={(event) => update('status_c', event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option>Draft</option><option>Upcoming</option><option>Live</option><option>Completed</option><option>Cancelled</option>
            </select>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
            <input id="public" type="checkbox" checked={form.is_public_c} onChange={(event) => update('is_public_c', event.target.checked)} className="size-4 accent-primary" />
            <Label htmlFor="public" className="cursor-pointer">Enable public scoreboard</Label>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={form.description_c} onChange={(event) => update('description_c', event.target.value)} placeholder="Add tournament notes, rules or organizer information..." rows={4} />
          </div>
        </section>
        <div className="flex flex-col-reverse justify-end gap-2 border-t border-border pt-5 sm:flex-row">
          <Button type="button" variant="outline" onClick={() => navigate(mode === 'edit' ? `/tournaments/${recordId}` : '/tournaments')}>Cancel</Button>
          <Button type="submit" disabled={saving} className="gap-2">{saving ? <><ApperIcon name="LoaderCircle" className="animate-spin" size={16} /> Saving…</> : <><ApperIcon name="Check" size={16} /> {mode === 'edit' ? 'Save changes' : 'Create tournament'}</>}</Button>
        </div>
      </form>
    </div>
  );
}
