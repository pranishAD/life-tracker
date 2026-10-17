import pytest

from scoring.formulas import grade

BOUNDARY_CASES = [
    (0, "D", "Off Track"),
    (39, "D", "Off Track"),
    (40, "C", "Slipping"),
    (59, "C", "Slipping"),
    (60, "B", "On Track"),
    (74, "B", "On Track"),
    (75, "A", "Strong"),
    (89, "A", "Strong"),
    (90, "S", "Locked In"),
    (100, "S", "Locked In"),
]


@pytest.mark.parametrize("score,letter,label", BOUNDARY_CASES)
def test_grade_boundaries(score, letter, label):
    result = grade(score)
    assert result.letter == letter
    assert result.label == label
