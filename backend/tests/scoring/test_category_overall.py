from datetime import date

from backend.scoring.engine import category_score, overall_score, score_goal
from backend.scoring.formulas import is_scorable_status
from backend.scoring.types import CategoryScoreInput, GoalStatus, WeightedScore

from .factories import make_goal


def test_category_score_weighted_average():
    scores = [WeightedScore(score=80, weight=1.0), WeightedScore(score=60, weight=1.0)]
    assert category_score(scores) == 70


def test_category_score_respects_goal_weight():
    scores = [WeightedScore(score=90, weight=3.0), WeightedScore(score=30, weight=1.0)]
    # (90*3 + 30*1) / 4 = 300/4 = 75
    assert category_score(scores) == 75


def test_category_score_empty_is_none():
    assert category_score([]) is None


def test_category_score_zero_total_weight_is_none():
    scores = [WeightedScore(score=80, weight=0.0), WeightedScore(score=60, weight=0.0)]
    assert category_score(scores) is None


def test_overall_score_weighted_average_of_categories():
    categories = [
        CategoryScoreInput(category="fitness", score=80, weight=1.0),
        CategoryScoreInput(category="study", score=40, weight=1.0),
    ]
    assert overall_score(categories) == 60


def test_overall_score_excludes_category_with_no_active_goals():
    categories = [
        CategoryScoreInput(category="fitness", score=80, weight=1.0),
        CategoryScoreInput(category="career", score=None, weight=1.0),  # no active goals
    ]
    # If "career" were wrongly treated as 0, this would be 40, not 80.
    assert overall_score(categories) == 80


def test_overall_score_all_categories_excluded_is_none():
    categories = [
        CategoryScoreInput(category="fitness", score=None, weight=1.0),
        CategoryScoreInput(category="study", score=None, weight=1.0),
    ]
    assert overall_score(categories) is None


def test_is_scorable_status_excludes_archived():
    assert is_scorable_status(GoalStatus.ACTIVE) is True
    assert is_scorable_status(GoalStatus.COMPLETED) is True
    assert is_scorable_status(GoalStatus.ARCHIVED) is False


def test_end_to_end_archived_goal_excludes_category_from_overall():
    today = date(2024, 2, 14)
    # "career" category has a single goal, but it's archived -> not scorable ->
    # category_score([]) is None -> excluded from overall_score.
    archived_goal = make_goal(
        status=GoalStatus.ARCHIVED,
        start_date=date(2024, 1, 1),
        created_at=date(2024, 1, 1),
        deadline=date(2024, 3, 1),
        target_value=100,
        current_value=10,
    )
    fitness_goal = make_goal(
        status=GoalStatus.ACTIVE,
        start_date=date(2024, 1, 1),
        created_at=date(2024, 1, 1),
        deadline=date(2024, 3, 1),
        target_value=100,
        current_value=100,
    )

    career_scores = [
        WeightedScore(score=score_goal(archived_goal, [], [], today).total, weight=archived_goal.weight)
        for g in [archived_goal]
        if is_scorable_status(g.status)
    ]
    fitness_scores = [
        WeightedScore(score=score_goal(fitness_goal, [], [], today).total, weight=fitness_goal.weight)
        for g in [fitness_goal]
        if is_scorable_status(g.status)
    ]

    career_score = category_score(career_scores)
    fitness_score = category_score(fitness_scores)

    assert career_score is None
    assert fitness_score is not None

    overall = overall_score(
        [
            CategoryScoreInput(category="career", score=career_score, weight=1.0),
            CategoryScoreInput(category="fitness", score=fitness_score, weight=1.0),
        ]
    )
    assert overall == fitness_score
