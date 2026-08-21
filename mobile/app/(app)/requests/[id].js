import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  AppButton,
  AppText,
  Card,
  DonorCard,
  LiveMessage,
  Screen,
  ScreenHeader,
  useAnnounce,
} from '../../../components';
import { bloodGroupLabel } from '../../../data/bloodGroups';
import { useFocusMover } from '../../../hooks/useAccessibilityFocus';
import { getStoredUser } from '../../../services/auth';
import { markNotificationRead } from '../../../services/notifications';
import { getMe } from '../../../services/profile';
import {
  distancePhrase,
  expiryPhrase,
  getRequest,
  listMatches,
  respondToMatch,
  updateRequestStatus,
  urgencyLabel,
} from '../../../services/requests';
import { hapticError, hapticSuccess } from '../../../services/feedback';
import { callNumber } from '../../../utils/call';
import { formatPhoneForDisplay, formatPhoneForSpeech } from '../../../utils/phone';
import { colors, spacing } from '../../../theme';

/**
 * One blood request — and the screen a push notification opens.
 *
 * It serves two people with opposite needs, decided by the backend rather than guessed at
 * here:
 *
 *   the donor      arrives from a notification. `canRespond` is true, and the screen is
 *                  two large buttons: I can donate / I cannot. The hospital's number is
 *                  withheld until they accept — contact details are earned by saying yes,
 *                  not handed to everyone who was pinged.
 *
 *   the requester  arrives after posting. `canUpdateStatus` is true, and the screen is the
 *                  list of donors being notified, with a Call button on each, plus the way
 *                  to close the request once they have what they need.
 *
 * ## The whole request is spoken on arrival
 *
 * A donor reaching this screen has just been woken by their phone. What they need is the
 * blood group, the hospital, the distance and the urgency — in that order, as one sentence,
 * without swiping through six separate nodes to assemble it. So the details are announced on
 * open and the same sentence is the accessible label of the summary card, which means the
 * information is available again on demand rather than only once.
 */
