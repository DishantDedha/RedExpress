import { formatArea, formatCoordinates } from '@/lib/format';

/**
 * Where a person or a request is.
 *
 * Shows the administrative area, then the raw coordinates, then an *opt-in* link to a map.
 *
 * Deliberately not an embedded map iframe or tile layer. Loading one would send a donor's home
 * coordinates to a third-party tile server on every page view, for every donor a staff member
 * happens to open — a quiet, continuous leak of exactly the data this dashboard exists to
 * protect. A link means the coordinates leave Red Express only when someone decides they need
 * a map, and the link says where it goes.
 *
 * The coordinates themselves are printed because they are what staff read out to a driver, and
 * they are the only location a donor who skipped the address fields has at all.
 */
export default function LocationPanel({ latitude, longitude, city, district, state, address, pincode, heading }) {
  const hasCoordinates = latitude !== null && latitude !== undefined && longitude !== null && longitude !== undefined;

  return (
    <div className="space-y-3 text-sm">
      {heading ? <h3 className="text-sm font-semibold text-ink">{heading}</h3> : null}

      <p className="text-ink">{formatArea(city, district, state)}</p>

      {address ? <p className="text-ink-muted">{address}</p> : null}
      {pincode ? <p className="text-ink-muted">PIN code {pincode}</p> : null}

      <p className="text-ink-muted">
        <span className="font-medium text-ink">Coordinates: </span>
        <span className="tabular-nums">{formatCoordinates(latitude, longitude)}</span>
      </p>

      {hasCoordinates ? (
        <a
          href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=15/${latitude}/${longitude}`}
          target="_blank"
          rel="noopener noreferrer"
          // "Opens in a new tab" is part of the name, not a tooltip: an unexpected new tab is
          // disorienting for a screen-reader user and worse for a screen-magnifier user.
          className="inline-flex min-h-11 items-center gap-1.5 font-medium text-brand underline underline-offset-4 hover:text-brand-pressed"
        >
          <span aria-hidden="true">📍</span>
          View on OpenStreetMap
          <span className="sr-only-focusable absolute">(opens in a new tab)</span>
        </a>
      ) : null}
    </div>
  );
}
