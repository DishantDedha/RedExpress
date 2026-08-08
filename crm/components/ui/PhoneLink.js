/**
 * Click-to-call.
 *
 * A `tel:` link, so a staff member with a softphone dials by clicking and everyone else can
 * still read and copy the number.
 *
 * The accessible name spaces the digits out. Screen readers otherwise read +919876500001 as
 * "plus nine hundred and nineteen billion…", which is unusable for someone transcribing a
 * number onto a handset. Spaced digits are read one at a time.
 */
export default function PhoneLink({ phone, name, className = '' }) {
  if (!phone) {
    return <span className={`text-ink-muted ${className}`}>No phone number</span>;
  }

  const spoken = String(phone).replace(/(\d)/g, '$1 ').trim();

  return (
    <a
      href={`tel:${phone}`}
      aria-label={name ? `Call ${name} on ${spoken}` : `Call ${spoken}`}
      className={`inline-flex min-h-11 items-center gap-1.5 font-medium text-brand underline underline-offset-4 hover:text-brand-pressed ${className}`}
    >
      <span aria-hidden="true">☎</span>
      <span className="tabular-nums">{phone}</span>
    </a>
  );
}