export default function RequestDetailScreen() {
  const { id, notice, notificationId } = useLocalSearchParams();
  const say = useAnnounce();
  const moveFocus = useFocusMover();
  const actionsRef = useRef(null);

  const [data, setData] = useState(null);
  const [matches, setMatches] = useState(null);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [status, setStatus] = useState(null); // { message, tone }
  const [busy, setBusy] = useState(null); // 'ACCEPTED' | 'DECLINED' | 'CLOSING'
  const announced = useRef(false);

  // Who I am, for `POST .../matches/:donorId/respond`. The cached copy avoids a round-trip
  // on a screen a donor opens from a notification in a hurry; `/me` is the fallback for a
  // session written by an older build that did not cache the id.
  useEffect(() => {
    let active = true;

    getStoredUser().then((user) => {
      if (!active) return;
      if (user?.id) return setMe(user);
      getMe()
        .then((result) => active && setMe(result.user))
        .catch(() => {});
    });

    return () => {
      active = false;
    };
  }, []);

  // Tapping a notification is reading it. The id rides along in the push payload precisely
  // so this costs no extra round-trip to find, and failing is not worth telling anyone
  // about — an unread badge that is one too high is a cosmetic problem.
  useEffect(() => {
    if (notificationId) markNotificationRead(String(notificationId)).catch(() => {});
  }, [notificationId]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const result = await getRequest(String(id));
      setData(result);

      // Only the requester and staff may list who was notified; a matched donor gets a 403,
      // which is correct and must not surface as an error on their screen.
      if (result.canUpdateStatus) {
        try {
          const matchResult = await listMatches(String(id));
          setMatches(matchResult.matches);
        } catch {
          setMatches([]);
        }
      }
    } catch (error) {
      setLoadError(
        error.code === 'FORBIDDEN'
          ? 'This request was not sent to you, so you cannot see its details.'
          : error.message,
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const request = data?.request;

  // Announce once, after the first successful load. Guarded with a ref rather than left to
  // the effect's dependencies: a refresh after accepting must not re-read the whole request
  // over the confirmation the donor is waiting to hear.
  useEffect(() => {
    if (!request || announced.current) return;
    announced.current = true;

    say([notice, spokenSummary(request), data.canRespond ? 'Can you donate?' : null].filter(Boolean).join(' '));

    // The reader goes to the buttons rather than the heading: this screen exists to be
    // answered, and the answer is at the bottom.
    if (data.canRespond) moveFocus(actionsRef, 900);
  }, [request, data, notice, say, moveFocus]);

  async function respond(response) {
    if (busy || !me?.id) return;

    setBusy(response);
    setStatus({
      message: response === 'ACCEPTED' ? 'Telling the hospital you can help…' : 'Sending your answer…',
      tone: 'progress',
    });

    try {
      const result = await respondToMatch({ requestId: String(id), donorUserId: me.id, response });

      // The response carries the request back with contact details unlocked on an accept, so
      // the screen is refreshed from it rather than from a second fetch.
      setData((current) => ({
        ...current,
        request: { ...result.request, myMatch: { ...current.request.myMatch, ...result.match } },
        canRespond: true, // an answer can be changed; circumstances change
      }));

      hapticSuccess();
      setStatus({ message: result.message, tone: 'success' });
      say(result.message);
    } catch (error) {
      hapticError();
      setStatus({ message: error.message, tone: 'error' });
      say(`Your answer was not saved. ${error.message}`);
      // A closed or expired request cannot be answered. Reloading replaces the buttons with
      // the real state instead of leaving a control that will keep failing.
      if (error.code === 'REQUEST_CLOSED') load();
    } finally {
      setBusy(null);
    }
  }

  async function close(nextStatus) {
    if (busy) return;

    setBusy('CLOSING');
    setStatus({ message: 'Closing this request…', tone: 'progress' });

    try {
      const result = await updateRequestStatus(String(id), nextStatus);
      setData((current) => ({ ...current, request: { ...current.request, ...result.request } }));
      hapticSuccess();

      const message =
        nextStatus === 'FULFILLED'
          ? 'Request marked as fulfilled. Donors will not be alerted about it again.'
          : 'Request cancelled. Donors will not be alerted about it again.';
      setStatus({ message, tone: 'success' });
      say(message);
    } catch (error) {
      hapticError();
      setStatus({ message: error.message, tone: 'error' });
      say(`The request was not closed. ${error.message}`);
    } finally {
      setBusy(null);
    }
  }

  // --- Render ---------------------------------------------------------------

  if (loading) {
    return (
      <Screen hero={<ScreenHeader title="Blood request" subtitle="Loading the details." tone="brand" />}>
        <LiveMessage message="Loading the request…" tone="progress" />
      </Screen>
    );
  }

  if (loadError) {
    return (
      <Screen hero={<ScreenHeader title="Blood request" tone="brand" />}>
        <LiveMessage message={loadError} tone="error" />
        <AppButton
          title="Try again"
          variant="secondary"
          onPress={load}
          style={styles.retry}
          accessibilityHint="Loads this request again"
        />
      </Screen>
    );
  }

  const myResponse = request.myMatch?.response;
  const answered = myResponse === 'ACCEPTED' || myResponse === 'DECLINED';
  const open = request.status === 'OPEN';

  return (
    <Screen
      hero={
        <ScreenHeader
          title={`${bloodGroupLabel(request.bloodGroup)} needed`}
          subtitle={request.hospitalName}
          tone="brand"
          // The full details are announced separately on arrival (see `spokenSummary`), so
          // this says only what the screen is *for* — otherwise a donor under voice guidance
          // hears the request twice, once in summary and once in full.
          voicePurpose={
            data.canRespond
              ? 'A patient near you needs blood. Answer whether you can donate.'
              : 'The details of this blood request, and who is being alerted.'
          }
          voiceAction={data.canRespond ? 'Yes, I can donate' : null}
        />
      }
    >
      <LiveMessage message={status?.message} tone={status?.tone ?? 'info'} />

      {/* The whole request as one focus stop, in the order it matters. */}
      <Card>
        <View accessible accessibilityLabel={spokenSummary(request)}>
          <Fact label="Blood group" value={bloodGroupLabel(request.bloodGroup)} />
          <Fact label="How urgent" value={urgencyLabel(request.urgency)} />
          <Fact label="Units needed" value={`${request.unitsNeeded}`} />
          <Fact label="Hospital" value={request.hospitalName} />
          <Fact
            label="Where"
            value={[request.city, request.district, request.state].filter(Boolean).join(', ') || 'Not given'}
          />
          {request.myMatch ? (
            <Fact
              label="Distance from you"
              value={capitalise(distancePhrase(request.myMatch.distanceKm) ?? 'not measured, you were matched by district')}
            />
          ) : null}
          <Fact label="Status" value={statusText(request)} />
          {request.note ? <Fact label="Note" value={request.note} /> : null}
        </View>
      </Card>

      {/* --- The donor's answer -------------------------------------------- */}

      {data.canRespond || answered ? (
        <Card>
          {/* The heading carries the ref rather than the button row: moving the reader to a
              heading gives it something to *say* on arrival, where landing silently on a
              container would tell the donor nothing about why focus jumped. */}
          <AppText
            ref={actionsRef}
            variant="subheading"
            accessibilityRole="header"
            accessible
            style={styles.answerHeading}
          >
            {answered ? 'Your answer' : 'Can you donate?'}
          </AppText>

          {answered ? (
            <AppText variant="body" style={styles.answer}>
              {myResponse === 'ACCEPTED'
                ? 'You said you can donate. The hospital has been told and can call you.'
                : 'You said you cannot donate for this request. Thank you for answering.'}
            </AppText>
          ) : (
            <AppText variant="body" style={styles.answer}>
              Answering either way helps — a clear no lets our team move on to the next donor.
            </AppText>
          )}

          <View style={styles.actions}>
            {open ? (
              <>
                <AppButton
                  title={myResponse === 'ACCEPTED' ? 'I can still donate' : 'Yes, I can donate'}
                  size="large"
                  loading={busy === 'ACCEPTED'}
                  loadingLabel="Sending your answer"
                  disabled={Boolean(busy)}
                  onPress={() => respond('ACCEPTED')}
                  accessibilityHint="Tells the hospital you can help and shows you their contact number"
                  style={styles.action}
                />
                <AppButton
                  title={myResponse === 'DECLINED' ? 'I still cannot donate' : 'No, I cannot donate'}
                  variant="secondary"
                  size="large"
                  loading={busy === 'DECLINED'}
                  loadingLabel="Sending your answer"
                  disabled={Boolean(busy)}
                  onPress={() => respond('DECLINED')}
                  accessibilityHint="Tells our team you cannot help with this request"
                />
              </>
            ) : (
              <AppText variant="body" color={colors.textMuted}>
                This request is {statusText(request).toLowerCase()}, so it can no longer be
                answered. Thank you for opening it.
              </AppText>
            )}
          </View>
        </Card>
      ) : null}

      {/* --- Contact, once it is unlocked ---------------------------------- */}

      {request.contactPhone ? (
        <Card title="Who to call">
          <AppText variant="body" style={styles.answer}>
            {formatPhoneForDisplay(request.contactPhone)}
          </AppText>
          <AppButton
            title="Call the hospital contact"
            onPress={() => callNumber(request.contactPhone, { name: request.hospitalName })}
            accessibilityLabel={`Call the hospital contact, ${formatPhoneForSpeech(request.contactPhone)}`}
            accessibilityHint="Opens your phone's dialler with this number"
          />
        </Card>
      ) : null}

      {/* --- The requester's worklist -------------------------------------- */}

      {data.canUpdateStatus ? (
        <>
          <AppText variant="heading" accessibilityRole="header" style={styles.sectionHeading}>
            {matches === null
              ? 'Donors being alerted'
              : `${matches.length} ${matches.length === 1 ? 'donor' : 'donors'} alerted`}
          </AppText>

          <AppText variant="caption" color={colors.textMuted} style={styles.sectionNote}>
            {matches?.length
              ? 'Nearest first. You do not have to wait for a reply — call them.'
              : 'No donors matched yet. Our team keeps looking and will call people directly.'}
          </AppText>

          {matches?.map((match) =>
            match.donor ? (
              <DonorCard
                key={match.id}
                donor={{ ...match.donor, distanceKm: match.distanceKm }}
              />
            ) : null,
          )}

          {open ? (
            <Card title="When you are done">
              <AppText variant="body" style={styles.answer}>
                Closing the request stops any further alerts about it.
              </AppText>
              <AppButton
                title="Mark as fulfilled"
                loading={busy === 'CLOSING'}
                loadingLabel="Closing the request"
                disabled={Boolean(busy)}
                onPress={() => close('FULFILLED')}
                accessibilityHint="Closes the request because the blood was found"
                style={styles.action}
              />
              <AppButton
                title="Cancel this request"
                variant="secondary"
                disabled={Boolean(busy)}
                onPress={() => close('CANCELLED')}
                accessibilityHint="Closes the request because it is no longer needed"
              />
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

/**
 * The request as one spoken paragraph, front-loaded.
 *
 * Deliberately close to the wording of the push notification the donor just heard
 * (`backend/src/services/pushMessages.js`): "Urgent" not "URGENT", "O negative" not "O-",
 * "about 3 kilometres away" not "3.2 km". Hearing one phrasing in the tray and a different
 * one on the screen makes a listener wonder whether they opened the right thing.
 */
function spokenSummary(request) {
  const urgency = request.urgency === 'NORMAL' ? null : urgencyLabel(request.urgency);
  const distance = distancePhrase(request.myMatch?.distanceKm);
  const place = [request.hospitalName, request.city || request.district].filter(Boolean).join(', ');

  return [
    urgency ? `${urgency}.` : null,
    `${bloodGroupLabel(request.bloodGroup)} blood needed.`,
    place ? `${place}${distance ? `, ${distance}` : ''}.` : null,
    `${request.unitsNeeded} ${request.unitsNeeded === 1 ? 'unit' : 'units'} needed.`,
    request.status === 'OPEN' ? expiryPhrase(request.expiresAt) : `This request is ${statusText(request).toLowerCase()}.`,
    request.note ? `Note. ${request.note}` : null,
  ]
    .filter(Boolean)
    .join(' ');
}

/** The status as a word, never as a colour. */
function statusText(request) {
  switch (request.status) {
    case 'OPEN':
      return 'Open';
    case 'FULFILLED':
      return 'Fulfilled';
    case 'CANCELLED':
      return 'Cancelled';
    case 'EXPIRED':
      return 'Expired';
    default:
      return request.status;
  }
}

const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1);

function Fact({ label, value }) {
  return (
    <View style={styles.fact}>
      <AppText variant="caption" color={colors.textMuted}>
        {label}
      </AppText>
      <AppText variant="body" style={styles.factValue}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  retry: { marginTop: spacing.lg },
  fact: { marginBottom: spacing.md },
  factValue: { marginTop: spacing.xs },
  answerHeading: { marginBottom: spacing.sm },
  answer: { marginBottom: spacing.lg },
  actions: { marginTop: spacing.sm },
  action: { marginBottom: spacing.md },
  sectionHeading: { marginTop: spacing.sm, marginBottom: spacing.xs },
  sectionNote: { marginBottom: spacing.lg },
});
