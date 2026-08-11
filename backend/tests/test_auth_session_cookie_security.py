from starlette.requests import Request

from app.services.auth_session import _append_spa_auth_fragment, _should_use_secure_cookie


def test_append_spa_auth_fragment_adds_bearer_token_to_hash():
    url = "http://localhost:9091/login/callback?success=1"
    result = _append_spa_auth_fragment(
        url,
        "jwt-token-abc",
        redirect_path="/organization",
        user=None,
    )
    assert result.startswith("http://localhost:9091/login/callback?success=1#")
    assert "access_token=jwt-token-abc" in result
    assert "token_type=bearer" in result
    assert "redirect_path=%2Forganization" in result


def test_append_spa_auth_fragment_includes_user_fields():
    from app.models import User

    user = User(
        id=7,
        username="orgadmin",
        email="admin@example.com",
        hashed_password="x",
        is_active=True,
        is_admin=True,
    )
    result = _append_spa_auth_fragment(
        "http://localhost:9091/login/callback?success=1",
        "jwt-token-abc",
        redirect_path="/organization",
        user=user,
    )
    assert "user_id=7" in result
    assert "username=orgadmin" in result
    assert "email=admin%40example.com" in result
    assert "is_admin=1" in result


def test_append_spa_auth_fragment_preserves_existing_hash():
    url = "http://localhost:9091/login/callback?success=1#existing=1"
    result = _append_spa_auth_fragment(url, "jwt-token-abc")
    assert result.startswith("http://localhost:9091/login/callback?success=1#")
    assert "existing=1" in result
    assert "access_token=jwt-token-abc" in result


def test_secure_cookie_disabled_for_localhost_even_with_forwarded_https():
    req = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/",
            "scheme": "http",
            "server": ("localhost", 8002),
            "headers": [(b"x-forwarded-proto", b"https")],
        }
    )
    assert _should_use_secure_cookie(req) is False


def test_secure_cookie_enabled_for_forwarded_https_non_localhost():
    req = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/",
            "scheme": "http",
            "server": ("api.example.com", 80),
            "headers": [(b"x-forwarded-proto", b"https")],
        }
    )
    assert _should_use_secure_cookie(req) is True
