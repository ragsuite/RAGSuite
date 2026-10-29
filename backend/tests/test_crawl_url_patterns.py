from app.services.crawl_url_patterns import matches_url_pattern, origin_host


def test_origin_deny_matches_host_slash_and_subpaths():
    pattern = "https://docs.example.com/"
    assert origin_host(pattern) == "https://docs.example.com"
    assert matches_url_pattern("https://docs.example.com", pattern)
    assert matches_url_pattern("https://docs.example.com/", pattern)
    assert matches_url_pattern("https://docs.example.com/ce-ee", pattern)


def test_origin_deny_does_not_match_path_on_another_host():
    pattern = "https://docs.example.com/"
    assert not matches_url_pattern("https://example.com/docs", pattern)
    assert not matches_url_pattern("https://example.com/", pattern)


def test_path_wildcard_still_matches_paths_only():
    assert matches_url_pattern("https://example.com/admin/users", "/admin/*")
    assert matches_url_pattern("/admin/users", "/admin/*")
    assert not matches_url_pattern("https://example.com/about", "/admin/*")
    assert not matches_url_pattern("https://docs.example.com/ce-ee", "/admin/*")


def test_wildcard_host_pattern_still_works():
    assert matches_url_pattern("https://docs.example.com/ce-ee", "https://docs.example.com/*")
    assert not matches_url_pattern("https://example.com/docs", "https://docs.example.com/*")
