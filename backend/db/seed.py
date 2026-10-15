"""Dev-only seed script: wipes and recreates two demo users with realistic
goals/milestones/check-ins/category-weights, then runs every goal through
the real scoring engine (backend/scoring) to populate score_snapshots.

That last part is deliberate, not decorative: it's the cheapest way to prove
the ORM models in app/models line up with what backend/scoring/types.py and
engine.score_goal() actually expect field-for-field, with zero mocking.

Run from `backend/` (the Dockerfile's WORKDIR /app, same dir as this file's
grandparent):

    docker compose exec backend python -m db.seed
    # or, outside Docker, with backend/ as cwd:
    cd backend && python -m db.seed

Safe to re-run: it deletes the two seed users (by email) first; ON DELETE
CASCADE takes their goals/milestones/check-ins/snapshots/category_weights
with them, then everything is recreated fresh.
"""

from __future__ import annotations

import random
import sys
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Optional, Sequence

# Make `app`, `db`, `scoring` importable regardless of invocation cwd (same
# shim as db/migrations/env.py and backend/tests/scoring/conftest.py).
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from passlib.context import CryptContext  # noqa: E402
from sqlalchemy import func, select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.models import (  # noqa: E402
    Category,
    CategoryWeight,
    CheckIn,
    Goal,
    GoalStatus,
    GoalType,
    Milestone,
    ScoreSnapshot,
    User,
)
from db.session import SessionLocal  # noqa: E402
from scoring import (  # noqa: E402
    CheckIn as SCheckIn,
    Goal as SGoal,
    GoalStatus as SGoalStatus,
    GoalType as SGoalType,
    Milestone as SMilestone,
    score_goal,
)

RNG_SEED = 42
TODAY = date.today()
SNAPSHOT_WINDOW_DAYS = 30  # how many trailing days of score_snapshots to build per goal

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def created_at_for(d: date) -> datetime:
    """Backdate a goal's `created_at` to match its `start_date` (9am UTC),
    instead of leaving it at the server default (= actual seed-script run
    time). Without this every seeded goal would look "under 3 days old" to
    `is_calibrating()` and every score_snapshot.total would come out NULL --
    found by actually running the scoring engine over the seed data (see
    build_snapshots below), which is the point of doing that at all.
    """
    return datetime.combine(d, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=9)


def hash_password(raw: str) -> str:
    """backend-dev: use passlib's bcrypt scheme the same way for
    register/login so these seeded hashes verify correctly --
    `pwd_context.verify(plain, user.password_hash)`.
    """
    return pwd_context.hash(raw)


# --------------------------------------------------------------------------
# Scoring-engine bridges: ORM row -> plain scoring dataclass. backend-dev's
# service layer will need the same conversions when computing scores from
# real request data -- see the handoff note for where this should eventually
# live (probably backend/app/services/scoring_service.py, not here).
# --------------------------------------------------------------------------


def to_scoring_goal(goal: Goal) -> SGoal:
    return SGoal(
        type=SGoalType(goal.type.value),
        status=SGoalStatus(goal.status.value),
        start_date=goal.start_date,
        created_at=goal.created_at.date(),
        target_value=float(goal.target_value) if goal.target_value is not None else None,
        current_value=float(goal.current_value) if goal.current_value is not None else None,
        frequency_per_week=(
            float(goal.frequency_per_week) if goal.frequency_per_week is not None else None
        ),
        deadline=goal.deadline,
        weight=float(goal.weight),
    )


def to_scoring_check_in(check_in: CheckIn) -> SCheckIn:
    return SCheckIn(
        logged_for=check_in.logged_for,
        effort_rating=check_in.effort_rating,
        value=float(check_in.value) if check_in.value is not None else None,
    )


def to_scoring_milestone(milestone: Milestone, as_of: date) -> SMilestone:
    """A milestone "as of" a given day: done_at hasn't happened yet from that
    day's point of view if it's in the future relative to `as_of`.
    """
    done_at_date = milestone.done_at.date() if milestone.done_at else None
    is_done_as_of = bool(milestone.is_done and done_at_date is not None and done_at_date <= as_of)
    return SMilestone(is_done=is_done_as_of, done_at=done_at_date if is_done_as_of else None)


