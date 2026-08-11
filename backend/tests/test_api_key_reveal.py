import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.routes.api_keys import _full_api_key_token, _get_owned_api_key


def test_full_api_key_token_accepts_valid_key():
    api_key = SimpleNamespace(key="rgs_live_abcdefghijklmnop")
    assert _full_api_key_token(api_key) == "rgs_live_abcdefghijklmnop"


def test_full_api_key_token_rejects_masked_preview():
    api_key = SimpleNamespace(key="rgs_live_7TV...Qtss")
    with pytest.raises(HTTPException) as exc:
        _full_api_key_token(api_key)
    assert exc.value.status_code == 404


def test_full_api_key_token_rejects_empty_key():
    api_key = SimpleNamespace(key="")
    with pytest.raises(HTTPException) as exc:
        _full_api_key_token(api_key)
    assert exc.value.status_code == 404


def test_get_owned_api_key_not_found():
    class _Query:
        def filter(self, *args, **kwargs):
            return self

        def first(self):
            return None

    class _Db:
        def query(self, *args, **kwargs):
            return _Query()

    user = SimpleNamespace(id=1)
    with pytest.raises(HTTPException) as exc:
        _get_owned_api_key(_Db(), uuid.uuid4(), user)
    assert exc.value.status_code == 404
