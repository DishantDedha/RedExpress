import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  AppButton,
  AppText,
  ChipRail,
  LiveMessage,
  RowBlock,
  Screen,
  ScreenHeader,
  useAnnounce,
} from '../../../components';
import { listNotifications, markNotificationRead, timeAgo } from '../../../services/notifications';
import { routeForNotification } from '../../../services/push';
import { colors, spacing } from '../../../theme';

/**
 * The in-app inbox.
 *
 * A push notification is best-effort: it can be swiped away by accident, arrive while the
 * phone is off, or never be delivered at all. Every one the backend sends also writes a
 * durable row, and this is where those rows are read — so "someone nearby needs your blood
 * group" is never lost to a dismissed banner.
 *
 * ## Unread is a word before it is a colour
 *
 * The usual design is a blue dot and a bolder font. Neither reaches a blind user and the
 * dot alone fails WCAG 1.4.1 for everyone else, so each unread row's accessible name begins
 * with "Unread." and carries a visible "Unread" label as well. Opening one marks it read and
 * announces the new count, because a badge that changes silently is not feedback.
 *
 * ## Reloaded on focus
 *
 * `useFocusEffect`, not `useEffect`: coming back from a request that was opened from here
 * must not leave the row still showing as unread.
 *
 * ## The layout
 *
 * A list of full-bleed `RowBlock`s on a neutral page, which is how GMP draws every list it has.
 * These used to be inset, rounded, bordered and shadowed cards — eight down a screen is eight
 * floating objects with sixteen visible edges, and the list read as clutter however the colours
 * were set. Now the only separator is the 8px of page showing between two blocks.
 *
 * Each row's state is a tinted strip across the top of its block rather than a chip inside it,
 * so it is the first thing read and it is in the same place on every row, which is what lets the
 * eye run down the list instead of hunting for a badge.
 *
 * The filter was a full-width switch with two sentences of state copy under it — about 110px to
 * say "unread only, or everything". It is two pills in a `ChipRail` now, which is the same
 * choice in 56px and reports itself as a tab list, so a reader says "Unread, tab, 2 of 2,
 * selected" rather than "Show only unread, switch, on".
 */
