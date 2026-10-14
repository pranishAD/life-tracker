# Life Tracker — User Stories (v1 / MVP)

Each story has an ID so QA can map tests to it. Acceptance criteria use Given/When/Then.

---

## 1. Auth

### US-01 — Sign up
As a new user, I want to sign up with email and password, so that I can start tracking my goals.

- Given I am on the sign-up page, when I submit a valid name, email, and password, then my account is created and I am logged in.
- Given I try to sign up with an email that is already registered, when I submit the form, then I see an error and no duplicate account is created.
- Given I submit a password that does not meet the minimum requirements, when I submit the form, then I see a validation error and no account is created.

### US-02 — Log in
As a returning user, I want to log in with my email and password, so that I can access my tracked goals.

- Given I have a registered account, when I enter the correct email and password, then I am logged in and taken to my dashboard.
- Given I enter an incorrect password, when I submit the login form, then I see an error and I am not logged in.
- Given I enter an email that is not registered, when I submit the login form, then I see an error and I am not logged in.

### US-03 — Log out
As a logged-in user, I want to log out, so that my account is protected on a shared device.

- Given I am logged in, when I click log out, then my session ends and I am returned to the login page.
- Given I am logged out, when I try to open a page that requires login, then I am redirected to the login page.

---

## 2. Goals CRUD with categories

### US-04 — Create a goal
As a user, I want to create a goal and assign it a category, so that I can organize my goals by life area.

- Given I am on the goals page, when I create a goal with a title, category (Fitness, Study, Career, or Custom), and type, then the goal appears in my goals list with status "active".
- Given I try to create a goal without a title, when I submit the form, then I see a validation error and the goal is not created.

### US-05 — View and filter goals
As a user, I want to see all my goals and filter them by category, so that I can focus on one life area at a time.

- Given I have goals in more than one category, when I open the goals list, then I can filter the list by category.
- Given I have no goals yet, when I open the goals list, then I see an empty state inviting me to create my first goal.

### US-06 — Edit a goal
As a user, I want to edit a goal's details, so that I can fix mistakes or adjust it as my situation changes.

- Given I own a goal, when I change its title, description, category, deadline, or weight and save, then the updated details show everywhere the goal appears (goal list, detail page, dashboard).
- Given I edit a goal, when I save with an invalid value (e.g. empty title), then I see a validation error and the previous details are kept.

### US-07 — Delete a goal
As a user, I want to delete a goal, so that I can remove goals I no longer care about.

- Given I own a goal with no check-ins, when I delete it, then it is removed and no longer appears in my goals list or dashboard.
- Given I own a goal, when I choose delete, then I am asked to confirm before it is actually removed.

---

## 3. Goal types (Numeric, Habit, Milestone)

### US-08 — Numeric goal
As a user, I want to create a numeric goal with a target value and unit, so that I can track measurable progress like weight lifted.

- Given I create a numeric goal with a target_value and unit, when I view the goal, then its progress shows as current_value / target_value.
- Given a numeric goal has no check-ins yet, when I view the goal, then current_value is 0 and progress shows 0%.

### US-09 — Habit goal
As a user, I want to create a habit goal with a weekly frequency, so that I can track things I want to do regularly, like going to the gym 5 times a week.

- Given I create a habit goal with frequency_per_week = 5, when I view the goal mid-week, then progress shows as "check-ins so far this week / 5".
- Given a new week starts, when I view a habit goal, then its weekly check-in count resets to 0 for the new week.

### US-10 — Milestone goal
As a user, I want to create a milestone goal with subtasks and a deadline, so that I can track a project like finishing an assignment.

- Given I create a milestone goal with a deadline, when I add subtasks, then each subtask appears in the goal's subtask list as "not done".
- Given a milestone goal has 4 subtasks and I mark 2 as done, when I view the goal, then progress shows 50% (2/4).
- Given a milestone goal has all subtasks marked done, when I view the goal, then progress shows 100% and I can mark the goal as completed.

---

## 4. Check-ins

### US-11 — Log a check-in
As a user, I want to log a check-in on a goal with a value, note, effort rating, and date, so that I can record my progress and how hard it felt.

- Given I am on a goal's page, when I submit a check-in with an effort rating (1-5) and a date, then the check-in is saved and the goal's progress and score update.
- Given the goal type is Habit, when I submit a check-in without a value, then the check-in is still accepted because value is optional for habit goals.
- Given the goal type is Numeric, when I submit a check-in with a value, then the goal's current_value updates based on that check-in.
- Given I submit a check-in with an effort rating outside 1-5, when I submit the form, then I see a validation error and the check-in is not saved.

### US-12 — Delete a check-in
As a user, I want to delete a check-in I logged by mistake, so that my history and score stay accurate.

- Given I have logged a check-in, when I delete it, then it no longer appears in the check-in history and the goal's score recalculates without it.

---

## 5. Scoring engine

### US-13 — Goal score and grade
As a user, I want each goal to show a 0-100 score and grade, so that I know at a glance how I'm doing on it.

- Given a goal has pace, consistency, momentum, and effort values, when its score is calculated, then score = round(100 * (0.4*pace + 0.3*consistency + 0.2*momentum + 0.1*effort)).
- Given a goal's score is 90 or above, when I view the goal, then I see grade "S - Locked In".
- Given a goal's score is 75-89, when I view the goal, then I see grade "A - Strong".
- Given a goal's score is 60-74, when I view the goal, then I see grade "B - On Track".
- Given a goal's score is 40-59, when I view the goal, then I see grade "C - Slipping".
- Given a goal's score is 0-39, when I view the goal, then I see grade "D - Off Track".
- Given I log a new check-in, when it is saved, then the goal's score recalculates immediately.
- Given a day passes, when the daily scoring job runs, then a snapshot of the goal's score for that day is stored for trend charts.

