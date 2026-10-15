# Bihan — Components

Source of truth for values: `design/tokens.json` and `design/tailwind.config.snippet.js`.
Live reference (all components rendered): the "Bihan" design system page in claude.ai.

## Global rules

- v1 is dark only. Body: `bg-bg text-ink font-sans antialiased`.
- **Grade colours are reserved.** `grade-s` … `grade-d` only appear on things that carry that grade: rings, badges, progress fills, chart lines, grade labels. Never on category tags or decoration.
- **Only S glows.** `shadow-glow-s` is used on the S badge and S ring and nowhere else.
- `grade-d` is also the error/destructive colour. There is no other red.
- Grade from score: 90-100 S "Locked In", 75-89 A "Strong", 60-74 B "On Track", 40-59 C "Slipping", 0-39 D "Off Track". Goals under 3 days old are "Calibrating" (grey, no grade).
- The grade letter always sits next to its colour, so colour is never the only signal.
- Icons: Lucide, 2px stroke, 20px default / 16px inline, `text-ink-muted` or `text-ink`. Fitness = `dumbbell`, Study = `book-open`, Career = `briefcase`, Custom = `sparkles`. No emoji in the UI.
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
| hero | 220px (180px mobile) | 18px | `text-score-hero` (`text-score-hero-mobile`) | Dashboard overall score |
| md | 140px | 12px | `text-score-md` | Goal detail, weekly review |
| sm | 64px | 6px | `text-score-sm` | Goal cards, category scores |

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

- Layout: top row = category chip + title + meta (left), sm ScoreRing (right). Then thin ProgressBar. Bottom row = grade label (left), one stat (right).
- Chip: `text-label uppercase text-ink-muted bg-surface-2 rounded-sm px-2 py-1`.
- Title `text-heading-md`, meta `text-body-sm text-ink-muted` ("Numeric · 72 / 80 kg", "Milestone · 3 / 8 · due Oct 24", "Habit · started 2 days ago").
- Stat: habits = "12-day streak", behind pace = "Behind pace", milestones = subtasks done.
- Padding `p-5`, width fills its grid cell (3 columns desktop, 1 column mobile).

---

## Screens

**Not designed yet.** The 6 screen layouts (Login/Register, Dashboard, Goals list, Goal detail, Check-in modal, Weekly review), desktop + mobile, are added here once each is approved.
