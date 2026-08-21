/**
 * The accessible component kit.
 *
 * Screens import from here, not from the individual files, and not from `react-native`
 * directly. That is the whole strategy: accessibility is built into these six components
 * once, so every screen in Phases 8 through 11 inherits it instead of each one being
 * audited and patched separately.
 *
 * The second group below is the presentation layer added in the redesign — the gradient,
 * the icon set, and the tiles and chips the screens are now built from. They follow the same
 * rule as the originals: the accessibility decisions live in the component, so a screen that
 * uses one cannot get them wrong.
 *
 * If a screen needs a raw `Pressable`, `Text` or `TextInput`, that is a signal the kit is
 * missing something — add it here rather than working around it, or the guarantees stop
 * being guarantees.
 */
export { AppText } from './AppText';
export { AppButton } from './AppButton';
export { AppTextInput } from './AppTextInput';
export { AppSelect } from './AppSelect';
export { AppCheckbox } from './AppCheckbox';
export { AppSwitch } from './AppSwitch';
export { AppDateInput } from './AppDateInput';
export { OtpInput } from './OtpInput';
export { PhotoPicker } from './PhotoPicker';
export { LocationCapture } from './LocationCapture';
export { DictationButton } from './DictationButton';
export { ScreenHeader } from './ScreenHeader';
export { Card } from './Card';
export { DonorCard } from './DonorCard';
export { PushConsent } from './PushConsent';
export { Screen, brandHeaderOptions } from './Screen';
export { BrandMark } from './BrandMark';
export { InitiativeFooter } from './InitiativeFooter';
export { LiveMessage, announce, useAnnounce, clearAnnouncements } from './LiveMessage';

// --- Presentation ----------------------------------------------------------
export { Gradient } from './Gradient';
export { Icon, ICON_NAMES } from './Icon';
export { Chip } from './Chip';
export { ActionTile, ActionRow } from './ActionTile';
export { Avatar, initialsOf } from './Avatar';
export { SectionHeading } from './SectionHeading';
