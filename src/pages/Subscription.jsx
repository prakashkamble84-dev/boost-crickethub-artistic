import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import ApperIcon from '@/components/ApperIcon';

export const route = { path: '/subscription', layout: 'owner', access: 'authenticated' };
export const nav = { icon: 'CreditCard', label: 'Subscription', section: 'Account', order: 90 };

const ANNUAL_PRICE = 999;
const PLAN_DURATION = '12 months';

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
        <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">CricketHub Organizer Plan</p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-heading text-4xl font-extrabold">₹{ANNUAL_PRICE.toLocaleString('en-IN')}</span>
                <span className="text-sm text-muted-foreground">/ {PLAN_DURATION}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">One annual subscription per organizer account.</p>
            </div>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">Payments not enabled</span>
          </div>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">This is the published plan price. Online checkout, payment verification and automatic paid access are not active yet. Do not treat this display as a completed purchase.</p>
        </div>
        <div className="mt-6 rounded-xl border border-border bg-muted/30 p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ApperIcon name="Smartphone" size={20} />
            </span>
            <div>
              <h2 className="font-semibold">Pay by UPI</h2>
              <p className="text-sm text-muted-foreground">Manual UPI payment to the CricketHub organizer</p>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-border bg-card p-4">
            <p className="text-sm font-semibold">Scan this Kotak UPI QR code</p>
            <div className="mt-3 flex justify-center rounded-xl bg-white p-3">
              <img
                src="https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=upi%3A%2F%2Fpay%3Fpa%3D9970671306%40kotakbank%26pn%3DPRAKASH%2520GAJANAN%2520KAMBLE"
                alt="Kotak UPI payment QR code for Prakash Gajanan Kamble"
                className="h-64 w-64 max-w-full object-contain"
                loading="eager"
              />
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">Scan with any UPI app. Verify the payee name before paying.</p>
            <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">UPI ID</p>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <span className="break-all font-semibold">9970671306@kotakbank</span>
              <Button type="button" variant="outline" size="sm" onClick={() => navigator.clipboard?.writeText('9970671306@kotakbank')}>
                <ApperIcon name="Copy" size={14} /> Copy UPI ID
              </Button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">Pay exactly ₹999 for 12 months. Enter this UPI ID in your preferred UPI app.</p>
          </div>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Send ₹999 to the UPI ID above from your UPI app.</li>
            <li>Save the successful transaction reference number.</li>
            <li>Contact the CricketHub administrator with the reference number and payment proof.</li>
            <li>Your organizer subscription will be activated for 12 months only after the payment is verified in the recipient bank account.</li>
          </ol>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Payments are manually verified. A screenshot or submitted reference number does not itself confirm payment.
            Online card payments, net banking and automatic activation are not available.
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
