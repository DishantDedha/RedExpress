/**
 * Contrast gate for the theme. `npm run verify:contrast`.
 *
 * Colour choices drift — a hex gets nudged to look better on someone's laptop and a caption
 * quietly drops to 3.9:1, which nobody notices because everyone testing can read it fine.
 * This script fails instead: it reads the real tokens out of theme/index.js and checks every
 * foreground/background pair the UI actually renders against WCAG 2.1.
 *
 *   text (1.4.3 AA)                4.5:1
 *   UI components (1.4.11 AA)      3:1    — input outlines, focus rings
 *   decorative                     1:1    — listed so a pair is never simply forgotten
 *
 * Note on the import: theme/index.js is ESM inside a package without `"type": "module"`, so
 * Node would otherwise parse it as CommonJS. It is loaded through a data: URL instead, which
 * works because the theme file has no imports of its own. If Phase 11 adds one, switch this
 * to reading the tokens some other way — a data: URL cannot resolve relative specifiers.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const themePath = path.join(here, '..', 'theme', 'index.js');

const source = await readFile(themePath, 'utf8');
const { colors, highContrast } = await import(
  `data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`
);

// --- WCAG 2.1 relative luminance ------------------------------------------

const channel = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function luminance(hex) {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => channel(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// --- The pairs the UI renders ---------------------------------------------

const TEXT = 4.5;
const UI = 3;
const DECORATIVE = 1;
/** WCAG 2.1 AAA for text. What the high-contrast preference is expected to reach — a mode
 *  that only just clears AA is not worth the switch. */
const AAA = 7;

/** [foreground token, background token, minimum ratio, where it appears] */
const pairs = [
  // Primary buttons
  ['onPrimary', 'primary', TEXT, 'AppButton primary — label on fill'],
  ['onPrimary', 'primaryPressed', TEXT, 'AppButton primary — label while pressed'],
  ['primary', 'card', TEXT, 'AppButton secondary/link — label on card'],
  ['primary', 'background', TEXT, 'AppButton link — label on screen background'],
  ['primaryOnTint', 'primaryTint', TEXT, 'Badge — text on red tint'],

  // The brand surface — the full-bleed red pre-sign-in screens (Phase 8).
  ['onPrimary', 'brand', TEXT, 'Headings and body copy on the brand background'],
  ['onBrandMuted', 'brand', TEXT, 'Muted supporting copy on the brand background'],
  ['primary', 'white', TEXT, 'AppButton brand — red label on the white fill'],
  ['primary', 'primaryTint', TEXT, 'AppButton brand — label while pressed'],
  ['onPrimary', 'brandPressed', TEXT, 'AppButton brandOutline — label while pressed'],
  ['text', 'white', TEXT, 'Digit inside a verification-code box'],
  ['onPrimary', 'brand', UI, 'White outline: brandOutline border, code-box border'],
  ['onBrandMuted', 'brand', UI, 'Resting border of an empty code box'],

  // The brand gradient (`colors.gradientBrand`). The band is drawn as stacked stops, so a
  // caption can land on any of them — each is checked, not just the average. red500 is the
  // lightest and therefore the binding one.
  ['onPrimary', 'red500', TEXT, 'White copy on the lightest gradient stop'],
  ['onPrimary', 'red900', TEXT, 'White copy on the darkest gradient stop'],
  ['onBrandMuted', 'red500', TEXT, 'Muted copy on the lightest gradient stop'],
  ['onBrandMuted', 'red900', TEXT, 'Muted copy on the darkest gradient stop'],
  ['onPrimary', 'red500', UI, 'White outline on the lightest gradient stop'],
  ['onBrandMuted', 'red500', UI, 'Muted outline on the lightest gradient stop'],

  // The blush surfaces — the tinted sections of the white-and-red scheme.
  ['text', 'blush', TEXT, 'Body copy on a blush section'],
  ['textMuted', 'blush', TEXT, 'Captions on a blush section'],
  ['primary', 'blush', TEXT, 'A red label on a blush section'],
  ['primaryOnTint', 'blush', TEXT, 'Chip text on a blush section'],
  ['text', 'blushStrong', TEXT, 'Body copy on a selected blush surface'],
  ['textMuted', 'blushStrong', TEXT, 'Captions on a selected blush surface'],
  ['primaryOnTint', 'blushStrong', TEXT, 'Chip text on a selected blush surface'],
  ['border', 'blush', UI, 'Input outline on a blush section'],
  ['focusRing', 'blush', UI, 'Focus ring on a blush section'],

  // Body copy
  ['text', 'card', TEXT, 'Body text on a card'],
  ['text', 'background', TEXT, 'Body text on the screen background'],
  ['textMuted', 'card', TEXT, 'Helper text / captions on a card'],
  ['textMuted', 'background', TEXT, 'Captions on the screen background'],
  ['textDisabled', 'card', TEXT, 'Disabled control label'],

  // Status. Both the solid text colour and the tinted-surface pairing.
  ['success', 'card', TEXT, 'Success message text'],
  ['success', 'successTint', TEXT, 'Success banner — text on tint'],
  ['white', 'success', TEXT, 'Success badge — text on fill'],
  ['error', 'card', TEXT, 'Field error / error message text'],
  ['error', 'errorTint', TEXT, 'Error banner — text on tint'],
  ['warning', 'card', TEXT, 'Warning text'],
  ['warning', 'warningTint', TEXT, 'Warning banner — text on tint'],
  ['info', 'card', TEXT, 'Info text'],
  ['info', 'infoTint', TEXT, 'Info banner — text on tint'],

  // Non-text UI. 1.4.11 applies to anything you have to *see* to operate the control.
  ['border', 'card', UI, 'AppTextInput / AppSelect outline on a card'],
  ['border', 'background', UI, 'Input outline on the screen background'],
  ['focusRing', 'card', UI, 'Focus ring on a card'],
  ['focusRing', 'background', UI, 'Focus ring on the screen background'],
  ['borderDisabled', 'card', UI, 'Disabled input outline'],
  ['borderDisabled', 'background', UI, 'Disabled input outline on the screen background'],
  ['error', 'card', UI, 'Invalid input outline'],
  ['error', 'background', UI, 'Invalid input outline on the screen background'],

  // Decorative — no minimum, listed so the set stays exhaustive.
  ['blushLine', 'blush', DECORATIVE, 'Hairline on a blush section (decorative)'],
  ['blush', 'card', DECORATIVE, 'Blush section against a white card (decorative)'],
  ['borderMuted', 'card', DECORATIVE, 'Hairline divider (decorative)'],
  ['background', 'card', DECORATIVE, 'Card lifted off the screen background (decorative)'],
];

