# Bihan — Components

Source of truth for values: `design/tokens.json` and `design/tailwind.config.snippet.js`.
Live reference (all components rendered): the "Bihan" design system page in claude.ai.

## Global rules

- v1 is dark only. Body: `bg-bg text-ink font-sans antialiased`.
- **Grade colours are reserved.** `grade-s` … `grade-d` only appear on things that carry that grade: rings, badges, progress fills, chart lines, grade labels. Never on category tags or decoration.
- **Identity colours are separate.** Each goal and category has a user-picked colour from 10 `id-*` colours. It only tints the EmojiTile, CategoryChip, dots and swatches. It never colours a ring, progress bar, chart or text. A teal goal that's Slipping still has an orange ring.
- **Only S glows.** `shadow-glow-s` is used on the S badge and S ring and nowhere else.
- `grade-d` is also the error/destructive colour. There is no other red.
- Grade from score: 90-100 S "Locked In", 75-89 A "Strong", 60-74 B "On Track", 40-59 C "Slipping", 0-39 D "Off Track". Goals under 3 days old are "Calibrating" (grey, no grade).
- The grade letter always sits next to its colour, so colour is never the only signal.
- Icons: Lucide, 2px stroke, 20px default / 16px inline, `text-ink-muted` or `text-ink`, for all app chrome (nav, buttons, actions, empty states).
- **Emoji are user content only:** the emoji a user picked for a goal or category, shown in an EmojiTile or CategoryChip (`font-emoji`). Never in labels, buttons or system copy. Default categories: Fitness 🏃 teal, Study 📚 violet, Career 💼 indigo, Custom ✨ slate.
- Focus: every interactive element gets `focus-visible:shadow-focus focus-visible:outline-none`.
- Suggested component API: pass `grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'CAL'` and derive classes from it.

---

## Button

| Variant | Classes | Use |
|---|---|---|
| Primary | `bg-gold text-ink-on-gold hover:bg-gold-hover` | One main action per view (Log check-in, Save, Sign in) |
| Secondary | `border border-border-strong text-ink hover:bg-surface-2` | Supporting actions |
| Ghost | `text-ink-muted hover:text-ink hover:bg-surface-2` | Cancel, toolbar toggles |
| Danger | `bg-grade-d-dim text-grade-d` | Delete; always behind a confirm |

- Base: `rounded-md px-5 py-3 text-body font-semibold inline-flex items-center gap-2 active:scale-[.97] transition`.
- Small: `rounded-sm px-3 py-2 text-body-sm` (chips, filters, 7D/30D toggles).
- Disabled: `bg-surface-2 text-ink-subtle cursor-not-allowed`.

## Card

- `bg-surface-1 border border-border rounded-lg p-6` (`p-4` on mobile).
- Interactive: `hover:bg-surface-2 hover:border-border-strong cursor-pointer`.
- Never colour a card's border to show a grade. The ring, badge or bar carries it.

## Input

- Field: label above (`text-body-sm font-medium text-ink-muted`), input, helper text below (`text-body-sm text-ink-muted`).
- Input: `bg-surface-2 border border-border-strong rounded-md p-3 text-body placeholder:text-ink-subtle`.
- Focus: `focus:border-gold focus:shadow-focus`.
- Error: `border-grade-d`, helper text `text-grade-d`, message says how to fix it ("At least 8 characters").

## ScoreRing

SVG circle arc, 0-100, starting at 12 o'clock, clockwise, round caps.

| Size | Diameter | Stroke | Number | Where |
|---|---|---|---|---|
| hero | 220px (184px / 16px stroke on mobile) | 18px | `text-score-hero` (`text-score-hero-mobile`) | Dashboard overall score |
| md | 140px | 12px | `text-score-md` | Goal detail, weekly review |
| sm | 64px | 6px | `text-score-sm` | Goal cards |
| xs | 48-52px | 5px | 15-16px display | Category tiles, "needs attention" rows, check-in goal picker (40px / 4px) |

- Track: `stroke-grade-{g}-dim`. Bar: `stroke-grade-{g}`.
- Centre: optional `label` text above the number ("OVERALL"), grade label under it in the grade colour (hero and md only).
- S: add `drop-shadow(0 0 10px rgba(255,201,60,.55))` on the bar.
- Calibrating: `stroke-grade-cal`, dash pattern `2 10`, "–" in the centre, caption "Calibrating".
- Animate from 0 on first load (600ms ease-out). Skip with `prefers-reduced-motion`.
- Maths: `r = (size - stroke) / 2`, `c = 2πr`, `strokeDasharray = c`, `strokeDashoffset = c * (1 - score/100)`.

## GradeBadge

Rounded square with the grade letter in Unbounded 800, optional uppercase label to the right.

| Size | Box | Letter | Radius | Where |
|---|---|---|---|---|
| sm | 28px | 15px | `rounded-sm` | Lists, tables |
| md | 48px | 28px | `rounded-md` | Cards (default) |
| lg | 72px | 40px | `rounded-lg` | Dashboard hero, beside the ring |

- S: solid `bg-gold text-ink-on-gold shadow-glow-s`. The only filled badge.
- A-D: `bg-grade-{g}-dim text-grade-{g} border-[1.5px] border-grade-{g}`.
- Calibrating: dashed `border-grade-cal`, letter "…", label "Calibrating".
- Label: `text-label uppercase text-grade-{g}`.

## ProgressBar

Goal completion: numeric = current / target, habit = check-ins / expected this week, milestone = subtasks done / total.