export default function NotificationsScreen() {
  const router = useRouter();
  const say = useAnnounce();

  const [items, setItems] = useState(null);
  const [meta, setMeta] = useState(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(
    async ({ filter, announce = false } = {}) => {
      setLoading(true);
      setError(null);

      try {
        const result = await listNotifications({ unreadOnly: filter ?? unreadOnly });
        setItems(result.results);
        setMeta(result);
        if (announce) say(summarise(result, filter ?? unreadOnly));
      } catch (err) {
        // A 401 has already been handled by apiClient — it wiped the session and the root
        // layout is routing to sign-in. Anything else is worth showing.
        if (err.status !== 401) {
          setError(err.message);
          say(`Could not load your alerts. ${err.message}`);
        }
      } finally {
        setLoading(false);
      }
    },
    [unreadOnly, say],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function open(item) {
    const route = routeForNotification(item.data);

    // Marked read before navigating, and not awaited: the row is being opened, and making
    // the user wait on a write to see the request they were alerted about would be the
    // wrong trade in an emergency.
    if (!item.isRead) {
      markNotificationRead(item.id)
        .then((result) => {
          setItems((current) =>
            current.map((row) => (row.id === item.id ? { ...row, isRead: true } : row)),
          );
          setMeta((current) => (current ? { ...current, unreadCount: result.unreadCount } : current));
        })
        .catch(() => {});
    }

    if (route) {
      router.push(route);
    } else {
      // An alert with nothing to open — or a payload from a newer backend this build does
      // not understand. Saying so beats a tap that appears to do nothing.
      say('This alert has no request to open.');
    }
  }

  function toggleFilter(next) {
    // The rail reports a tap on the pill that is already selected; reloading the same list and
    // announcing the same count would be a change the user did not ask for.
    if (next === unreadOnly) return;
    setUnreadOnly(next);
    load({ filter: next, announce: true });
  }

  return (
    <Screen
      page="muted"
      padded={false}
      bar={
        <ScreenHeader
          layout="bar"
          title="Your alerts"
          back="/home"
          voicePurpose="Blood requests you have been alerted about. Open one to answer it."
          voiceAction="Open an alert"
        />
      }
    >
      <ChipRail
        accessibilityLabel="Filter your alerts"
        value={unreadOnly}
        onChange={toggleFilter}
        items={[
          { value: false, label: 'All', accessibilityLabel: 'All alerts' },
          {
            value: true,
            label: meta?.unreadCount ? `Unread (${meta.unreadCount})` : 'Unread',
            accessibilityLabel: meta?.unreadCount
              ? `Unread alerts, ${meta.unreadCount}`
              : 'Unread alerts',
          },
        ]}
      />

      {/* The blocks below are full-bleed, so anything that is not one puts the gutter back. */}
      <View style={styles.gutter}>
        {loading && items === null ? (
          <LiveMessage message="Loading your alerts…" tone="progress" />
        ) : null}
        <LiveMessage message={error} tone="error" />
      </View>

      {items?.length === 0 ? (
        <RowBlock>
          <AppText variant="body" color={colors.textMuted}>
            {unreadOnly
              ? 'No unread alerts. Tap "All" to see the earlier ones.'
              : 'No alerts yet. When a patient near you needs your blood group, it will appear here.'}
          </AppText>
        </RowBlock>
      ) : null}

      {items?.map((item) => (
        <RowBlock
          key={item.id}
          onPress={() => open(item)}
          // The strip carries the state and the time. Both are decoration: the row's own label
          // below opens with the state and closes with the time, so a reachable strip would say
          // each of them twice.
          status={
            item.isRead
              ? { label: 'Read', tone: 'neutral', icon: 'check' }
              : { label: 'Unread', tone: 'brand', icon: 'bell' }
          }
          statusMeta={timeAgo(item.createdAt)}
          // One focus stop per alert, read as a sentence: state, then what happened, then
          // when. Left ungrouped this is four swipes per row and the timestamp ends up
          // detached from the alert it belongs to.
          accessibilityLabel={[
            item.isRead ? null : 'Unread.',
            `${item.title}.`,
            item.body,
            timeAgo(item.createdAt),
          ]
            .filter(Boolean)
            .join(' ')}
          accessibilityHint="Opens the blood request"
        >
          <AppText variant="label">{item.title}</AppText>
          <AppText variant="caption" color={colors.textMuted} style={styles.body}>
            {item.body}
          </AppText>
        </RowBlock>
      ))}

      <View style={styles.gutter}>
        {meta?.hasMore ? (
          <AppText variant="footnote" color={colors.textMuted} style={styles.more}>
            Showing the {items.length} most recent of {meta.total} alerts.
          </AppText>
        ) : null}

        <AppButton
          title="Refresh"
          variant="neutral"
          size="compact"
          loading={loading && items !== null}
          loadingLabel="Refreshing your alerts"
          onPress={() => load({ announce: true })}
          accessibilityHint="Checks for new alerts"
          style={styles.refresh}
        />
      </View>
    </Screen>
  );
}

/** A sentence for the live region — a list that silently changes length says nothing. */
function summarise(result, unreadOnly) {
  if (!result.total) return unreadOnly ? 'No unread alerts.' : 'No alerts yet.';

  const noun = result.total === 1 ? 'alert' : 'alerts';
  return unreadOnly
    ? `${result.total} unread ${noun}.`
    : `${result.total} ${noun}, ${result.unreadCount} unread.`;
}

const styles = StyleSheet.create({
  /** Puts the page's side padding back for content that is not a full-bleed block. */
  gutter: { paddingHorizontal: spacing.lg },
  body: { marginTop: 2 },
  more: { marginTop: spacing.md, marginBottom: spacing.sm },
  refresh: { marginTop: spacing.md },
});
