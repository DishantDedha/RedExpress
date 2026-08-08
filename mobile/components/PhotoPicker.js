import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { announce } from './LiveMessage';
import { hapticError, hapticSuccess } from '../services/feedback';
import { colors, spacing, radius, a11y } from '../theme';

/**
 * The profile-photo control.
 *
 * ## What a blind user gets out of it
 *
 * Nothing, if it is built as the mockup draws it: a dashed box that fills with a thumbnail.
 * The thumbnail is the entire feedback, and it is feedback in a channel they do not have.
 *
 * So every outcome is stated in words and announced: "Photo selected", "No photo chosen",
 * "That photo is too large", "Photo removed". The chosen file is described by name and size
 * rather than shown only as a picture, and the preview image is hidden from the reader —
 * it is a duplicate of text that is already there, and "image" announced alone is noise.
 *
 * Uploading a photo is **optional**, and the control says so. A donor who cannot review what
 * their camera captured should not be blocked from registering over it.
 *
 * ## Types and size
 *
 * The backend accepts JPG, PNG and PDF at up to 2 MB (`backend/src/middleware/upload.js`).
 * This control offers images only — a profile photo is a photo, and pulling in a document
 * picker to support a PDF nobody wants to send would be dead weight. The copy therefore says
 * "JPG or PNG", which is what the app can actually produce, rather than repeating the
 * mockup's "JPG, PNG, PDF" and being wrong.
 *
 * Images are re-encoded at `quality: 0.7` and squared, which brings a modern phone camera's
 * 4 MB frame comfortably under the limit. The size is still checked when the platform
 * reports it; when it does not, the server's own limit is the backstop and its error message
 * is shown on this control.
 */

const MAX_BYTES = 2 * 1024 * 1024;

function describeSize(bytes) {
  if (!bytes) return null;
  const mb = bytes / (1024 * 1024);
  return mb >= 0.1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export function PhotoPicker({
  label = 'Profile photo',
  /** `{ uri, name, mimeType, size }` or null. */
  value,
  onChange,
  error,
  disabled = false,
  tone = 'default',
  style,
}) {
  const brand = tone === 'brand';
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState(null);

  const message = error ?? localError;

  async function pick(source) {
    if (busy || disabled) return;

    setLocalError(null);
    setBusy(true);

    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        // Said out loud, because a denied permission otherwise produces nothing at all —
        // the sheet simply never opens and the user is left waiting.
        const text =
          source === 'camera'
            ? 'Camera permission was not granted. You can add a photo later from your profile.'
            : 'Photo permission was not granted. You can add a photo later from your profile.';
        setLocalError(text);
        hapticError();
        return;
      }

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.7,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.7,
            });

      if (result.canceled) {
        announce('No photo chosen.');
        return;
      }

      const asset = result.assets?.[0];
      if (!asset?.uri) {
        setLocalError('That photo could not be read. Try another one.');
        hapticError();
        return;
      }

      // `fileSize` is not reported on every platform; when it is missing the server's own
      // 2 MB limit catches it and its message lands on this control.
      if (asset.fileSize && asset.fileSize > MAX_BYTES) {
        const text = `That photo is ${describeSize(asset.fileSize)}. Choose one under 2 MB.`;
        setLocalError(text);
        hapticError();
        return;
      }

      const name = asset.fileName ?? `profile-photo.${asset.uri.split('.').pop() ?? 'jpg'}`;
      const mimeType = asset.mimeType ?? (name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');

      onChange?.({ uri: asset.uri, name, mimeType, size: asset.fileSize ?? null });

      hapticSuccess();
      const size = describeSize(asset.fileSize);
      announce(size ? `Photo selected. ${name}, ${size}.` : `Photo selected. ${name}.`);
    } catch {
      setLocalError('That photo could not be added. Please try again.');
      hapticError();
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    onChange?.(null);
    setLocalError(null);
    announce('Photo removed.');
  }

  return (
    <View style={style}>
      <AppText variant="label" color={brand ? colors.onPrimary : colors.text}>
        {label}
      </AppText>
      <AppText
        variant="caption"
        color={brand ? colors.onBrandMuted : colors.textMuted}
        style={styles.hint}
      >
        Optional. JPG or PNG, up to 2 MB.
      </AppText>

      <View style={styles.panel}>
        {value ? (
          <View style={styles.chosen}>
            <Image
              source={{ uri: value.uri }}
              style={styles.preview}
              // Decorative: the file name and size below say the same thing in words, and
              // the reader cannot describe the picture anyway.
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
            <View style={styles.chosenText}>
              {/* One stop, one sentence — not "Photo selected" then a filename then a size. */}
              <View
                accessible
                accessibilityLabel={`Photo selected. ${value.name}${
                  describeSize(value.size) ? `, ${describeSize(value.size)}` : ''
                }`}
              >
                <AppText variant="bodyStrong">Photo selected</AppText>
                <AppText variant="caption" color={colors.textMuted} numberOfLines={2}>
                  {value.name}
                  {describeSize(value.size) ? ` · ${describeSize(value.size)}` : ''}
                </AppText>
              </View>
            </View>
          </View>
        ) : (
          <AppText variant="body" color={colors.textMuted} style={styles.empty}>
            No photo chosen.
          </AppText>
        )}

        <View style={styles.actions}>
          <AppButton
            title={value ? 'Change photo' : 'Choose photo'}
            variant="secondary"
            size="small"
            fullWidth={false}
            loading={busy}
            loadingLabel="Opening your photos"
            disabled={disabled}
            onPress={() => pick('library')}
            accessibilityHint="Opens your photo library"
          />
          <AppButton
            title="Take photo"
            variant="secondary"
            size="small"
            fullWidth={false}
            disabled={disabled || busy}
            onPress={() => pick('camera')}
            accessibilityHint="Opens the camera"
          />
          {value ? (
            <AppButton
              title="Remove"
              variant="link"
              size="small"
              fullWidth={false}
              onPress={remove}
              accessibilityLabel="Remove photo"
              accessibilityHint="Removes the selected photo"
            />
          ) : null}
        </View>
      </View>

      <View accessibilityLiveRegion="polite">
        {message ? (
          <AppText
            variant="caption"
            color={colors.error}
            style={[styles.message, brand && styles.messageChip]}
          >
            Error: {message}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { marginTop: spacing.xs },
  panel: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    gap: spacing.md,
  },
  chosen: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  preview: {
    width: a11y.largeTouchTarget,
    height: a11y.largeTouchTarget,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
  },
  chosenText: { flex: 1 },
  empty: { paddingVertical: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  message: { marginTop: spacing.xs },
  messageChip: {
    backgroundColor: colors.errorTint,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    alignSelf: 'flex-start',
  },
});

export default PhotoPicker;