def build_snapshots(goal: Goal, check_ins: Sequence[CheckIn], milestones: Sequence[Milestone]) -> list[ScoreSnapshot]:
    """Run the real scoring engine for each of the last SNAPSHOT_WINDOW_DAYS
    days (clipped to the goal's lifetime) and turn the results into
    ScoreSnapshot rows -- exercises engine.score_goal with real ORM-derived
    data, not just unit-test factories.
    """
    scoring_goal = to_scoring_goal(goal)
    all_check_ins = [to_scoring_check_in(c) for c in check_ins]

    window_start = max(goal.start_date, TODAY - timedelta(days=SNAPSHOT_WINDOW_DAYS - 1))
    snapshots: list[ScoreSnapshot] = []

    d = window_start
    while d <= TODAY:
        check_ins_upto = [c for c in all_check_ins if c.logged_for <= d]
        milestones_as_of = [to_scoring_milestone(m, d) for m in milestones]
        result = score_goal(scoring_goal, check_ins_upto, milestones_as_of, today=d)

        # Convention: store NULL total while the goal is "Calibrating" to
        # match api-contract.yaml's ScoreSnapshot.total ("null while grade is
        # Calibrating"), even though score_goal() itself always returns a
        # numeric total. backend-dev's live snapshot job can follow the same
        # rule or choose differently -- this is a service-layer decision.
        total = None if result.grade == "Calibrating" else result.total

        snapshots.append(
            ScoreSnapshot(
                goal_id=goal.id,
                snapshot_date=d,
                pace=Decimal(str(round(result.breakdown.pace, 4))),
                consistency=Decimal(str(round(result.breakdown.consistency, 4))),
                momentum=Decimal(str(round(result.breakdown.momentum, 4))),
                effort=Decimal(str(round(result.breakdown.effort, 4))),
                total=total,
            )
        )
        d += timedelta(days=1)

    return snapshots


# --------------------------------------------------------------------------
# Check-in generation
# --------------------------------------------------------------------------


def make_check_ins(
    goal: Goal,
    start: date,
    end: date,
    *,
    skip_prob: float,
    value_fn=None,
    note_pool: Optional[Sequence[str]] = None,
    rng: random.Random,
) -> list[CheckIn]:
    """One check-in per non-skipped day in [start, end], with varying effort
    and an optional, type-appropriate `value`.
    """
    check_ins: list[CheckIn] = []
    d = start
    day_index = 0
    while d <= end:
        if rng.random() >= skip_prob:
            effort_rating = rng.choices([1, 2, 3, 4, 5], weights=[3, 8, 24, 40, 25])[0]
            value = value_fn(day_index, d) if value_fn else None
            note = rng.choice(note_pool) if note_pool and rng.random() < 0.3 else None
            check_ins.append(
                CheckIn(
                    goal_id=goal.id,
                    value=Decimal(str(round(value, 2))) if value is not None else None,
                    note=note,
                    effort_rating=effort_rating,
                    logged_for=d,
                )
            )
        d += timedelta(days=1)
        day_index += 1
    return check_ins


# --------------------------------------------------------------------------
# Seed data builders, one per demo user
# --------------------------------------------------------------------------