### US-14 — Category and overall score
As a user, I want my goals rolled up into category scores and one overall score, so that I can see how I'm doing by life area and overall.

- Given I have multiple active goals in the Fitness category, when the category score is calculated, then it equals the weighted average of those goals' scores (using each goal's weight, default 1).
- Given I have active goals in multiple categories, when the overall score is calculated, then it equals the weighted average of category scores using my category weights (default equal).
- Given a category has no active goals, when the overall score is calculated, then that category is excluded from the calculation.

---

## 6. Dashboard

### US-15 — Dashboard overview
As a user, I want a dashboard showing my overall score, category scores, streaks, and a trend chart, so that I can see my progress at a glance.

- Given I have active goals, when I open the dashboard, then I see my overall score, a score per category, and my current streak(s).
- Given I have check-in and score history, when I open the dashboard, then I see a trend chart that I can switch between 7-day and 30-day views.
- Given one or more goals is scoring low or dropping, when I open the dashboard, then those goals appear in a "needs attention" list.

---

## 7. Goal detail page

### US-16 — Goal detail breakdown
As a user, I want a goal detail page showing progress, score breakdown, and check-in history, so that I can understand exactly why a goal is scored the way it is.

- Given I open a goal's detail page, when it loads, then I see a progress bar matching the goal's current progress.
- Given I open a goal's detail page, when it loads, then I see the score broken into pace, consistency, momentum, and effort.
- Given I open a goal's detail page, when it loads, then I see a chronological list of all check-ins with date, value, note, and effort rating.
- Given I open a goal's detail page, when it loads, then I see a chart of the goal's score or progress over time.

---

## 8. Weekly review page

### US-17 — Weekly review
As a user, I want a weekly review comparing this week to last week, so that I can see if I'm improving overall.

- Given I open the weekly review for a given week, when it loads, then I see my overall score change versus the previous week.
- Given I open the weekly review, when it loads, then I see which goal performed best that week.
- Given I open the weekly review, when it loads, then I see which goal is slipping the most that week.
- Given I do not have a full week of history yet, when I open the weekly review, then I see a message explaining there is not enough history yet, instead of a broken or misleading comparison.

---

## 9. Settings

### US-18 — Category weights
As a user, I want to set my own category weights, so that the categories I care about most count more in my overall score.

- Given I am on the settings page, when I set Fitness weight higher than Study and Career and save, then my overall score calculation uses those weights going forward.
- Given I have not set any custom weights, when my overall score is calculated, then all categories are weighted equally by default.

### US-19 — Profile
As a user, I want to update my profile name, so that my account reflects who I am.

- Given I am on the settings page, when I update my name and save, then the updated name appears wherever my profile is shown.

---

## Edge cases

### EC-01 — Goal with no deadline
- Given a goal has no deadline, when its score is calculated, then pace = consistency (consistency-only pace, per the scoring rules), not a divide-by-zero or error.

### EC-02 — Check-in logged for a past date
- Given I log a check-in and set its date to an earlier date than today, when I save it, then it is accepted, stored under that past date, and used to recalculate consistency, momentum, and pace for the periods it falls into.

### EC-03 — Two check-ins on the same day
- Given a goal already has a check-in logged for today, when I log a second check-in for today, then both are saved as separate check-ins, and the goal's current_value/progress reflects the combined effect of both (e.g. numeric goals sum or take the latest value, per the goal's logic), with consistency counting the day as checked-in (not double-counted).

### EC-04 — Deleting a goal with history
- Given a goal has one or more check-ins, when I try to delete it, then I see a confirmation warning that this will also remove its check-in history, and the goal plus its check-ins and score snapshots are removed only after I confirm.

### EC-05 — Editing a target after check-ins exist
- Given a numeric goal already has check-ins logged against its current target_value, when I edit the target_value, then existing check-ins are kept unchanged, and progress/score are recalculated using the new target_value going forward (history is not rewritten).

### EC-06 — Over-achievement (current > target)
- Given a numeric goal's current_value exceeds its target_value, when I view the goal, then progress displays as 100% (not over 100%), and pace used in scoring is capped at 1.0 as defined in the scoring rules.

### EC-07 — Goal under 3 days old ("Calibrating")
- Given a goal was created less than 3 days ago, when I view its score, then I see "Calibrating" instead of a numeric score and grade.
- Given a goal passes the 3-day mark, when its score is next recalculated, then it shows a normal numeric score and grade instead of "Calibrating".

### EC-08 — Completed goal score freezing
- Given a goal's status changes to "completed", when I view it afterward, then its score stays fixed at the value it had at completion, even if time passes or the daily scoring job runs again.

### EC-09 — User with zero goals (empty dashboard)
- Given a user has no goals at all, when they open the dashboard, then they see an empty state (no overall score, no category scores, no trend chart) with a clear prompt to create their first goal, and no errors are shown.

### EC-10 — Category with no active goals
- Given a user has goals in some categories but none in another (e.g. no Career goals), when the dashboard or overall score is shown, then that empty category is excluded from the overall score calculation and shown as "no active goals" rather than a score of 0.
