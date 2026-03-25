# New Styling Plan - Aligning WorkTape Desktop App with worktape.nl

**Issue:** #13
**Goal:** Update the WorkTape desktop application's visual design to align with the website (worktape.nl), creating a cohesive brand experience across product and marketing.

---

## 1. Typography

### Current State
- Single font: **Inter** (variable, sans-serif)
- Used for all text across the application
- Font feature settings: `cv01`, `cv02`, `cv03`, `cv04`

### Proposed Changes

**Add dual-font system matching the website:**
- **Headings:** Switch to **Lora** (serif) for page titles, section headings, and prominent display text. This gives the app the same warm, professional tone as the website.
- **Body / UI text:** Switch to **Plus Jakarta Sans** (sans-serif) for body copy, labels, buttons, sidebar items, form inputs, and all general UI text. This is a geometric sans-serif that feels more modern than Inter while matching the website.

**Implementation:**
- Download and add `Lora` (variable, weight 400-700) and `PlusJakartaSans` (variable, weight 200-800) `.woff2` font files to `src/assets/fonts/`.
- Update `src/styles/app.css`:
  - Add `@font-face` declarations for both fonts.
  - Replace `--font-sans` with Plus Jakarta Sans as the default.
  - Add a new `--font-serif` theme variable for Lora.
- Update the Catalyst `heading.tsx` component to apply the serif font (`font-serif` class) to headings by default.
- Remove the Inter font file and its `@font-face` declaration once migration is complete.

**Files affected:**
- `src/styles/app.css`
- `src/assets/fonts/` (add new font files, remove InterVariable.woff2)
- `src/components/catalyst/heading.tsx`
- `src/components/catalyst/text.tsx` (ensure body text uses the new sans font)

---

## 2. Color Palette

### Current State
- **Primary accents:** Amber (`amber-500`, `amber-600`) and Orange (`orange-500`, `orange-600`)
- **Neutrals:** Zinc grays (`zinc-400` through `zinc-950`)
- **Semantic colors:** Emerald for positive/streak, Red for errors
- Gradient usage: `from-amber-500 to-orange-500` for hero text

### Proposed Changes

**Shift from amber/orange to a more neutral, black-and-white dominant palette with subtle accent colors:**

The website uses a clean black-on-white aesthetic with minimal accent color, relying on structure and typography for hierarchy rather than bold color splashes.

- **Primary accent:** Replace amber/orange with a single, restrained accent color. Recommended: **Slate-900 / Black** for primary actions, with a subtle warm accent (e.g., `amber-600`) reserved only for key interactive elements (active states, focus rings, current-page indicators). This mirrors the website's approach of black CTAs with minimal color.
- **Neutrals:** Shift from `zinc-*` to `slate-*` across the board. Slate has a slightly cooler, more professional undertone that aligns with the website's aesthetic.
- **Gradient removal:** Replace the amber-to-orange gradient on the HomeView title with solid black (`text-slate-900` / `dark:text-white`). The website avoids gradients.
- **Card borders:** Replace colored top-border accents (`border-t-3 border-amber-500`) with a uniform, subtle approach: a thin `border border-slate-200 dark:border-slate-700` or a gentle left border in a single muted tone.
- **Keep semantic colors** (emerald for positive, red for errors) as these serve functional purposes.

**Implementation - define CSS custom properties for the accent palette in `app.css`:**

```css
@theme {
  --color-primary: var(--color-slate-900);
  --color-primary-light: var(--color-slate-700);
  --color-accent: var(--color-amber-600);
  --color-accent-light: var(--color-amber-100);
}
```

This makes future palette changes a single-point update.

**Files affected (color sweep):**
- `src/styles/app.css` (theme variables)
- `src/views/HomeView.tsx` (gradient, card borders, icon backgrounds)
- `src/views/SprintBoardView.tsx` (badges, priority colors, focus rings)
- `src/views/WorkLogView.tsx`
- `src/views/CalendarView.tsx`
- `src/views/SettingsView.tsx`
- `src/views/ExportView.tsx`
- `src/components/ApplicationLayout.tsx` (sidebar active states)
- `src/components/catalyst/button.tsx` (focus ring color: `amber-500` -> `slate-900` or accent)

---

## 3. Component Updates

### 3.1 Buttons (`src/components/catalyst/button.tsx`)

- **Solid buttons:** Primary solid buttons should become black/dark (`slate-900` background, white text) instead of amber. This matches the website's dark CTA buttons.
- **Outline buttons:** Keep the outline style but ensure borders use `slate-300` / `slate-700` in dark mode.
- **Focus ring:** Change from `outline-amber-500` to `outline-slate-900` (or the configured accent).
- **Ghost/plain variant:** Ensure hover states use subtle `slate-100` backgrounds instead of amber tints.
- The `color="amber"` prop usage across views should be updated to `color="dark"` or a new default.

### 3.2 Sidebar (`src/components/catalyst/sidebar.tsx`, `ApplicationLayout.tsx`)

- **Active state indicator:** If currently using amber highlights for the active nav item, switch to a black/dark indicator (filled dark background with white text, or a bold left-border in black).
- **Sidebar background:** Keep white/light in light mode, dark in dark mode. Ensure border colors shift to slate.
- **Hover states:** Use `slate-100` hover background instead of any amber tinting.

### 3.3 Cards (HomeView stat cards, Sprint cards)

- Remove the colored top-border treatment (`border-t-3 border-amber-500`).
- Use consistent, subtle card styling: `rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm`.
- Icon backgrounds in stat cards: Replace `bg-amber-100` with `bg-slate-100 dark:bg-slate-800`.
- Icon colors: Replace `text-amber-600` with `text-slate-700 dark:text-slate-300` or keep them as subtle differentiators per card.