- Meta row above: goal name left, `**current** / target unit` right (`text-body-sm text-ink-muted`, value in `text-ink font-semibold`).
- Track: `h-2.5 rounded-full bg-surface-2` (thin variant `h-1.5` inside cards, no meta row).
- Fill: `bg-grade-{g}` (the goal's grade), `rounded-full`, width = progress %, capped at 100%.
- **Pace tick:** a 2px × 18px `bg-ink opacity-70` mark at the *expected* progress for today (from the scoring engine's linear expected progress). If the fill is left of the tick, the user is behind. Hide the tick for goals with no deadline.

## ChartCard

Card with header (label + current value + delta), range toggle, and a Recharts area chart.

- Header: `text-label uppercase text-ink-muted` "SCORE TREND", value in `font-display text-[28px] font-bold`, delta `text-grade-a` "▲ 9 vs 30d ago" or `text-grade-d` "▼".
- Toggle: small ghost/secondary buttons `7D` / `30D` (active = secondary).
- Line: 2.5px, colour = current grade. Area: grade `-dim`. Last point: 5px dot with 3px `surface-1` ring.
- Grid: horizontal lines only at 40, 60, 75, 90 (the grade thresholds), `chart-grid`. Y labels on the right, `text-body-sm text-ink-muted`. X labels: first date and "Today".
- Tooltip: `bg-surface-3 rounded-sm`, date + score + grade letter.
- Data: `GET /goals/{id}/score-history?days=30` or dashboard `trend`.

## GoalCard

One goal in the Goals list and the dashboard "needs attention" list. The whole card links to Goal detail.

- Layout (updated for goal identity): top row = EmojiTile (40px, goal's emoji + identity colour) + title (`text-heading-md`) with a meta line under it (CategoryChip small + "Numeric · 72 / 80 kg") on the left, sm ScoreRing on the right. Then thin ProgressBar. Bottom row = small GradeBadge with label (left), one stat (right).
- The ring, bar and grade label use the **grade** colour; only the tile and chip use the identity colour.
- Stat: habits = "12-day streak", behind pace = "Behind pace", milestones = subtasks done.
- Padding `p-5`, width fills its grid cell (3 columns desktop, 1 column mobile).

## EmojiTile, CategoryChip, ColourSwatches, EmojiPicker (goal identity)

- **EmojiTile:** square, emoji centred (`font-emoji`). Sizes sm 28px / `rounded-sm` / 15px emoji, md 40px / `rounded-md` / 22px (goal cards), lg 64px / `rounded-lg` / 34px (form; 56px on mobile). Tint = identity colour at 22% + 1px inset ring at 40% (Tailwind: `bg-id-teal/[.22] ring-1 ring-inset ring-id-teal/40`). In the form it's a button with a 22px pencil badge bottom-right (`bg-surface-3`, 2px `surface-1` border).
- **CategoryChip:** `rounded-full bg-surface-2 text-body-sm font-medium text-ink-muted pl-1.5 pr-2.5 py-0.5`, emoji 13px + name. Selected (pickers, filters): `bg-ink text-bg`. Add variant: dashed `border-border-strong`, transparent, "+ New category".
- **ColourSwatches:** 10 identity colours in `grid-cols-10 gap-2`, each a circle up to 32px. Selected: 2px `surface-1` gap + 2px `ink` ring and a check icon in `text-bg`. `aria-pressed`.
- **EmojiPicker:** search field (40px, `bg-surface-2`) + scrolling sections ("Suggested for <goal>", Activity, Objects, Food, Nature, Symbols…) of 8-column grids, 22px emoji, selected = `bg-grade-s-dim` + 1.5px gold inset ring. Use a library for the data and search (e.g. emoji-mart) and style it to this. "Suggested" = a few emoji matched to keywords in the goal name. Recent picks first.
- **Picker container:** desktop = popover 360px under the tile (`bg-surface-1 border-border-strong rounded-lg shadow-modal p-4`), holding Colour swatches → search → emoji sections (max 232px scroll). Mobile = bottom sheet with grab handle over a scrim. Picking an emoji doesn't close it; tapping outside or Done does.

## SegmentedControl, Stepper, WeekdayPicker (frequency)

- **SegmentedControl:** `grid auto-cols-fr grid-flow-col bg-surface-2 rounded-md p-[3px] gap-0.5`; segments `py-2 px-2.5 rounded-[9px] text-body-sm font-medium text-ink-muted`; selected `bg-surface-3 text-ink shadow-sm`. On a `surface-2` block, the track switches to `bg-surface-1`. Used for goal type, numeric direction and habit frequency. Disabled: 55% opacity + a lock note under it.
- **Stepper:** `bg-surface-2 border border-border-strong rounded-md`, 44×44 −/+ buttons, value in Unbounded 20px. Range 1-7 for times a week; buttons disable at the ends.
- **WeekdayPicker:** `grid-cols-7 gap-1.5`, 44px tall buttons M T W T F S S (`aria-label` = full day name), selected `bg-gold text-ink-on-gold`, unselected `bg-surface-2 text-ink-muted`. Weeks start Monday. At least one day stays selected. Summary line under it in `text-body-sm text-ink`: "5 days a week · Mon, Tue, Thu, Fri, Sat".

## Disclosure ("More options")

- Full-width button, `border-t border-border py-4`, "More options" `text-body font-semibold` + muted summary "· Why this matters, start date", chevron right that rotates 180° when open. `aria-expanded`. Content appears below with `gap-5`.
- Starts collapsed on create. On edit it opens automatically if anything inside has a value.

## Toggle

- Track `w-11 h-[26px] rounded-full`. Off: `bg-surface-3 border border-border-strong`, knob 20px `bg-ink-muted`. On: `bg-gold border-gold`, knob `bg-ink-on-gold translate-x-[18px]`. 150ms transition.
- Always next to a text label; the whole row is the click target. `role="switch"` + `aria-checked`.

## MoodMeter and MoodPicker (Journal)

Mood is 1-5: **1 Rough, 2 Low, 3 Okay, 4 Good, 5 Great**. It's optional.

- **MoodMeter** (read-only, on entry cards): five 3px-wide bars rising 5, 7, 9, 11, 14px, `gap-0.5`, filled `bg-gold` up to the mood, rest `bg-surface-3`, then the word in `text-body-sm text-ink-muted`. `aria-label="Mood 4 of 5, Good"`. No mood → render nothing.
- **MoodPicker** (editor): five equal tiles in `grid-cols-5 gap-2`, each `bg-surface-2 rounded-md py-2` with the number (17px Unbounded 700) over the word (11px). Selected: `bg-grade-s-dim border border-gold text-gold`, `aria-pressed="true"`. Tapping the selected tile clears it. Same shape as the check-in Effort picker, on purpose.
- **Never colour mood with grade colours.** Grades mean scores; mood is just how the day felt.

## TagChip (Journal)

- `inline-flex rounded-full bg-surface-2 px-2.5 py-0.5 text-body-sm font-medium text-ink-muted`, with a `#` prefix in `text-ink-subtle`. Tags are stored lowercase, no spaces (`#study`, `#side-project`).
- Selected filter: `bg-ink text-bg`. Removable (in the editor's tag input): `bg-surface-3 text-ink` + a 16px x button `aria-label="Remove gym"`.
- Not the same as `bh-chip` (uppercase category/type labels on goals). Don't mix them.

## SearchField

- `h-11 flex items-center gap-2 bg-surface-1 border border-border-strong rounded-md px-3`, search icon `text-ink-muted`, input `text-body`, placeholder `text-ink-subtle`. Desktop shows a `/` key hint on the right (`/` focuses search).
- Focus: `border-gold shadow-focus`. Filters as you type (debounce ~250ms). In results, highlight matches with `bg-grade-s-dim text-gold rounded-sm`.

---

## Screens

PNGs are in `design/screens/` (`<screen>-desktop.png` at 1440px, `<screen>-mobile.png` at 390px, 2x; the Journal screens `07`-`09` are at 375px). The responsive HTML source for every screen is in `design/screens-html/`: open one in a browser and resize it to see both layouts. The class names match `components/bundle.css` from the design system.

Breakpoint: **mobile < 768px**, desktop ≥ 768px (Tailwind `md:`). Build mobile-first.

### App shell (every screen except auth)

| | Desktop | Mobile |
|---|---|---|
| Navigation | Left sidebar `w-sidebar` (240px), full height, 1px `border-r border-border`. Logo at top, nav links (Dashboard, Goals, Journal, Weekly review, Settings), user chip pinned to the bottom. Active link: `bg-surface-1 text-ink`, icon `text-gold`. | Sidebar hidden. Bottom tab bar `h-tabbar` (72px), fixed, `bg-surface-1/95 backdrop-blur border-t border-border`, 5 tabs: Dashboard, Goals, Journal, Review, Settings (icon + 11px label; active icon gold). Top row: logo left, avatar right. |
| Main column | `max-w-main` (1296px), `px-12 pt-8 pb-12` | `px-4 pt-5`, `pb-[88px]` so content clears the tab bar |
| Page header | Eyebrow (`text-body-sm text-ink-muted`) + `text-display` title left; primary action buttons right | Same, title `text-display-mobile`; header buttons hidden (actions move to the FAB or into the page) |
| Log check-in | Gold primary button in the header | Gold FAB, 56px circle, fixed `right-4 bottom-[88px]`, plus icon. Hidden on empty states and inside the modal. On Journal pages the FAB is "New entry" (pen icon) instead. |
| Gaps | Cards `gap-5` (20px), sections `mt-8` (32px) | Cards `gap-4`, sections `mt-6`; card padding `p-4` |

### 1. Login / Register (`01-login`, `01b-register`)

- **Desktop:** 2-column split (`grid-cols-[1.1fr_1fr]`). Left: `bg-surface-1` art panel with the logo top-left, three concentric S/A/B rings bleeding off the top-right, and at the bottom the 48px Unbounded headline "Every morning is a fresh shot at your score.", a one-line description and a row of small S A B C D badges. Right: the form centred in a 400px column.
- **Mobile:** art panel hidden; logo on top, then the form full width.
- **Form:** title ("Welcome back" / "Start your score") + one-line subtitle → segmented tabs (Sign in | Create account) → fields stacked with `gap-4` → full-width primary button → switch link below in `text-body-sm`.
- Fields: Login = Email, Password, "Forgot password?" link right-aligned. Register = Name, Email, Password with "At least 8 characters." helper.
- Error state (shown on login): a `bg-grade-d-dim text-grade-d rounded-md` alert above the fields + the password input in its error style.
- API: `POST /auth/login`, `POST /auth/register`.

### 2. Dashboard (`02-dashboard`)

- **Row 1 (desktop `grid-cols-[1.35fr_1fr]`):**
  - **Hero card** (`rounded-xl p-8`, `data-grade` = overall grade, soft radial glow of the grade's `-dim` colour from the top-left): hero ScoreRing 220px with "OVERALL" label and grade caption → beside it the md GradeBadge (72px), "THIS WEEK" label and the grade name in 28px Unbounded in the grade colour → one sentence with the delta ("Up ▲ 6 from last week. 12 more points to Locked In.") → 3 stats (Active goals, Check-ins 7d, Best streak) as `label` + `stat` pairs.
  - **Right stack:** Categories card (2×2 grid of tiles: xs ring 52px + category icon/name + grade label in grade colour; "Weights" link → Settings) and Streak card (flame icon tile in `bg-grade-s-dim text-gold`, "12 days" in 40px Unbounded, a Mon-Sun strip: done days `bg-gold`, today dashed outline, future `bg-surface-2`, plus a nudge line).
- **Row 2 (same columns):** Score trend ChartCard (7D/30D toggle, 30-day overall score) and the **Needs attention** card: up to 3 rows, each = xs ring 48px + goal title + reason line ("Behind pace: 37% done, 61% expected", "Missed 2 days this week", "New goal, grade unlocks Oct 16") + small grade badge. Order: lowest score first, Calibrating goals last.
- **Mobile:** everything in one column in this order: hero (ring 184px centred, badge + grade name under it, stats centred), Categories, Streak, Trend, Needs attention.
- Hide categories with no active goals (scoring rule).
- API: `GET /dashboard`.

### 2b. Dashboard empty state (`02b-dashboard-empty`, new user, zero goals)

- Hero card replaced by a centred empty card: a Calibrating ring (168px, dashed, "–") → "Your score starts with your first goal" (`text-heading-lg`) → a short explanation → primary "Create your first goal" → 3 starter cards (Fitness: Gym 4x per week · Habit; Study: Finish an assignment · Milestone; Career: Hit a number · Numeric). Clicking a starter opens the create-goal form (screen 11) prefilled from that template.
- Row 2: a trend card with a dashed placeholder ("Your trend line appears after 3 days of check-ins.") and a "How grades work" card listing S-D with labels and ranges.
- No FAB. Starters stack to one column on mobile.

### 3. Goals list (`03-goals`, `03b-goals-empty`)

- Header: eyebrow "7 active goals", title "Goals", buttons "Sort: Score" (secondary) + "New goal" (primary).
- **Filters row:** category pills left (All, Fitness, Study, Career, Custom, each with a count; active pill = `bg-ink text-bg`, others outlined `border-border`, `rounded-full`), status segmented control right (Active | Completed | Archived; active segment `bg-surface-3`).
- **Grid:** GoalCards, `grid-cols-3 gap-5` desktop, 1 column mobile. Card = EmojiTile + title, CategoryChip + type meta → sm ScoreRing top-right → thin ProgressBar → footer: small GradeBadge with label left, one stat right (stat turns `text-grade-d` when it's a warning: "Behind pace", "Missed 2 days").
- Calibrating goal: dashed grey ring with "–", "…" badge labelled "Calibrating", grey progress fill.
- **Mobile:** category pills scroll horizontally in one line (no wrap), the segmented control sits below them.
- **Empty:** filters stay visible (no counts), then a centred card: target icon tile → "No goals yet" → one sentence → "Create a goal". No FAB.
- API: `GET /goals?category=&status=`.

### 4. Goal detail (`04-goal-detail`, milestone example)

- Back link "‹ All goals" (mobile: "‹ Goals" left + overflow menu button right in the top row).
- **Header card** (`p-8`, `data-grade` = goal grade): md ScoreRing 140px with grade caption left; right: chips (category, type) + due date and days left → title in `text-display` → ProgressBar with **pace tick** (meta: "3 of 8 subtasks done" left, "Expected by today: 61%" right) → actions: Log check-in (primary), Edit goal (secondary, desktop only), GradeBadge with label.
- **Row 2 (`grid-cols-2`):**
  - **Score breakdown:** 4 rows (Pace 40%, Consistency 30%, Momentum 20%, Effort 10%). Each row: name + weight caption | thin bar | value %, then a one-line plain-English reason under the bar. Each bar is coloured by the grade its own value would get (61% → C orange, 25% → D red, 70% → B blue).
  - **Score history:** ChartCard with 14D/30D toggle, line in the goal's grade colour, delta in red/green.
- **Row 3 (`grid-cols-2`):**
  - **Milestones** (milestone goals only; hidden for numeric and habit): "3 / 8" count + "Add" ghost button; checklist rows = 22px checkbox (done: `bg-grade-a` with check, title struck through in `text-ink-muted`) + title + due date right; overdue dates in `text-grade-d` "Overdue · Oct 13".
  - **Check-ins:** newest first; each row = date tile (day in 18px Unbounded over the month label, `bg-surface-2 rounded-md`) + note + sub-line (value or the subtask it completed) + effort shown as 5 dots (filled `bg-gold`).
- Numeric goals: the progress meta reads "72 / 80 kg"; habit goals: "4 of 5 this week". No pace tick when the goal has no deadline.
- **Mobile:** header card centres everything (ring above, chips, title, bar, buttons); then the sections stack in order: breakdown, history, milestones, check-ins.
- API: `GET /goals/{id}`, `/score`, `/score-history`, `/check-ins`; `PATCH /milestones/{id}` to tick.

### 4b. Goal detail, Calibrating (`04b-goal-detail-calibrating`, goal under 3 days old)

- Same layout. Ring is the dashed Calibrating ring with "–"; badge "…" labelled "Calibrating"; progress fill `bg-grade-cal`.
- A dashed `bg-surface-2` banner under the header: hourglass icon, "Calibrating: grade unlocks Fri, Oct 16" + "Bihan needs 3 days of data before it grades a goal. Keep logging; your check-ins already count."
- Score breakdown shows the 4 factor rows with empty tracks and "–", header label "CALIBRATING" in `text-grade-cal`.
- Score history is replaced by a dashed placeholder "Score history starts Oct 16." inside the Check-ins card.
- Never show a grade colour, a number or a delta while calibrating.

### 5. Check-in modal (`05-check-in`)

- **Desktop:** centred dialog `max-w-modal` (520px), `bg-surface-1 rounded-xl shadow-modal p-8`, over the page with the `overlay` scrim + 4px blur.
- **Mobile:** bottom sheet: full width, top corners `rounded-t-xl`, grab handle (40×5px, `bg-surface-3`), max 94vh and scrolls if taller. Covers the tab bar.
- Contents, top to bottom:
  1. "LOG CHECK-IN" label + "How did it go?" heading, close button (36px circle) top-right.
  2. Goal picker row (`bg-surface-2 rounded-md`): 40px ring + goal name + "Current best: 72 kg" + chevron. Preselected when opened from a goal page.
     - **Why this matters** (only if the goal has one): attached directly under the picker (shared `surface-2` block, 1px `border-t border-border`, bottom corners rounded): gold `quote` icon, `label` "WHY THIS MATTERS" in `text-gold`, then the text in `text-body-sm text-ink`. Read-only here; edited on the goal. Changes when the picked goal changes.
  3. **Value** (numeric goals only): large input with 28px Unbounded digits (24px on mobile) and the unit on the right. Hidden for habit goals (the check-in itself counts); for milestone goals it becomes a "Mark a subtask done" list.
  4. **Effort 1-5:** five equal tiles (number + Easy / Light / Solid / Hard / All out); selected = `bg-grade-s-dim border-gold text-gold`. Required.
  5. **Date:** pills Today (default, selected = `bg-ink text-bg`) / Yesterday / Pick date (opens a date picker; no future dates).
  6. **Note** (optional): textarea, 84px min height (64px mobile).
  7. Footer: live preview "Score after this: 84 → 87" (in the new grade colour) left; Cancel (ghost, desktop only) + "Save check-in" (primary) right. Mobile: full-width Save button, preview centred under it.
- On save: close, toast, and animate the goal's ring to the new score.
- API: `POST /goals/{id}/check-ins`.

### 6. Weekly review (`06-weekly-review`)

- Header: eyebrow date range "Oct 5 – Oct 11", title "Weekly review", week switcher right (prev arrow, "Oct 5 – 11" date button, next arrow disabled when it's the latest week). Mobile: switcher as its own full-width row under the title.
- **Hero card** (`data-grade` = this week's grade): last week's ring (112px, 55% opacity, "LAST WEEK") → arrow → this week's ring (160px desktop / 136px mobile, grade caption, "THIS WEEK") → delta "▲ 6 points" in 40px Unbounded (green up / red down) + "B to A. You moved up a grade." + one-line summary → large GradeBadge far right (desktop only). Mobile: stacked and centred.
- **Row 2 (`grid-cols-2`):** **Best goal** card (trophy + "BEST GOAL" label in gold, 88px ring, title, week stats, "▲ 8 from 85, now Locked In") and **Slipping** card (trending-down + "SLIPPING" label in the slipping goal's grade colour, ring, title, stats, "▼ 12 from 63, B to C", secondary button "Plan a session →").
- **Row 3 (`grid-cols-2`):** **Categories** table (Category with icon | Last | This | Change with ▲/▼ coloured | small badge) and **Check-ins** card ("23 / 28 expected" + a Mon-Sun bar chart where a full gold bar = every planned check-in done that day, grey = partial).
- If there's no previous week yet: hide the old ring and delta and show "First week: no comparison yet".
- API: `GET /reviews/weekly?week_start=2026-10-05`.

### States every page needs

- **Loading:** skeleton blocks in `bg-surface-2` at the size of each card, rings as empty tracks. No spinners on the dashboard hero.
- **Error:** inside the card that failed: `text-grade-d` message + "Try again" secondary button. The rest of the page stays usable.
- **Empty:** as designed for Dashboard and Goals; Goal detail check-ins empty = "No check-ins yet. Log your first one." + primary button.

---

## Journal

Notes and random thoughts, kept next to your goals. Screens `07`-`09` in `design/screens/`, mobile at **375px**.

### 7. Journal list (`07-journal`)

- Header: eyebrow "23 entries this month", title "Journal", buttons "Export for AI" (secondary, `file-down` icon) + "New entry" (primary, `pen-line` icon).
- **Desktop layout:** `grid-cols-[minmax(0,1fr)_320px] gap-8`: entries column + right rail (`sticky top-8`).
- **Tools (top of the entries column):** SearchField full width ("Search entries and tags"), then a row of TagChips to filter: "All" (selected = `bg-ink`, no `#`) followed by the user's tags with counts, most-used first. One tag at a time in v1.
- **Entries:** grouped by time with `label` headings: "This week", "Last week", then month names ("September 2026"). Newest first. Cards stacked `gap-3`.
- **Entry card** (`bh-card bh-card--interactive p-5`, `grid-cols-[56px_1fr] gap-4`): date tile (same as the check-in date tile: day in 18px Unbounded over "OCT") | title in `text-heading-md`, one line, ellipsis → excerpt `text-body text-ink-muted`, clamped to 2 lines → footer row: MoodMeter, TagChips, and the weekday + time right-aligned in `text-body-sm text-ink-subtle`.
  - **No title:** use the entry's first sentence as the card title (`font-medium` instead of semibold) and the rest of the body as the excerpt.
  - No mood / no tags: those parts are simply absent.
- **Right rail:** "October" card: 2 stat tiles (Entries, Avg mood) + a 30-day mood strip (one bar per day, height = mood × 20%, `bg-gold`; days with no entry = 3px `bg-border-strong`) + caption "Grey = no entry that day." Then a "Tags" card listing every tag with its count; clicking one applies that filter.
- **Mobile (375):** single column. Top row logo + avatar, then title. Search field + a 44px secondary icon button (Export for AI) beside it. Tag row scrolls sideways, no wrap. Cards drop the date tile; the date goes above the title as a `label` ("SAT, OCT 17"), padding `p-4`. The October stats card moves below the list; the Tags card is hidden (the tag row covers it). FAB = New entry.
- **No search results:** inside the list area: "No entries match "squat"" + a ghost "Clear search" button.
- API (proposed): `GET /journal?q=&tag=&cursor=` (paged, 20 per page, infinite scroll), `GET /journal/stats?month=2026-10`.

### 7b. Journal empty state (`07b-journal-empty`)

- Header as normal, but "Export for AI" is disabled.
- Centred card: 64px gold-tinted icon tile (`notebook-pen`, `bg-grade-s-dim text-gold`) → "Your journal is empty" (`text-heading-lg`) → "Notes, random thoughts, wins, rants. Write it down here and it sits right next to your goals and scores." → primary "Write your first entry" → `label` "Or start from a prompt" → 3 prompt cards (`grid-cols-3`, 1 column on mobile): "What's on your mind right now?", "What went well today?", "What got in the way of a goal?". A prompt opens the editor with the prompt as the body placeholder.
- No FAB, no rail.

### 8. Write / edit entry (`08-journal-edit`, `08b-journal-new`)

Distraction-free: **no sidebar, no tab bar, no FAB.** Full-screen page on its own route (`/journal/new`, `/journal/:id`).

- **Top bar** (sticky, `bg-bg/90 backdrop-blur`, `px-12 py-4`; mobile `px-4 py-3`): "‹ Journal" back link left. Right: save status, word count (desktop), delete (ghost icon button, existing entries only, desktop; on mobile it's in the ⋯ menu), and a small primary button: "Done" (existing) / "Save" (new).
- **Save status:** autosave 1s after typing stops. States: "Not saved yet" (`text-ink-subtle`), "Saving…", "Saved · 4:58 PM" with a 6px `bg-grade-a` dot, "Couldn't save. Retrying…" in `text-grade-d`. Leaving with unsaved changes asks for confirmation.
- **Writing column:** `max-w-[720px] mx-auto px-6 pt-8`, bottom padding 220px (300px mobile) so text never hides under the details panel.
  1. Date button (`text-body-sm text-ink-muted`, calendar icon + chevron): "Sat, Oct 17 · 4:58 PM". Defaults to now; opens a date-time picker so you can back-date. No future dates.
  2. **Title (optional):** borderless input, Unbounded 600 32/40px (24/30 mobile), placeholder "Title (optional)" in `text-border-strong`.
  3. **Body:** borderless auto-growing textarea, Inter 18/30px (17/28 mobile), `text-ink`, paragraphs spaced 20px. Placeholder "What's on your mind?" (or the chosen prompt). Plain text in v1; keep line breaks.
- **Details panel** (mood + tags): floating card fixed `bottom-6`, centred, `max-w-[720px]`, `bg-surface-1 border rounded-xl shadow-modal px-5 py-4`, `grid-cols-[300px_1fr] gap-6`. Mobile: docked to the bottom edge as a sheet (`rounded-t-xl`, full width, sections stacked), sitting above the keyboard.
  - **Mood:** `label` "MOOD" + "optional" hint, then the MoodPicker.
  - **Tags:** `label` "TAGS", then a tag input (`bg-surface-2 border-border-strong rounded-md min-h-[52px]`) holding removable TagChips and a borderless input "Add tag". Enter or comma adds; Backspace on empty removes the last; lowercased, spaces become `-`; max 10 tags. Below: "Suggested" + the user's 2-4 most-used tags not already added.
  - Mobile shows the word count on the Tags label row.
- **New entry state** (`08b`): empty title and body showing placeholders, no mood selected, no tags, "Not saved yet", button reads "Save". An entry is created on first keystroke (autosave), not on Save.
- Keyboard: `Ctrl/Cmd+Enter` = Done, `Esc` = back.
- API (proposed): `POST /journal`, `PATCH /journal/{id}`, `DELETE /journal/{id}` (soft delete, "Undo" toast for 5s).

### 9. Export for AI modal (`09-journal-export`)

Opened from "Export for AI" on the Journal list. Desktop: centred dialog, **560px** wide (same frame as check-in: `bg-surface-1 rounded-xl shadow-modal p-8`, scrim + blur). Mobile: bottom sheet, scrolls if taller than the screen.

1. Header: `label` "EXPORT FOR AI" with a `sparkles` icon, heading "Download your journal", one line: "One Markdown file you can paste into Claude or ChatGPT to ask about your patterns." Close button top-right.
2. **Date range:** preset pills (Last 7 days, **Last 30 days** default, This month, All time; selected = `bg-ink text-bg`), then two date fields "From" → "To" (`grid-cols-[1fr_auto_1fr]`, stacked on mobile). Editing a date deselects the preset.
3. **Include goals and scores:** an option row (`bg-surface-2 rounded-md p-4`) with title, a 2-line explanation ("Adds each goal's score, grade and progress for the same dates, so the AI can link what you wrote to how you did.") and a Toggle on the right. **Default on.**
4. **Preview:** monospaced 12px box (`bg-bg border rounded-md`), first ~10 lines of the real file, fading out at the bottom. Headings in `text-ink`, field names in `text-gold`. Under it: "**24 entries** · about 6,300 words · 7 goals" and the filename in mono `text-ink-subtle`. Updates live when the range or toggle changes.
5. **Footer** (top border): left "Downloads to your device only. Nothing is sent to an AI." with a lock icon; right Cancel (ghost, desktop) + primary "Download .md" (`download` icon). Mobile: full-width button, note centred under it.
- 0 entries in range: summary reads "No entries in this range", Download disabled.
- Filename: `bihan-journal-YYYY-MM-DD-to-YYYY-MM-DD.md`.
- API (proposed): `GET /journal/export?from=2026-09-18&to=2026-10-17&include_goals=true` → `text/markdown` with `Content-Disposition: attachment`.

**File format** (keep it stable, AI tools read it better):

```md
# Bihan journal: Sep 18 – Oct 17, 2026
Exported: Oct 17, 2026 · 24 entries

## Goals and scores            <- only when the toggle is on
- Overall: 78 (A, Strong), ▲6 vs last week
- Bench press 80 kg: 84 (A) · 72 / 80 kg
- Finish ITAP3010: 51 (C, Slipping) · 3 / 8 subtasks
(one line per active goal in the range: score, grade, label, progress; then the weekly overall scores in the range)

## Entries
### Sat, Oct 17 · Leg day finally
Mood: 4/5 (Good) · Tags: #gym #legs
Squats felt heavy after a week off, but I hit…

### Fri, Oct 16                  <- untitled: date only
Mood: 3/5 (Okay) · Tags: #bihan #idea
Random thought: …
```

Entries oldest → newest (reads like a story). Lines for mood or tags are left out when empty.

### Data needed (proposal for the Tech Lead, not in the current schema or API contract)

`journal_entries`: `id`, `user_id`, `title` (nullable, ≤120), `body` (text), `mood` (smallint 1-5, nullable), `entry_at` (timestamptz, user-editable), `created_at`, `updated_at`, `deleted_at`. Tags: `journal_tags (entry_id, tag)` with tag lowercase ≤32 chars, or a `text[]` column. Journal does **not** affect any score.

---

## Create and edit goals

Screens `10`-`12` in `design/screens/`, mobile at **375px**. "New goal" (Goals header, dashboard empty state) opens **10 → 11**. "Edit goal" on Goal detail opens **11** in edit mode (example: `11b`).

Both steps are **focused pages** like the journal editor: no sidebar, no tab bar, no FAB. Routes `/goals/new` (step 1), `/goals/new/details?template=run-5k` (step 2), `/goals/:id/edit`.

**Top bar** (sticky, `bg-bg/90 backdrop-blur border-b border-border`, 3 columns): left = back/cancel link; centre = step dots (24×4px bars, done = `bg-gold`) + "Step 1 of 2 · Pick a start" (text hidden on mobile); right = primary action (desktop only; on mobile it moves to a fixed footer bar, full-width button, `bg-surface-1/95 backdrop-blur border-t`).

### 10. Pick a start (`10-goal-templates`)

- Container `max-w-[960px]`. Title "New goal" (`text-display`) + one line: "Start from a template and tweak it, or start blank. You can change everything later."
- **Start blank** card first: full width, `border-[1.5px] border-dashed border-border-strong rounded-lg p-5`, 48px gold square with `plus`, "Start blank" + "Name it, pick a type, done in 30 seconds.", chevron.
- `label` "TEMPLATES", then a CategoryChip filter row (All + categories).
- Sections per category (`label` heading with the category emoji), each a `grid-cols-3 gap-3` of **template cards**: `bh-card--interactive p-4`, EmojiTile md + name (`15px semibold`) + summary (`text-body-sm text-ink-muted`: "Habit · 4 times a week", "Numeric · 32 → 28 min", "Milestone · subtasks + due date").
- Templates in v1 (static JSON in the frontend, 12): Fitness: Gym 4x a week, Run 5 km under 28 min, Bench press target. Study: Finish an assignment, Read 20 pages a day, Pass an exam. Career: Apply to 3 jobs a week, Ship a portfolio site, Learn React. Custom: Meditate 10 min, In bed by 11 pm, Save Rs 50,000. A template fills: name, emoji, category, type and type fields; milestone templates also add starter subtasks.
- **Mobile:** single-column list rows (`p-3 px-4`, tile + name + summary + chevron). The filter row scrolls sideways.

### 11. Goal details: create (`11-goal-new-numeric`)

**Desktop:** `max-w-[1080px]`, `grid-cols-[1fr_320px] gap-8`: form card left, sticky **Preview** right. **Mobile:** form only, no preview, fixed "Create goal" footer.

Form card (`bh-card`, fields `gap-6`). **Basic fields, always visible:**
1. **Identity row:** lg EmojiTile button (opens the emoji + colour picker) + "Goal name" input (`text-[20px] font-semibold`, required, ≤60 chars).
2. **Category:** CategoryChip picker (one selected) + "+ New category" chip (opens the category dialog from 12b; the new category is selected on save). Mobile: scrolls sideways.
3. **Type:** SegmentedControl Numeric / Habit / Milestone + a one-line explanation of the selected type.
4. **Type block** (`bg-surface-2 rounded-lg p-4 gap-4`), depends on type:
   - **Numeric:** `grid-cols-3`: Start value, Target value (both with the unit as a suffix, Unbounded 20px digits, `inputmode="decimal"`) and Unit (free text: kg, min, km, pages, Rs). Mobile: start + target side by side, Unit full width below. **Direction** SegmentedControl ↗ Increase / ↘ Decrease, **set automatically** from start vs target (target < start → Decrease), with a sparkles hint saying so; the user can override. Under it a summary line: "**32 min** → **28 min** · 4 min to go". Validation: start ≠ target.
   - **Habit:** see 11b.
   - **Milestone:** a subtask list (add with Enter, drag to reorder, min 1).
5. **Target date** (optional): date button + "9 weeks" countdown right; help text "With a date, Bihan can tell if you're ahead or behind pace." Required for milestones (they have a due date).

**More options** (Disclosure, collapsed on create): **Why this matters** and **Start date** (default today, can't be after the target date).

**Preview card** (desktop): the real GoalCard updated live as you type: Calibrating ring, emoji tile, chip and meta, plus a tip: "Your grade shows up after 3 days of check-ins."

**Primary:** "Create goal" (disabled until name + required type fields are valid). On success: go to the new Goal detail and show a toast.

### 11b. Goal details: edit (`11b-goal-edit-habit`, More options open)

- Title "Edit goal", subtitle "Started Oct 1 · 23 check-ins". Top bar: "‹ Goal", Cancel (ghost, desktop), "Save changes".
- **Type is locked** once a goal has check-ins: SegmentedControl disabled + a note with a `lock` icon: "Type can't change once a goal has check-ins."
- **Habit block:** "How often?" SegmentedControl **Every day / Per week / Pick days**:
  - Every day → nothing else.
  - Per week → Stepper (1-7) + "times a week".
  - Pick days → WeekdayPicker + summary line.
- **Why this matters:** textarea (3 rows), placeholder "e.g. Play futsal again without getting gassed", max **140 characters** with a counter, help "Shown on the check-in screen, as a reminder." (quote icon).
- **Archive or delete** block at the bottom (edit only), `border-t`: "Archive" (secondary, keeps history, moves the goal to Goals › Archived) and "Delete" (danger, confirm dialog naming the goal; removes check-ins too).
- Preview shows the current score and labels "Unsaved changes"; tip: "Changing the schedule only affects days from today on. Past check-ins and scores stay as they are."
- Leaving with unsaved changes asks to discard.

### 11c. Emoji and colour picker open (`11c-goal-emoji-picker`)

- Desktop: popover under the tile (see EmojiPicker). Colour row first, because it's the quicker choice, then search, then emoji sections with "Suggested for running" at the top.
- Mobile: bottom sheet over a scrim, same order.
- The tile, the preview card and the category default all update live. If the user never picks a colour, the goal uses its category's colour.

### 12. Settings › Categories (`12-settings-categories`)

- Settings page in the app shell (Settings active). Tabs (underline style, active `border-b-2 border-gold text-ink`): Profile, **Categories**, Scoring, Notifications, Data. Scrolls sideways on mobile.
- Content `max-w-[820px]`: one card with header "Categories" + "Group your goals. Each category gets its own score on the dashboard. Drag to reorder." + primary small "New category".
- Rows (`grid-cols-[20px_40px_1fr_auto]`, `border-t`): drag handle (`grip-vertical`, desktop only; on mobile long-press to drag), md EmojiTile, name + "Default" `bh-chip` for the 4 seeded ones, "2 goals" / "No goals yet", then Edit (pencil) and ⋯ icon buttons (40px).
- ⋯ menu: Edit, Delete. **Default categories** can be renamed and recoloured but not deleted. **Deleting** a category with goals opens a confirm that asks where to move them (a category picker); empty categories delete straight away with an Undo toast.
- Order here = order on the dashboard's category card, filters and pickers. The dashboard category card shows the first 4 with goals plus "All categories".
- Max 12 categories.

### 12b. New / edit category dialog (`12b-category-dialog`)

- Desktop: modal 480px (same frame as check-in). Mobile: bottom sheet. Opened from Settings or from "+ New category" in the goal form.
- Fields: lg EmojiTile (live) + **Name** (required, ≤24 chars, unique per user) → **Colour** (ColourSwatches) → **Emoji** (search + grid, 2 rows visible, scrolls) → **Preview** (the CategoryChip as it will appear).
- Footer: Cancel (ghost, desktop) + "Create category" / "Save changes".

### Data needed (proposal for the Tech Lead, changes schema and API)

- `categories`: `id`, `user_id`, `name` (≤24), `emoji` (text, one grapheme), `color` (enum of the 10 identity names), `sort_order`, `is_default`, `created_at`. Seed the 4 defaults per user on register. **Replaces the fixed category enum** on goals with `category_id` (FK).
- `goals` new/changed columns: `emoji`, `color` (nullable → falls back to category colour), `start_value`, `target_value`, `unit`, `direction` (`increase` | `decrease`), `frequency_type` (`daily` | `per_week` | `weekdays`), `times_per_week` (1-7), `weekdays` (bitmask or smallint[] 1=Mon … 7=Sun), `why` (≤140, nullable), `start_date`, `archived_at`.
- **Scoring impact:** numeric progress must use `(current - start) / (target - start)` so decreasing goals work; habit "expected check-ins" must come from the frequency (daily = 7/wk, per_week = N, weekdays = the selected days only, so missing a non-scheduled day costs nothing). The scoring-engine agent needs to update its functions and tests.
- Endpoints: `GET/POST/PATCH/DELETE /categories`, `PATCH /categories/order`, and the new goal fields on `POST/PATCH /goals`. Templates stay frontend-only in v1.