def seed_demo_user(session: Session, rng: random.Random) -> User:
    user = User(
        name="Demo User",
        email="demo@lifetracker.dev",
        password_hash=hash_password("demo1234"),
    )
    session.add(user)
    session.flush()  # assign user.id

    session.add_all(
        [
            CategoryWeight(user_id=user.id, category=Category.FITNESS, weight=Decimal("1.5")),
            CategoryWeight(user_id=user.id, category=Category.STUDY, weight=Decimal("1.0")),
            CategoryWeight(user_id=user.id, category=Category.CAREER, weight=Decimal("1.2")),
            CategoryWeight(user_id=user.id, category=Category.CUSTOM, weight=Decimal("0.8")),
        ]
    )

    # 1. Fitness / numeric, with deadline -> exercises linear pace.
    bench = Goal(
        user_id=user.id,
        title="Bench press 80kg",
        description="Progressive overload, 3x/week.",
        category=Category.FITNESS,
        type=GoalType.NUMERIC,
        target_value=Decimal("80"),
        current_value=Decimal("50"),  # overwritten below from the last check-in
        unit="kg",
        frequency_per_week=3,
        start_date=TODAY - timedelta(days=45),
        deadline=TODAY + timedelta(days=30),
        weight=Decimal("1.5"),
        status=GoalStatus.ACTIVE,
        created_at=created_at_for(TODAY - timedelta(days=45)),
    )
    session.add(bench)
    session.flush()

    def bench_value(day_index: int, _d: date) -> float:
        # Roughly linear 50kg -> ~68kg over 45 days, plus a little noise.
        progressed = 50 + (18 * day_index / 45)
        return progressed + rng.uniform(-1.0, 1.0)

    bench_check_ins = make_check_ins(
        bench,
        bench.start_date,
        TODAY,
        skip_prob=0.35,
        value_fn=bench_value,
        note_pool=["Felt strong today", "Grip gave out early", "New rep PR", "Deload day"],
        rng=rng,
    )
    session.add_all(bench_check_ins)
    session.flush()
    latest_bench = max(bench_check_ins, key=lambda c: c.logged_for, default=None)
    if latest_bench is not None and latest_bench.value is not None:
        bench.current_value = latest_bench.value

    # 2. Study / habit, with deadline -> exercises habit pace (frequency * weeks).
    reading = Goal(
        user_id=user.id,
        title="Read 30 minutes daily",
        description="Technical reading for the semester.",
        category=Category.STUDY,
        type=GoalType.HABIT,
        frequency_per_week=5,
        start_date=TODAY - timedelta(days=30),
        deadline=TODAY + timedelta(days=30),
        weight=Decimal("1.0"),
        status=GoalStatus.ACTIVE,
        created_at=created_at_for(TODAY - timedelta(days=30)),
    )
    session.add(reading)
    session.flush()
    reading_check_ins = make_check_ins(
        reading,
        reading.start_date,
        TODAY,
        skip_prob=0.3,
        note_pool=["Finished a chapter", "Short session, was tired", "Great focus today"],
        rng=rng,
    )
    session.add_all(reading_check_ins)

    # 3. Career / milestone, with deadline -> exercises milestone-based pace/momentum.
    portfolio = Goal(
        user_id=user.id,
        title="Finish portfolio website",
        description="Ship v1 of the personal site before applying to jobs.",
        category=Category.CAREER,
        type=GoalType.MILESTONE,
        start_date=TODAY - timedelta(days=40),
        deadline=TODAY + timedelta(days=20),
        weight=Decimal("1.2"),
        status=GoalStatus.ACTIVE,
        created_at=created_at_for(TODAY - timedelta(days=40)),
    )
    session.add(portfolio)
    session.flush()

    def done_at(days_ago: int) -> datetime:
        return datetime.combine(TODAY - timedelta(days=days_ago), datetime.min.time(), tzinfo=timezone.utc)

    portfolio_milestones = [
        Milestone(
            goal_id=portfolio.id,
            title="Design wireframes",
            due_date=TODAY - timedelta(days=30),
            is_done=True,
            done_at=done_at(28),
        ),
        Milestone(
            goal_id=portfolio.id,
            title="Build homepage",
            due_date=TODAY - timedelta(days=15),
            is_done=True,
            done_at=done_at(10),
        ),
        Milestone(
            goal_id=portfolio.id,
            title="Build projects page",
            due_date=TODAY - timedelta(days=5),
            is_done=False,
            done_at=None,
        ),
        Milestone(
            goal_id=portfolio.id,
            title="Deploy and test",
            due_date=TODAY + timedelta(days=15),
            is_done=False,
            done_at=None,
        ),
    ]
    session.add_all(portfolio_milestones)
    portfolio_check_ins = make_check_ins(
        portfolio,
        portfolio.start_date,
        TODAY,
        skip_prob=0.6,  # sparser -- work-log style, not daily
        note_pool=["Worked on homepage layout", "Fixed responsive bugs", "Wrote project copy"],
        rng=rng,
    )
    session.add_all(portfolio_check_ins)

    # 4. Custom / habit, NO deadline -> exercises consistency-only pace (EC-01).
    meditate = Goal(
        user_id=user.id,
        title="Meditate 10 minutes",
        description="Daily calm-down habit, no fixed end date.",
        category=Category.CUSTOM,
        type=GoalType.HABIT,
        frequency_per_week=7,
        start_date=TODAY - timedelta(days=20),
        deadline=None,
        weight=Decimal("0.8"),
        status=GoalStatus.ACTIVE,
        created_at=created_at_for(TODAY - timedelta(days=20)),
    )
    session.add(meditate)
    session.flush()
    meditate_check_ins = make_check_ins(
        meditate,
        meditate.start_date,
        TODAY,
        skip_prob=0.25,
        rng=rng,
    )
    session.add_all(meditate_check_ins)

    session.flush()

    for goal, check_ins, milestones in (
        (bench, bench_check_ins, []),
        (reading, reading_check_ins, []),
        (portfolio, portfolio_check_ins, portfolio_milestones),
        (meditate, meditate_check_ins, []),
    ):
        session.add_all(build_snapshots(goal, check_ins, milestones))

    return user


