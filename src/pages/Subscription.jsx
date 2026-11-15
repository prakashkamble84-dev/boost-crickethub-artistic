import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import ApperIcon from '@/components/ApperIcon';

export const route = { path: '/subscription', layout: 'owner', access: 'authenticated' };
export const nav = { icon: 'CreditCard', label: 'Subscription', section: 'Account', order: 90 };

const included = [
  'Create and manage tournaments',
  'Register teams and players',
  'Generate fixtures and manage match results',
  'Record live scores and publish public scoreboards',
  'View tournament standings and player statistics',
];

export default function Subscription() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Account · Subscription</p>
            <h1 className="mt-2 font-heading text-3xl font-bold">Subscription</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              CricketHub is currently in pre-launch testing. Subscription billing has not been activated.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-sm font-semibold text-amber-700 dark:text-amber-300">
            <span className="size-2 rounded-full bg-amber-500" />
            Not activated
          </span>
        </div>
        <div className="mt-6 rounded-xl border border-border bg-muted/30 p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ApperIcon name="FlaskConical" size={20} />
            </span>
            <div>
              <h2 className="font-semibold">Testing access</h2>
              <p className="text-sm text-muted-foreground">No payment method or active paid plan is attached to this account.</p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            You can test the tournament workflow without making a payment. Stripe checkout, recurring charges,
            invoices and paid-plan enforcement are intentionally disabled until real-customer testing is ready.
            This page does not create a trial, charge a card or claim that a subscription is active.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-heading text-xl font-bold">Available during testing</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {included.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm">
              <ApperIcon name="CheckCircle2" size={17} className="mt-0.5 shrink-0 text-success" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild><Link to="/">Go to organizer dashboard</Link></Button>
          <Button asChild variant="outline"><Link to="/tournaments">Manage tournaments</Link></Button>
        </div>
      </section>
    </div>
  );
}