### 3.4 Badges (`src/components/catalyst/badge.tsx`)

- Review badge color usage. Where `color="amber"` is used for labels/tags in the sprint board, switch to `color="zinc"` or introduce a neutral badge variant.

### 3.5 Inputs and Form Elements

- Ensure focus rings on inputs (`input.tsx`, `select.tsx`, `textarea.tsx`) use the new accent color instead of amber.
- Border colors should align with the slate palette.

### 3.6 Dialogs (`src/components/catalyst/dialog.tsx`)

- Verify dialog overlays and buttons use the updated palette.

---

## 4. Dark Mode

### Current State
- Uses `.dark` class-based toggling.
- Dark mode uses `zinc-800`/`zinc-900` backgrounds with amber accents preserved.
- Card dark backgrounds use `dark:from-amber-950/20 dark:to-zinc-900` gradients.

### Proposed Changes

- **Background:** Replace `zinc-800`/`zinc-900` with `slate-800`/`slate-900` for a cooler, more refined dark mode.
- **Remove amber-tinted dark gradients:** Replace `dark:bg-gradient-to-b dark:from-amber-950/20 dark:to-zinc-900` with flat `dark:bg-slate-800` or `dark:bg-slate-900`.
- **Text colors:** Shift from `dark:text-zinc-*` to `dark:text-slate-*` consistently.
- **Accent in dark mode:** Keep the accent color (if using amber-600) or lighten it slightly for dark mode readability. The website's dark mode is clean and minimal; the desktop app should follow suit.
- **Borders:** `dark:border-slate-700` instead of `dark:border-zinc-700` or `dark:ring-white/10`.
- **Scrollbar:** Update dark mode scrollbar colors in `app.css` to match slate tones.

---

## 5. Additional Styling Aspects

### 5.1 Spacing and Layout

- The website uses generous whitespace and clear sectional hierarchy. Review padding and margins in views, particularly `HomeView`, to introduce more breathing room.
- Stat cards on the home screen could benefit from slightly larger padding (`p-8` instead of `p-6`).

### 5.2 Border Radius

- The website uses well-rounded corners. Standardize on `rounded-xl` (12px) for cards and `rounded-lg` (8px) for buttons and inputs across the app.

### 5.3 Shadows

- Reduce shadow intensity. The website uses very subtle shadows. Move from `shadow-md` to `shadow-sm` on cards, and from `hover:shadow-lg` to `hover:shadow-md` on hover.

### 5.4 Transitions and Motion

- The app already uses `motion` (Framer Motion). Ensure transitions remain subtle and quick (200-300ms). The website has a calm, professional feel; avoid bouncy or dramatic animations.

### 5.5 TitleBar (`src/components/TitleBar.tsx`)

- If the title bar uses amber/orange accents, update to match the new palette.

### 5.6 Onboarding Modal (`src/components/OnboardingModal.tsx`)

- Update any accent colors or button styles to match the new system.

---

## 6. Implementation Order

This plan should be implemented in the following order to minimize conflicts and allow incremental review:

1. **Fonts:** Add font files, update `app.css` theme, update `heading.tsx` and `text.tsx`.
2. **CSS theme variables:** Define the new color palette as custom properties in `app.css`.
3. **Catalyst components:** Update `button.tsx`, `badge.tsx`, `input.tsx`, `select.tsx`, `textarea.tsx` focus/accent colors.
4. **Sidebar and layout:** Update `sidebar.tsx`, `ApplicationLayout.tsx` active states and borders.
5. **Views (one by one):** HomeView, SprintBoardView, WorkLogView, CalendarView, SettingsView, ExportView.
6. **Dark mode pass:** Go through all updated components and views to verify dark mode consistency.
7. **Polish:** Spacing adjustments, shadow refinement, border-radius consistency.

---

## 7. Testing Considerations

- Verify all views in both light and dark mode after changes.
- Test all interactive states: hover, focus, active, disabled.
- Ensure sufficient contrast ratios (WCAG AA minimum) with the new palette, especially in dark mode.
- Check that the sidebar active state remains clearly distinguishable.
- Verify the app feels cohesive with the website by comparing side-by-side.

---

## 8. Implementation Notes

**Implemented on:** 2026-03-25

### What was done

1. **Typography:** Added Lora (serif, variable 400-700) and Plus Jakarta Sans (sans-serif, variable 200-800) font files. Updated app.css with @font-face declarations. Plus Jakarta Sans is now the default `--font-sans`, Lora added as `--font-serif`. Heading component now uses `font-serif` class.

2. **CSS theme variables:** Added `--color-primary`, `--color-primary-light`, `--color-accent`, `--color-accent-light` custom properties mapped to slate and amber.

3. **Catalyst components updated:**
   - `heading.tsx`: Serif font, zinc -> slate text colors
   - `text.tsx`: zinc -> slate text colors
   - `button.tsx`: Focus ring changed from amber-500 to slate-900/slate-400 (dark)
   - `sidebar.tsx`: Active indicator from amber to slate-900/white, hover backgrounds from zinc to slate, icon fill colors updated

4. **HomeView:** Removed amber/orange gradient title (now solid serif heading), replaced colored top-border cards with clean rounded-xl border cards, updated icon backgrounds from amber/orange to slate, increased card padding, reduced shadow intensity.

5. **Inter font preserved** for backwards compatibility — can be removed in a follow-up once migration is verified.

### What was deferred

- Full color sweep of all remaining views (SprintBoardView, WorkLogView, CalendarView, SettingsView, ExportView) — these still use zinc/amber in places. This is intentional to allow incremental review.
- Dark mode consistency pass across all views
- Spacing and shadow refinement in secondary views
- TitleBar and OnboardingModal accent updates