/**
 * The high-contrast preference (Phase 11).
 *
 * Checked separately and to a higher bar, because a mode a user has deliberately switched on
 * to make things readable has to be measurably better than the default rather than merely
 * different. Every text substitution is held to AAA.
 *
 * Written as raw hex rather than token names: these come out of the `highContrast` map, whose
 * keys are the colours being *replaced*, so there is no token name to look up.
 */
const hcPairs = [
  [highContrast.text[colors.textMuted], colors.card, AAA, 'HC: muted text on a card'],
  [highContrast.text[colors.textMuted], colors.background, AAA, 'HC: muted text on the screen background'],
  [highContrast.text[colors.onBrandMuted], colors.brand, AAA, 'HC: muted copy on the brand background'],

  [colors.onPrimary, highContrast.primary, AAA, 'HC: AppButton primary — label on the darkened fill'],
  [highContrast.primary, colors.card, AAA, 'HC: AppButton secondary — label on a card'],
  [highContrast.primary, colors.background, AAA, 'HC: AppButton link — label on the screen background'],
  [colors.onPrimary, highContrast.primary, UI, 'HC: checked checkbox fill against its tick'],

  [colors.onPrimary, highContrast.gradient, AAA, 'HC: white copy on the flattened gradient band'],
  [colors.white, highContrast.gradient, UI, 'HC: white outline on the flattened gradient band'],

  [highContrast.border, colors.card, UI, 'HC: input and button outline on a card'],
  [highContrast.border, colors.background, UI, 'HC: input and button outline on the screen background'],
  [highContrast.borderMuted, colors.card, UI, 'HC: card edge and list divider'],
  [highContrast.borderMuted, colors.background, UI, 'HC: card edge against the screen background'],
];

// --- Run -------------------------------------------------------------------

const missing = [];
const failures = [];
const lines = [];

// Token names for the default palette; literal hex for the high-contrast substitutions.
const all = [
  ...pairs.map(([fg, bg, min, where]) => [colors[fg], colors[bg], min, where, fg, bg]),
  ...hcPairs.map(([fg, bg, min, where]) => [fg, bg, min, where, fg, bg]),
];

for (const [fg, bg, min, where, fgToken, bgToken] of all) {
  if (!fg || !bg) {
    missing.push(`${!fg ? fgToken : bgToken} (used by: ${where})`);
    continue;
  }

  const ratio = contrast(fg, bg);
  const ok = ratio >= min;
  if (!ok) failures.push({ fgToken, bgToken, ratio, min, where });

  lines.push(
    `${ok ? 'ok  ' : 'FAIL'}  ${ratio.toFixed(2).padStart(6)}:1  (min ${String(min).padEnd(3)})  ` +
      `${fgToken} on ${bgToken}  ${fg}/${bg}  — ${where}`,
  );
}

console.log(lines.join('\n'));
console.log(`\n${all.length} pairs checked (${pairs.length} default, ${hcPairs.length} high contrast).`);

if (missing.length) {
  console.error(`\nUnknown theme token(s) — was a colour renamed in theme/index.js?`);
  for (const token of missing) console.error(`  - ${token}`);
}

if (failures.length) {
  console.error(`\n${failures.length} pair(s) below the WCAG minimum:`);
  for (const f of failures) {
    console.error(
      `  - ${f.fgToken} on ${f.bgToken} is ${f.ratio.toFixed(2)}:1, needs ${f.min}:1 — ${f.where}`,
    );
  }
  console.error('\nDarken the foreground or lighten the background in theme/index.js.');
}

if (missing.length || failures.length) process.exit(1);

console.log('All pairs meet WCAG 2.1 AA.');