def seed_second_user(session: Session, rng: random.Random) -> User:
    user = User(
        name="Priya Thapa",
        email="priya@lifetracker.dev",
        password_hash=hash_password("priya1234"),
    )
    session.add(user)
    session.flush()
    # Deliberately NO category_weights rows for this user -> exercises the
    # "default equal if unset" rule in GET /settings/category-weights.

    # 1. Fitness / numeric, cumulative-style value (contrast with the demo
    #    user's "latest reading" numeric goal -- both are valid; which one a
    #    given numeric goal means is an app-level convention, not enforced
    #    by the schema).
    pushups = Goal(
        user_id=user.id,
        title="1000 pushups this month",
        description=None,
        category=Category.FITNESS,
        type=GoalType.NUMERIC,
        target_value=Decimal("1000"),
        current_value=Decimal("0"),
        unit="reps",
        frequency_per_week=5,
        start_date=TODAY - timedelta(days=20),
        deadline=TODAY + timedelta(days=10),
        weight=Decimal("1"),
        status=GoalStatus.ACTIVE,
        created_at=created_at_for(TODAY - timedelta(days=20)),
    )
    session.add(pushups)
    session.flush()

    running_total = 0.0

    def pushup_value(_day_index: int, _d: date) -> float:
        nonlocal running_total
        reps = rng.randint(20, 60)
        running_total += reps
        return running_total

    pushup_check_ins = make_check_ins(
        pushups, pushups.start_date, TODAY, skip_prob=0.3, value_fn=pushup_value, rng=rng
    )
    session.add_all(pushup_check_ins)
    session.flush()
    if pushup_check_ins:
        pushups.current_value = max(pushup_check_ins, key=lambda c: c.logged_for).value

    # 2. Study / milestone, deadline soon -> higher-pressure pace example.
    assignment = Goal(
        user_id=user.id,
        title="Finish ITAP3010 assignment",
        description="Database design report.",
        category=Category.STUDY,
        type=GoalType.MILESTONE,
        start_date=TODAY - timedelta(days=14),
        deadline=TODAY + timedelta(days=7),
        weight=Decimal("1"),
        status=GoalStatus.ACTIVE,
        created_at=created_at_for(TODAY - timedelta(days=14)),
    )
    session.add(assignment)
    session.flush()

    def done_at(days_ago: int) -> datetime:
        return datetime.combine(TODAY - timedelta(days=days_ago), datetime.min.time(), tzinfo=timezone.utc)

    assignment_milestones = [
        Milestone(
            goal_id=assignment.id,
            title="Literature review",
            due_date=TODAY - timedelta(days=8),
            is_done=True,
            done_at=done_at(10),
        ),
        Milestone(
            goal_id=assignment.id,
            title="Draft report",
            due_date=TODAY - timedelta(days=2),
            is_done=False,
            done_at=None,
        ),
        Milestone(
            goal_id=assignment.id,
            title="Final submission",
            due_date=TODAY + timedelta(days=7),
            is_done=False,
            done_at=None,
        ),
    ]
    session.add_all(assignment_milestones)
    assignment_check_ins = make_check_ins(
        assignment,
        assignment.start_date,
        TODAY,
        skip_prob=0.55,
        note_pool=["Read source papers", "Drafted ER diagram", "Wrote intro section"],
        rng=rng,
    )
    session.add_all(assignment_check_ins)

    # 3. Career / habit, no deadline.
    job_apps = Goal(
        user_id=user.id,
        title="Apply to 3 jobs per week",
        description=None,
        category=Category.CAREER,
        type=GoalType.HABIT,
        frequency_per_week=3,
        start_date=TODAY - timedelta(days=21),
        deadline=None,
        weight=Decimal("1"),
        status=GoalStatus.ACTIVE,
        created_at=created_at_for(TODAY - timedelta(days=21)),
    )
    session.add(job_apps)
    session.flush()
    job_apps_check_ins = make_check_ins(
        job_apps,
        job_apps.start_date,
        TODAY,
        skip_prob=0.5,
        note_pool=["Applied to 2 roles", "Tailored resume + applied", "Referral application"],
        rng=rng,
    )
    session.add_all(job_apps_check_ins)

    session.flush()

    for goal, check_ins, milestones in (
        (pushups, pushup_check_ins, []),
        (assignment, assignment_check_ins, assignment_milestones),
        (job_apps, job_apps_check_ins, []),
    ):
        session.add_all(build_snapshots(goal, check_ins, milestones))

    return user


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------


def wipe_seed_users(session: Session) -> None:
    emails = ["demo@lifetracker.dev", "priya@lifetracker.dev"]
    existing = session.scalars(select(User).where(func.lower(User.email).in_(emails))).all()
    for user in existing:
        session.delete(user)  # ON DELETE CASCADE handles the rest at the DB level too
    session.flush()


def print_row_counts(session: Session) -> None:
    for model in (User, Goal, Milestone, CheckIn, ScoreSnapshot, CategoryWeight):
        count = session.scalar(select(func.count()).select_from(model))
        print(f"{model.__tablename__:<18} {count}")


def main() -> None:
    rng = random.Random(RNG_SEED)

    with SessionLocal() as session:
        wipe_seed_users(session)
        seed_demo_user(session, rng)
        seed_second_user(session, rng)
        session.commit()

        print("Seed complete. Row counts:")
        print_row_counts(session)


if __name__ == "__main__":
    main()
