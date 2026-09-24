"""Structured UI workflow grounding for AI Assistant (route-slug bound, no phrase aliases)."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Optional

from .ui_catalog import (
    best_route_match,
    detect_embed_routes,
    embed_surface_for_route,
    query_has_embed_signal,
    resolve_label,
    tokens_from_i18n_prefixes,
    _tokenize,
)
from .ui_config_surfaces import (
    build_config_catalog_workflows_cached,
    build_config_setting_workflows_cached,
    detect_config_catalog_query,
    feature_match_score,
    is_config_catalog_workflow_key,
    is_config_settings_workflow_key,
    match_config_feature,
    panel_title_matches_query,
    product_tokens_for_route,
    query_has_config_feature_hit,
)
from .ui_app_surfaces import (
    build_app_surface_workflow_dicts,
    is_configuration_mcp_key,
    is_inventory_catalog_workflow_key,
    is_sources_connectors_catalog_key,
    render_configuration_mcp_answer_text,
    render_sources_connectors_answer_text,
)


@dataclass(frozen=True)
class WorkflowStep:
    title: str
    detail: str
    path: Optional[str] = None


@dataclass(frozen=True)
class UIWorkflow:
    key: str
    intent: str
    scope: str
    route: str  # navigation slug from frontend catalog
    route_label: str
    route_path: str
    steps: tuple[WorkflowStep, ...]
    status_notes: tuple[str, ...] = ()
    # Extra catalog-derived match boosts (action verbs from i18n labels), not English templates.
    match_tokens: tuple[str, ...] = ()
    match_token_prefixes: tuple[str, ...] = ()
    # Config settings metadata (section → optional feature panel).
    section_id: Optional[str] = None
    feature_prefixes: tuple[str, ...] = ()
    preview_label_key: Optional[str] = None
    # Full product catalog modules (Setup / Settings / Integrations), i18n-only.
    catalog_modules: tuple[dict[str, Any], ...] = ()


@dataclass(frozen=True)
class WorkflowMatch:
    workflow: UIWorkflow
    matched_via: str
    score: int
    feature_panel: Optional[dict[str, str]] = None


def _nav_label(key: str, default: str) -> str:
    return resolve_label(key, default)


_IN_APP_NAV_PATH_RE = re.compile(r"^/\(app\)(/|$)")


def is_in_app_nav_path(path: Optional[str]) -> bool:
    raw = str(path or "").strip()
    return bool(raw and _IN_APP_NAV_PATH_RE.match(raw))


def format_in_app_nav_link(label: str, path: Optional[str]) -> str:
    """Bold a UI label. Paths are ignored — Ops answers stay non-navigating prose."""
    text = str(label or "").strip()
    if not text:
        return ""
    return f"**{text}**"


def _format_step_title(
    title: str, path: Optional[str], link_label: Optional[str] = None
) -> str:
    if not is_in_app_nav_path(path):
        return title
    label = str(link_label or "").strip()
    if label and label in title and label != title:
        return title.replace(label, format_in_app_nav_link(label, path), 1)
    return format_in_app_nav_link(title, path)


def _format_step_detail(detail: str, *, link_label: Optional[str], path: Optional[str]) -> str:
    text = str(detail or "")
    label = str(link_label or "").strip()
    if not text or not label or not is_in_app_nav_path(path):
        return text
    if label not in text:
        return text
    return text.replace(label, format_in_app_nav_link(label, path), 1)


UI_WORKFLOWS: tuple[UIWorkflow, ...] = (
    UIWorkflow(
        key="crawl_sync",
        intent="ui_navigation",
        scope="navigation_only",
        route="crawl-management",
        route_label=_nav_label("nav.crawl", "Sources"),
        route_path="/(app)/(tabs)/crawl-management",
        match_tokens=("sync", "crawl", "index", "sources", "jobs"),
        steps=(
            WorkflowStep(
                "Open Sources",
                f"In the sidebar, open {_nav_label('nav.crawl', 'Sources')}.",
                path="/(app)/(tabs)/crawl-management",
            ),
            WorkflowStep("Domain tab", "On the Domain tab, find your source in the sources table."),
            WorkflowStep(
                "Start sync",
                f"Open the row action menu (three dots) and choose {_nav_label('crawl.start', 'Start sync')}.",
            ),
            WorkflowStep(
                "Track progress",
                f"Open the {_nav_label('crawl.jobs', 'Jobs')} tab and watch status until it shows completed.",
            ),
        ),
        status_notes=(
            "Status on the source row and in Jobs shows whether crawling/indexing is running or finished.",
        ),
    ),
    UIWorkflow(
        key="crawl_add_source",
        intent="ui_navigation",
        scope="navigation_only",
        route="crawl-management",
        route_label=_nav_label("nav.crawl", "Sources"),
        route_path="/(app)/(tabs)/crawl-management",
        match_tokens=("add", "new", "create", "source", "sources", "crawl"),
        steps=(
            WorkflowStep(
                "Open Sources",
                f"In the sidebar, open {_nav_label('nav.crawl', 'Sources')}.",
                path="/(app)/(tabs)/crawl-management",
            ),
            WorkflowStep("Domain tab", "Stay on the Domain tab."),
            WorkflowStep(
                "Add Source",
                f"Click {_nav_label('crawl.addSource', 'Add Source')} and enter the website URL and options.",
            ),
            WorkflowStep("Save", "Save the source so it appears in the sources table."),
            WorkflowStep(
                "Start sync",
                f"Use the row action menu to choose {_nav_label('crawl.start', 'Start sync')} when you are ready to crawl.",
            ),
        ),
        status_notes=(),
    ),
    UIWorkflow(
        key="create_project",
        intent="ui_navigation",
        scope="navigation_only",
        route="projects",
        route_label=_nav_label("projects.title", "All Projects"),
        route_path="/(app)/projects",
        match_token_prefixes=("projects.",),
        match_tokens=("project", "projects", "add", "new", "create"),
        steps=(
            WorkflowStep(
                "Open All Projects",
                f"In the sidebar under Management, open {_nav_label('projects.title', 'All Projects')}.",
                path="/(app)/projects",
            ),
            WorkflowStep(
                "Create project",
                f"Click {_nav_label('projects.actions.create', 'Create Project')} "
                f"(or {_nav_label('projects.dropdown.createNew', 'Create New Project')} from the project switcher).",
            ),
            WorkflowStep(
                "Save",
                "Enter the project name and save so it appears in the projects list.",
            ),
        ),
        status_notes=(),
    ),
    UIWorkflow(
        key="compare_models",
        intent="ui_navigation",
        scope="navigation_only",
        route="compare-models",
        route_label=_nav_label("nav.compare-models", "Compare Models"),
        route_path="/(app)/compare-models",
        match_tokens=("compare", "models", "model"),
        steps=(
            WorkflowStep(
                "Open Compare Models",
                f"In the sidebar, open {_nav_label('nav.compare-models', 'Compare Models')}.",
                path="/(app)/compare-models",
            ),
            WorkflowStep(
                "Enter a question",
                f"Type a question in the compare query field ({_nav_label('compareModels.query.placeholder', 'Ask a question to compare models…')}).",
            ),
            WorkflowStep(
                "Run compare",
                f"Click {_nav_label('compareModels.query.submit', 'Compare')} to run the same question across enabled models.",
            ),
            WorkflowStep(
                "Review results",
                "Read the side-by-side answers and token/latency details for each model.",
            ),
        ),
        status_notes=(
            "If the page says models are not configured, set up Chatbot and Search model settings first.",
        ),
    ),
    UIWorkflow(
        key="view_latency",
        intent="ui_navigation",
        scope="companion_tools",
        route="index",
        route_label=_nav_label("nav.analytics", "Analytics"),
        route_path="/(app)/(tabs)",
        match_tokens=("latency", "response", "time", "p95", "usage", "thumbs"),
        steps=(
            WorkflowStep(
                "Open Analytics",
                f"In the sidebar, open {_nav_label('nav.analytics', 'Analytics')} (Overview).",
                path="/(app)/(tabs)",
            ),
            WorkflowStep(
                "p95 Latency card",
                f"Check the {_nav_label('overview.stats.p95Latency.title', 'p95 Latency')} stat for average response time.",
            ),
            WorkflowStep(
                "Per-query latency",
                f"Open {_nav_label('nav.history', 'History')}, pick Search or Chatbot tab, open a query, and read the response time (ms).",
            ),
        ),
        status_notes=(),
    ),
    UIWorkflow(
        key="view_history",
        intent="ui_navigation",
        scope="navigation_only",
        route="history",
        route_label=_nav_label("nav.history", "History"),
        route_path="/(app)/history",
        match_tokens=("history", "past", "queries", "search", "chat"),
        steps=(
            WorkflowStep(
                "Open History",
                f"In the sidebar, open {_nav_label('nav.history', 'History')}.",
                path="/(app)/history",
            ),
            WorkflowStep(
                "Choose tab",
                f"Use the {_nav_label('history.tabs.search', 'Search')} or {_nav_label('history.tabs.chatbot', 'Chatbot')} tab.",
            ),
            WorkflowStep(
                "Browse queries",
                "Scroll the list or search questions; open a row for full answer, sources, and timing.",
            ),
        ),
        status_notes=(),
    ),
    UIWorkflow(
        key="view_system_health",
        intent="ui_navigation",
        scope="companion_tools",
        route="system-health",
        route_label=_nav_label("settings.system-health", "System Health"),
        route_path="/(app)/system-health",
        match_tokens=("system", "health", "service", "status", "uptime"),
        steps=(
            WorkflowStep(
                "Open System Health",
                f"In the sidebar, open {_nav_label('settings.system-health', 'System Health')}.",
                path="/(app)/system-health",
            ),
            WorkflowStep(
                "Overall health",
                f"Review {_nav_label('system-health.overall.title', 'Overall System Health')} and the "
                f"{_nav_label('system-health.healthScore', 'Health Score')}.",
            ),
            WorkflowStep(
                "Service status",
                f"Check {_nav_label('system-health.services.title', 'Service Status')} cards for each service.",
            ),
        ),
        status_notes=(),
    ),
    UIWorkflow(
        key="chatbot_embed_integrations",
        intent="ui_navigation",
        scope="navigation_only",
        route="chatbot-config",
        route_label=_nav_label("nav.chatbot-configuration", "Chatbot Configuration"),
        route_path="/(app)/chatbot-config",
        match_token_prefixes=(
            "chatbot.integrations.",
            "integrations.credentials.",
            "chatbot.tabs.integrations",
        ),
        steps=(
            WorkflowStep(
                "Open Chatbot Configuration",
                f"In the sidebar, open {_nav_label('chatbot.title', 'Chatbot Configuration')}.",
                path="/(app)/chatbot-config",
            ),
            WorkflowStep(
                "Integrations tab",
                f"Open the {_nav_label('chatbot.tabs.integrations', 'Integrations')} tab.",
            ),
            WorkflowStep(
                "Web or Mobile",
                f"Choose {_nav_label('common.web', 'Web')} or {_nav_label('common.mobile', 'Mobile')}.",
            ),
            WorkflowStep(
                "Embed credentials",
                f"Copy values from {_nav_label('integrations.credentials.web.title', 'Web embed credentials')}: "
                f"{_nav_label('integrations.credentials.projectId', 'Project ID')}, "
                f"{_nav_label('integrations.credentials.apiEndpoint', 'API endpoint')}, "
                f"{_nav_label('integrations.credentials.embedToken', 'Embed token')} (web only).",
            ),
            WorkflowStep(
                "Widget script",
                f"Copy the {_nav_label('chatbot.integrations.web.scriptLabel', 'Web Widget Script')} snippet "
                f"or {_nav_label('chatbot.integrations.mobile.scriptLabel', 'Mobile SDK Code')} for mobile.",
            ),
            WorkflowStep(
                "Allowed domains",
                f"Use {_nav_label('integrations.credentials.manageDomains', 'Manage allowed domains')} when prompted.",
            ),
        ),
        status_notes=(
            _nav_label("chatbot.integrations.scripts.subtitle", "Copy embed snippets for web and mobile clients."),
        ),
    ),
    UIWorkflow(
        key="search_embed_integrations",
        intent="ui_navigation",
        scope="navigation_only",
        route="search-config",
        route_label=_nav_label("nav.search-configuration", "Search Configuration"),
        route_path="/(app)/search-config",
        match_token_prefixes=(
            "search.integrations.",
            "integrations.credentials.",
            "search.tabs.integrations",
        ),
        steps=(
            WorkflowStep(
                "Open Search Configuration",
                f"In the sidebar, open {_nav_label('search.title', 'Search Configuration')}.",
                path="/(app)/search-config",
            ),
            WorkflowStep(
                "Integrations tab",
                f"Open the {_nav_label('search.tabs.integrations', 'Integrations')} tab.",
            ),
            WorkflowStep(
                "Web or Mobile",
                f"Choose {_nav_label('common.web', 'Web')} or {_nav_label('common.mobile', 'Mobile')}.",
            ),
            WorkflowStep(
                "Embed credentials",
                f"Copy values from {_nav_label('integrations.credentials.web.title', 'Web embed credentials')}: "
                f"{_nav_label('integrations.credentials.projectId', 'Project ID')}, "
                f"{_nav_label('integrations.credentials.apiEndpoint', 'API endpoint')}, "
                f"{_nav_label('integrations.credentials.embedToken', 'Embed token')} (web only).",
            ),
            WorkflowStep(
                "Widget script",
                f"Copy the {_nav_label('search.integrations.web.scriptLabel', 'Web Widget Script')} snippet "
                f"or {_nav_label('search.integrations.mobile.scriptLabel', 'Mobile SDK Code')} for mobile.",
            ),
            WorkflowStep(
                "Allowed domains",
                f"Use {_nav_label('integrations.credentials.manageDomains', 'Manage allowed domains')} when prompted.",
            ),
        ),
        status_notes=(
            _nav_label("search.integrations.scripts.subtitle", "Copy embed snippets for web and mobile clients."),
        ),
    ),
)


def _workflows_from_dicts(dicts: list[dict[str, Any]] | tuple[dict[str, Any], ...]) -> tuple[UIWorkflow, ...]:
    built: list[UIWorkflow] = []
    for d in dicts:
        steps = tuple(
            WorkflowStep(
                title=str(s["title"]),
                detail=str(s["detail"]),
                path=str(s["path"]).strip() if s.get("path") else None,
            )
            for s in (d.get("steps") or [])
            if isinstance(s, dict)
        )
        catalog_raw = d.get("catalog_modules") or ()
        catalog_modules = tuple(
            {
                "group": str(m.get("group") or ""),
                "title": str(m.get("title") or ""),
                "subtitle": str(m.get("subtitle") or ""),
                "path": str(m.get("path") or "").strip() or None,
                "features": [
                    str(f).strip()
                    for f in (m.get("features") or [])
                    if str(f).strip()
                ]
                if isinstance(m.get("features"), list)
                else [],
            }
            for m in catalog_raw
            if isinstance(m, dict) and str(m.get("title") or "").strip()
        )
        built.append(
            UIWorkflow(
                key=str(d["key"]),
                intent=str(d.get("intent") or "ui_navigation"),
                scope=str(d.get("scope") or "navigation_only"),
                route=str(d["route"]),
                route_label=str(d["route_label"]),
                route_path=str(d["route_path"]),
                steps=steps,
                status_notes=tuple(str(n) for n in (d.get("status_notes") or []) if n),
                match_tokens=tuple(str(t) for t in (d.get("match_tokens") or ()) if t),
                match_token_prefixes=tuple(str(p) for p in (d.get("match_token_prefixes") or ()) if p),
                section_id=str(d["section_id"]) if d.get("section_id") else None,
                feature_prefixes=tuple(str(p) for p in (d.get("feature_prefixes") or ()) if p),
                preview_label_key=str(d["preview_label_key"]) if d.get("preview_label_key") else None,
                catalog_modules=catalog_modules,
            )
        )
    return tuple(built)


def _workflows_from_config_surfaces() -> tuple[UIWorkflow, ...]:
    return _workflows_from_dicts(
        list(build_config_setting_workflows_cached()) + list(build_config_catalog_workflows_cached())
    )


def _workflows_from_app_surfaces() -> tuple[UIWorkflow, ...]:
    return _workflows_from_dicts(build_app_surface_workflow_dicts())


ALL_UI_WORKFLOWS: tuple[UIWorkflow, ...] = (
    UI_WORKFLOWS + _workflows_from_config_surfaces() + _workflows_from_app_surfaces()
)


def _normalize(text: str) -> str:
    return " ".join((text or "").strip().lower().split())


def workflow_keys_for_planner() -> list[dict[str, str]]:
    return [
        {"key": wf.key, "route": wf.route, "route_label": wf.route_label, "scope": wf.scope}
        for wf in ALL_UI_WORKFLOWS
    ]


def workflows_for_route(route: str) -> list[UIWorkflow]:
    return [wf for wf in ALL_UI_WORKFLOWS if wf.route == route]


def workflow_by_key(key: str) -> Optional[UIWorkflow]:
    for wf in ALL_UI_WORKFLOWS:
        if wf.key == key:
            return wf
    return None


def _attach_feature_panel(match: WorkflowMatch, query: str) -> WorkflowMatch:
    """Enrich config-settings matches with the best i18n feature panel for this query."""
    wf = match.workflow
    if not is_config_settings_workflow_key(wf.key):
        return match
    feature = match_config_feature(wf.route, query, section_id=wf.section_id)
    if not feature:
        return match
    return WorkflowMatch(
        workflow=wf,
        matched_via=match.matched_via,
        score=match.score,
        feature_panel={
            "group_id": feature.group_id,
            "title": feature.title,
            "title_key": feature.title_key,
        },
    )


def _score_workflow(query: str, workflow: UIWorkflow) -> int:
    q_tokens = _tokenize(query)
    if not q_tokens:
        return 0

    # Embed workflows must not win on settings/customization asks.
    if workflow.key in ("chatbot_embed_integrations", "search_embed_integrations"):
        if not query_has_embed_signal(query):
            return 0

    score = 0
    label_tokens = _tokenize(workflow.route_label)
    overlap_label = q_tokens & label_tokens
    score += len(overlap_label) * 4
    if label_tokens and label_tokens <= q_tokens:
        score += 8
    label_norm = _normalize(workflow.route_label)
    q_norm = _normalize(query)
    if label_norm and label_norm in q_norm:
        score += 12
    slug_tokens = _tokenize(workflow.route.replace("-", " "))
    score += len(q_tokens & slug_tokens) * 3
    extra = {t.lower() for t in workflow.match_tokens if t}
    score += len(q_tokens & extra) * 2
    if workflow.match_token_prefixes:
        prefix_tokens = tokens_from_i18n_prefixes(*workflow.match_token_prefixes)
        score += len(q_tokens & prefix_tokens) * 2

    # Prefer add-source only when source/crawl domain is present (not bare "add project").
    source_domain = q_tokens & {"source", "sources", "crawl"} | (
        q_tokens & _tokenize(_nav_label("nav.crawl", "Sources"))
    )
    if workflow.key == "crawl_add_source":
        if q_tokens & {"add", "new", "create"} and source_domain:
            score += 6
        elif not source_domain:
            score = 0
    if workflow.key == "crawl_sync" and q_tokens & {"sync", "crawl", "index", "jobs"} and not (
        q_tokens & {"add", "new", "create"}
    ):
        score += 4
    if workflow.key == "view_latency" and q_tokens & {"latency", "p95", "response"}:
        score += 6
    if workflow.key == "create_project":
        project_tokens = {"project", "projects"}
        if not (q_tokens & project_tokens):
            score = 0
        elif q_tokens & {"add", "new", "create"} and not source_domain:
            score += 12
    if workflow.key in ("chatbot_embed_integrations", "search_embed_integrations"):
        surface = embed_surface_for_route(workflow.route)
        if surface:
            score += len(q_tokens & (surface.get("embed_tokens") or set())) * 2

    # Prefer specific Settings tabs over the generic Settings home opener.
    if workflow.key == "app_settings_home":
        specific = {
            "language",
            "region",
            "retention",
            "session",
            "timeout",
            "branding",
            "internationalization",
            "i18n",
            "help",
            "license",
            "licenses",
            "terms",
            "about",
            "global",
            "theme",
        }
        if q_tokens & specific:
            return 0
        # Chatbot / Search product how-tos must not open app Settings home.
        if q_tokens & {"chatbot", "search"}:
            return 0

    # Config settings workflows: require product context; boost quality-aware feature hits.
    if is_config_settings_workflow_key(workflow.key):
        # Embed/script asks belong to Integrations workflows, not Settings sections.
        if query_has_embed_signal(query):
            return 0
        # Broad inventory asks belong to the catalog workflow, not a single section.
        if detect_config_catalog_query(query) == workflow.route:
            return 0
        product = product_tokens_for_route(workflow.route)
        # Require product name (chatbot/search) so app Settings how-tos are not stolen.
        if not (q_tokens & product):
            return 0
        feat_score = feature_match_score(
            workflow.route, query, section_id=workflow.section_id
        )
        if feat_score:
            score += 10 + feat_score

    if is_config_catalog_workflow_key(workflow.key):
        if query_has_embed_signal(query) or query_has_config_feature_hit(query):
            return 0
        if detect_config_catalog_query(query) == workflow.route:
            score += 40
        else:
            return 0

    if is_sources_connectors_catalog_key(workflow.key):
        from .ui_app_surfaces import detect_sources_connectors_catalog_query

        if detect_sources_connectors_catalog_query(query):
            score += 50
        else:
            return 0

    if is_configuration_mcp_key(workflow.key):
        from .ui_app_surfaces import detect_mcp_connector_query

        if detect_mcp_connector_query(query):
            score += 55
        else:
            return 0
    return score


def _candidate_rank(query: str, workflow: UIWorkflow, score: int) -> tuple[int, int, int]:
    """
    Rank key for picking among candidates: higher is better.
    (score, panel_title_exact, feature_quality)
    """
    feat_q = 0
    panel_exact = 0
    if is_config_settings_workflow_key(workflow.key):
        feat_q = feature_match_score(workflow.route, query, section_id=workflow.section_id)
        feature = match_config_feature(workflow.route, query, section_id=workflow.section_id)
        if feature and panel_title_matches_query(feature.title, query, route=workflow.route):
            panel_exact = 1
    return (score, panel_exact, feat_q)


def _pick_best_candidate(
    query: str, candidates: list[UIWorkflow], *, score_fn
) -> tuple[Optional[UIWorkflow], int]:
    best_c: Optional[UIWorkflow] = None
    best_s = -1
    best_rank: tuple[int, int, int] = (-1, -1, -1)
    for c in candidates:
        s = score_fn(c)
        if s <= 0 and best_c is not None:
            continue
        rank = _candidate_rank(query, c, s)
        if best_c is None or rank > best_rank:
            best_c = c
            best_s = s
            best_rank = rank
    return best_c, best_s

def match_ui_workflows(
    cleaned_query: str,
    *,
    focus_route: Optional[str] = None,
    workflow_key: Optional[str] = None,
    workflow_keys: Optional[list[str]] = None,
) -> list[WorkflowMatch]:
    """Match zero or more UI workflows (e.g. chatbot + search embed in one ask)."""
    matches: list[WorkflowMatch] = []
    if workflow_keys:
        for key in workflow_keys:
            wf = workflow_by_key(key)
            if wf:
                matches.append(
                    _attach_feature_panel(
                        WorkflowMatch(workflow=wf, matched_via=f"workflow_keys:{key}", score=100),
                        cleaned_query,
                    )
                )
        if matches:
            return matches

    embed_routes = detect_embed_routes(cleaned_query)
    if len(embed_routes) >= 2:
        for route in embed_routes:
            surface = embed_surface_for_route(route) or {}
            key = str(surface.get("workflow_key") or "")
            wf = workflow_by_key(key) if key else None
            if wf:
                matches.append(
                    WorkflowMatch(
                        workflow=wf,
                        matched_via=f"embed_routes:{route}",
                        score=_score_workflow(cleaned_query, wf) + 20,
                    )
                )
        if matches:
            return matches

    single = match_ui_workflow(
        cleaned_query,
        focus_route=focus_route or (embed_routes[0] if len(embed_routes) == 1 else None),
        workflow_key=workflow_key
        or (
            str((embed_surface_for_route(embed_routes[0]) or {}).get("workflow_key") or "")
            if len(embed_routes) == 1
            else None
        ),
    )
    return [single] if single else []


def match_ui_workflow(
    cleaned_query: str,
    *,
    focus_route: Optional[str] = None,
    workflow_key: Optional[str] = None,
) -> Optional[WorkflowMatch]:
    """Match UI workflows by route slug / catalog tokens (no phrase alias lists)."""
    q = _normalize(cleaned_query)
    if not q and not focus_route and not workflow_key:
        return None

    # Feature-specific how-tos must not stay stuck on a catalog workflow key.
    if (
        workflow_key
        and is_inventory_catalog_workflow_key(workflow_key)
        and query_has_config_feature_hit(cleaned_query)
    ):
        workflow_key = None

    if workflow_key:
        wf = workflow_by_key(workflow_key)
        if wf:
            return _attach_feature_panel(
                WorkflowMatch(workflow=wf, matched_via=f"workflow_key:{workflow_key}", score=100),
                cleaned_query,
            )

    if focus_route:
        candidates = workflows_for_route(focus_route)
        if candidates:
            if not q:
                # Prefer companion_tools when multiple, else first.
                preferred = next((c for c in candidates if c.scope == "companion_tools"), candidates[0])
                return WorkflowMatch(workflow=preferred, matched_via=f"focus_route:{focus_route}", score=80)
            best_c, best_s = _pick_best_candidate(
                cleaned_query,
                candidates,
                score_fn=lambda c: _score_workflow(cleaned_query, c),
            )
            if best_c is not None:
                return _attach_feature_panel(
                    WorkflowMatch(
                        workflow=best_c,
                        matched_via=f"focus_route:{focus_route}",
                        score=max(best_s, 50),
                    ),
                    cleaned_query,
                )

    route_hit = best_route_match(cleaned_query)
    if route_hit:
        candidates = workflows_for_route(route_hit.route)
        if candidates:

            def _route_score(c: UIWorkflow) -> int:
                base = _score_workflow(cleaned_query, c)
                return base + route_hit.score if base > 0 else 0

            best_c, best_s = _pick_best_candidate(
                cleaned_query,
                candidates,
                score_fn=_route_score,
            )
            if best_c is not None and best_s >= 4:
                return _attach_feature_panel(
                    WorkflowMatch(
                        workflow=best_c,
                        matched_via=f"route:{route_hit.route}",
                        score=best_s,
                    ),
                    cleaned_query,
                )

    # Fallback: best workflow by label/slug/token overlap only.
    best_c, best_s = _pick_best_candidate(
        cleaned_query,
        list(ALL_UI_WORKFLOWS),
        score_fn=lambda c: _score_workflow(cleaned_query, c),
    )
    if best_c is not None and best_s >= 4:
        return _attach_feature_panel(
            WorkflowMatch(workflow=best_c, matched_via="token_overlap", score=best_s),
            cleaned_query,
        )
    return None

def render_workflow_answer_text(workflow_blocks: list[dict[str, Any]]) -> str:
    """Deterministic numbered steps from ui_workflow grounding blocks (no LLM)."""
    sections: list[str] = []
    wf_blocks = [b for b in workflow_blocks if isinstance(b, dict) and b.get("kind") == "ui_workflow"]
    multi = len(wf_blocks) > 1
    for block in wf_blocks:
        route = block.get("route") if isinstance(block.get("route"), dict) else {}
        heading = str(route.get("label") or "").strip()
        route_path = str(route.get("path") or "").strip() or None
        lines: list[str] = []
        if multi and heading:
            lines.append(f"{format_in_app_nav_link(heading, route_path)}:")
        for idx, step in enumerate(block.get("steps") or [], start=1):
            if not isinstance(step, dict):
                continue
            title = str(step.get("title") or f"Step {idx}").strip()
            detail = str(step.get("detail") or "").strip()
            step_path = str(step.get("path") or "").strip() or None
            link_label = str(step.get("link_label") or "").strip() or None
            lines.append(f"{idx}. {_format_step_title(title, step_path, link_label)}")
            if detail:
                lines.append(
                    f"   {_format_step_detail(detail, link_label=link_label or title, path=step_path)}"
                )
        notes = block.get("status_notes") or []
        if isinstance(notes, list):
            for note in notes:
                if note:
                    lines.append(str(note))
        if lines:
            sections.append("\n".join(lines))
    return "\n\n".join(sections).strip()


def render_ui_howto_answer_text(workflow_blocks: list[dict[str, Any]]) -> str:
    """Deterministic howto answer from ui_workflow steps (feature panels included)."""
    return render_workflow_answer_text(workflow_blocks)


def render_config_catalog_answer_text(workflow_blocks: list[dict[str, Any]]) -> str:
    """Deterministic inventory answer for config catalog workflows (no LLM)."""
    mcp_text = render_configuration_mcp_answer_text(workflow_blocks)
    if mcp_text:
        return mcp_text
    sources_text = render_sources_connectors_answer_text(workflow_blocks)
    if sources_text:
        return sources_text
    parts: list[str] = []
    for block in workflow_blocks:
        if not isinstance(block, dict) or block.get("kind") != "ui_workflow":
            continue
        if not is_config_catalog_workflow_key(str(block.get("key") or "")):
            continue
        route = block.get("route") if isinstance(block.get("route"), dict) else {}
        label = str(route.get("label") or "").strip() or "Configuration"
        modules = block.get("catalog_modules") or []
        if not isinstance(modules, list) or not modules:
            continue
        parts.append(f"In {format_in_app_nav_link(label, str(route.get('path') or '') or None)}, you can configure these areas:")
        current_group = ""
        for mod in modules:
            if not isinstance(mod, dict):
                continue
            group = str(mod.get("group") or "").strip()
            title = str(mod.get("title") or "").strip()
            subtitle = str(mod.get("subtitle") or "").strip()
            mod_path = str(mod.get("path") or "").strip() or None
            if not title:
                continue
            if group and group != current_group:
                current_group = group
                parts.append(f"\n**{group}**")
            title_md = format_in_app_nav_link(title, mod_path)
            if subtitle:
                parts.append(f"- {title_md} — {subtitle}")
            else:
                parts.append(f"- {title_md}")
            features = mod.get("features") or []
            if isinstance(features, list):
                for feature in features:
                    name = str(feature).strip()
                    if name:
                        parts.append(f"  - {name}")
    return "\n".join(parts).strip()


def render_ui_workflow_facts(match: WorkflowMatch) -> dict[str, Any]:
    """Render workflow as answerer-safe grounding facts."""
    wf = match.workflow
    route_label = str(wf.route_label or "").strip()

    def _step_link_label(step: WorkflowStep) -> str:
        if route_label and (
            route_label in step.title or route_label in step.detail
        ):
            return route_label
        return step.title

    steps = []
    for s in wf.steps:
        entry: dict[str, Any] = {"title": s.title, "detail": s.detail}
        if s.path and is_in_app_nav_path(s.path):
            entry["path"] = s.path
            entry["link_label"] = _step_link_label(s)
        elif is_in_app_nav_path(wf.route_path) and route_label and (
            route_label in s.title or route_label in s.detail
        ):
            # Open-module steps without an explicit path still link to the workflow screen.
            entry["path"] = wf.route_path
            entry["link_label"] = route_label
        steps.append(entry)
    feature = match.feature_panel
    if feature and feature.get("title"):
        title = str(feature["title"])
        feature_step: dict[str, Any] = {
            "title": title,
            "detail": f"Find the {title} section and adjust the controls there.",
            "link_label": title,
        }
        if is_in_app_nav_path(wf.route_path):
            feature_step["path"] = wf.route_path
        steps.append(feature_step)
        if wf.preview_label_key:
            preview_label = resolve_label(wf.preview_label_key, "Live Preview")
            steps.append(
                {
                    "title": preview_label,
                    "detail": f"Confirm the result in the {preview_label} pane.",
                }
            )

    facts: dict[str, Any] = {
        "kind": "ui_workflow",
        "key": wf.key,
        "intent": wf.intent,
        "scope": wf.scope,
        "allowed_step_only": True,
        "route": {"slug": wf.route, "label": wf.route_label, "path": wf.route_path},
        "steps": steps,
        "status_notes": list(wf.status_notes),
    }
    if wf.section_id:
        facts["section_id"] = wf.section_id
    if feature:
        facts["feature_panel"] = feature
    if wf.catalog_modules:
        facts["catalog_modules"] = [dict(m) for m in wf.catalog_modules]
        facts["is_config_catalog"] = True
    return facts
