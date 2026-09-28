"""Recent searches limit on search customization (1-5, default 5)."""
import pytest
from pydantic import ValidationError

from app.schemas import SearchCustomizationOut, SearchCustomizationUpdate
from app.services.search_customization import (
    RECENT_SEARCH_LIMIT_DEFAULT,
    RECENT_SEARCH_LIMIT_MAX,
    clamp_recent_search_limit,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (None, 5),
        (1, 1),
        (3, 3),
        (5, 5),
        (0, 1),
        (-2, 1),
        (9, 5),
        (2.9, 2),
        ("3", RECENT_SEARCH_LIMIT_DEFAULT),
        (True, RECENT_SEARCH_LIMIT_DEFAULT),
    ],
)
def test_clamp_recent_search_limit(raw, expected):
    assert clamp_recent_search_limit(raw) == expected


def test_max_is_five():
    assert RECENT_SEARCH_LIMIT_MAX == 5


def test_update_schema_accepts_one_to_five():
    assert SearchCustomizationUpdate(recentSearchLimit=1).recentSearchLimit == 1
    assert SearchCustomizationUpdate(recentSearchLimit=5).recentSearchLimit == 5
    assert SearchCustomizationUpdate().recentSearchLimit is None


@pytest.mark.parametrize("bad", [0, 6, -1, 50])
def test_update_schema_rejects_out_of_range(bad):
    with pytest.raises(ValidationError):
        SearchCustomizationUpdate(recentSearchLimit=bad)


def test_out_schema_defaults_to_five():
    assert SearchCustomizationOut().recentSearchLimit == 5
