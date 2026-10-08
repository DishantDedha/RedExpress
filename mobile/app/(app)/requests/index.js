import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  AppButton,
  AppText,
  LiveMessage,
  RowBlock,
  Screen,
  ScreenHeader,
  useAnnounce,
} from '../../../components';
import { bloodGroupLabel } from '../../../data/bloodGroups';
import { timeAgo } from '../../../services/notifications';
import {
  listRequests,
  requestStatusLabel,
  requestStatusTone,
  urgencyLabel,
} from '../../../services/requests';
import { colors, spacing } from '../../../theme';

/**
 * Every request you have posted, and what happened to it.
 *
 * Posting a request used to be a one-way door: the screen it lands on
 * (`requests/[id]`) is reachable again only by tapping the original push notification, so
 * closing that tray entry left no way back to check whether anyone had answered. This is
 * the way back — `listRequests` already supported `scope: 'mine'` on the backend, nothing
 * here needed a new endpoint.
 *
 * Deliberately not the same screen as the alerts tab. Alerts are things that happened *to*
 * you — a request nearby, a match — and already have a tab and a bell icon. This is a
 * worklist of things *you* started, closer in spirit to the "who was notified" list inside
 * a single request than to an inbox.
 */
export default function MyRequestsScreen() {
  const router = useRouter();
  const say = useAnnounce();

  const [items, setItems] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(
    async ({ announce = false } = {}) => {
      setLoading(true);
      setError(null);

      try {
        const result = await listRequests({ scope: 'mine' });
        setItems(result.results);
        setMeta(result);
        if (announce) say(summarise(result));
      } catch (err) {
        // A 401 has already been handled by apiClient — it wiped the session and the root
        // layout is routing to sign-in. Anything else is worth showing.
        if (err.status !== 401) {
          setError(err.message);
          say(`Could not load your requests. ${err.message}`);
        }
      } finally {
        setLoading(false);
      }
    },
    [say],
  );

  useFocusEffect(
    useCallback(() => {
      load();
      // Coming back from a request just closed, or one a donor just accepted, must not
      // leave this list showing the status it had before that happened.
    }, [load]),
  );

  return (
    <Screen
      page="muted"
      padded={false}
      bar={
        <ScreenHeader
          layout="bar"
          title="Your requests"
          back
          voicePurpose="Every blood request you have posted, and its current status."
        />
      }
    >
      {/* The blocks below are full-bleed, so anything that is not one puts the gutter back. */}
      <View style={styles.gutter}>
        {loading && items === null ? (
          <LiveMessage message="Loading your requests…" tone="progress" />
        ) : null}
        <LiveMessage message={error} tone="error" />
      </View>

      {items?.length === 0 ? (
        <RowBlock>
          <AppText variant="body" color={colors.textMuted}>
            You have not posted a blood request yet. When you do, it will appear here with
            who has been alerted and whether it is still open.
          </AppText>
        </RowBlock>
      ) : null}

      {items?.map((item) => (
        <RowBlock
          key={item.id}
          onPress={() =>
            router.push({ pathname: '/requests/[id]', params: { id: item.id } })
          }
          // The status moved out of the row and onto a strip across the top of the block, which
          // is where GMP puts it: a chip beside the title competed with the title for the first
          // thing read, and it sat at a different place on every row because the title it was
          // pushed off wraps differently each time.
          status={{
            label: requestStatusLabel(item.status),
            tone: requestStatusTone(item.status),
            icon: item.status === 'OPEN' ? 'drop' : item.status === 'FULFILLED' ? 'check' : 'list',
          }}
          statusMeta={timeAgo(item.createdAt)}
          accessibilityLabel={rowLabel(item)}
          accessibilityHint="Opens this request"
        >
          <AppText variant="label">
            {bloodGroupLabel(item.bloodGroup)} · {item.hospitalName}
          </AppText>

          <AppText variant="footnote" color={colors.textMuted} style={styles.rowMeta}>
            {[
              item.urgency && item.urgency !== 'NORMAL' ? urgencyLabel(item.urgency) : null,
              typeof item.matchCount === 'number'
                ? `${item.matchCount} ${item.matchCount === 1 ? 'donor' : 'donors'} alerted`
                : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'No donors alerted yet'}
          </AppText>
        </RowBlock>
      ))}

      <View style={styles.gutter}>
        {meta?.hasMore ? (
          <AppText variant="footnote" color={colors.textMuted} style={styles.more}>
            Showing the {items.length} most recent of {meta.total} requests.
          </AppText>
        ) : null}

        <AppButton
          title="Post a new request"
          icon="plus"
          onPress={() => router.push('/post-request')}
          accessibilityHint="Opens the form to post a new blood request"
          style={styles.newRequest}
        />
      </View>
    </Screen>
  );
}

/** A sentence for the live region and the header subtitle alike. */
function summarise(result) {
  if (!result.total) return 'You have not posted any requests yet.';

  const open = result.results?.filter((item) => item.status === 'OPEN').length ?? 0;
  const noun = result.total === 1 ? 'request' : 'requests';

  if (!open) return `${result.total} ${noun} posted, none currently open.`;
  return `${result.total} ${noun} posted, ${open} currently open.`;
}

/** One row read as a sentence: what, where, current state, when — the order it matters. */
function rowLabel(item) {
  return [
    `${bloodGroupLabel(item.bloodGroup)} for ${item.hospitalName}.`,
    `${requestStatusLabel(item.status)}.`,
    typeof item.matchCount === 'number'
      ? `${item.matchCount} ${item.matchCount === 1 ? 'donor' : 'donors'} alerted.`
      : null,
    `Posted ${timeAgo(item.createdAt)}.`,
  ]
    .filter(Boolean)
    .join(' ');
}

const styles = StyleSheet.create({
  /** Puts the page's side padding back for content that is not a full-bleed block. */
  gutter: { paddingHorizontal: spacing.lg },
  rowMeta: { marginTop: 2 },
  more: { marginTop: spacing.md, marginBottom: spacing.sm },
  newRequest: { marginTop: spacing.md },
});
