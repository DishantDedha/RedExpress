import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  AppButton,
  AppSwitch,
  AppText,
  Card,
  LiveMessage,
  Screen,
  ScreenHeader,
  useAnnounce,
} from '../../components';
import { listNotifications, markNotificationRead, timeAgo } from '../../services/notifications';
import { routeForNotification } from '../../services/push';
import { colors, spacing } from '../../theme';

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
    setUnreadOnly(next);
    load({ filter: next, announce: true });
  }

  return (
    <Screen>
      <ScreenHeader
        title="Your alerts"
        subtitle={
          meta
            ? meta.unreadCount
              ? `${meta.unreadCount} unread.`
              : 'Nothing unread.'
            : 'Requests you have been alerted about.'
        }
        voicePurpose="Blood requests you have been alerted about. Open one to answer it."
        voiceAction="Open an alert"
      />

      <Card>
        <AppSwitch
          label="Show only unread"
          value={unreadOnly}
          onValueChange={toggleFilter}
          onText="Showing unread alerts only."
          offText="Showing all alerts."
          disabled={loading}
        />
      </Card>

      {loading && items === null ? <LiveMessage message="Loading your alerts…" tone="progress" /> : null}
      <LiveMessage message={error} tone="error" />

      {items?.length === 0 ? (
        <Card>
          <AppText variant="body" color={colors.textMuted}>
            {unreadOnly
              ? 'No unread alerts. Turn off "Show only unread" to see earlier ones.'
              : 'No alerts yet. When a patient near you needs your blood group, it will appear here.'}
          </AppText>
        </Card>
      ) : null}

      {items?.map((item) => (
        <Card
          key={item.id}
          onPress={() => open(item)}
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
          style={styles.row}
        >
          {!item.isRead ? (
            <AppText variant="caption" color={colors.primaryOnTint} style={styles.unread}>
              Unread
            </AppText>
          ) : null}

          <AppText variant="bodyStrong">{item.title}</AppText>
          <AppText variant="body" color={colors.text} style={styles.body}>
            {item.body}
          </AppText>
          <AppText variant="caption" color={colors.textMuted} style={styles.time}>
            {timeAgo(item.createdAt)}
          </AppText>
        </Card>
      ))}

      {meta?.hasMore ? (
        <AppText variant="caption" color={colors.textMuted} style={styles.more}>
          Showing the {items.length} most recent of {meta.total} alerts.
        </AppText>
      ) : null}

      <View style={styles.refresh}>
        <AppButton
          title="Refresh"
          variant="secondary"
          loading={loading && items !== null}
          loadingLabel="Refreshing your alerts"
          onPress={() => load({ announce: true })}
          accessibilityHint="Checks for new alerts"
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
  row: { marginBottom: spacing.md },
  unread: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryTint,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  body: { marginTop: spacing.xs },
  time: { marginTop: spacing.sm },
  more: { marginBottom: spacing.lg },
  refresh: { marginTop: spacing.sm },
});
