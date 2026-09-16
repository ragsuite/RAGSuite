"""Assistant-facing system health snapshot (owned by system_health module).

Registered on Platform via ``register_hook("system_health.assistant_snapshot", ...)``
so other modules (e.g. ai_assistant) never import this package directly.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from . import routes as health_routes

logger = logging.getLogger(__name__)


def collect_assistant_snapshot(db: Session, project_id: UUID) -> dict[str, Any]:
    """Infrastructure/service status aligned with the System Health dashboard."""
    try:
        from app.models import Project

        project = db.query(Project).filter(Project.id == project_id).first()
        owner_id = int(project.owner_id) if project and project.owner_id is not None else None
    except Exception:
        owner_id = None

    async def _collect() -> dict[str, Any]:
        if getattr(health_routes, "_app_start_time", None) is None:
            try:
                health_routes.init_app_start_time()
            except Exception:
                pass

        check_results: list[tuple[str, float, bool, dict[str, Any]]] = []

        # API Gateway
        try:
            gateway_start = datetime.utcnow()
            if health_routes._app_start_time:
                lat = (datetime.utcnow() - gateway_start).total_seconds()
                health_routes._record_health_check("API Gateway", True, lat)
                check_results.append(("API Gateway", lat, True, {}))
            else:
                check_results.append(("API Gateway", 0.05, True, {}))
        except Exception:
            check_results.append(("API Gateway", 0.0, False, {}))

        redis_res = await health_routes.check_redis_health()
        check_results.append(
            ("Redis Cache", 0.1 if redis_res.get("status") != "down" else 0.0, redis_res.get("status") != "down", {})
        )

        vdb_res = await health_routes.check_vector_db_health()
        check_results.append(
            (
                "Vector Database",
                0.1 if vdb_res.get("status") != "down" else 0.0,
                vdb_res.get("status") != "down",
                {},
            )
        )

        pg_res = await health_routes.check_postgresql_health()
        check_results.append(
            (
                "PostgreSQL",
                0.1 if pg_res.get("status") != "down" else 0.0,
                pg_res.get("status") != "down",
                {},
            )
        )

        # Optional LLM probes for project owner (skip local providers).
        if owner_id is not None:
            try:
                from app.models import ChatbotSettings, SearchSettings, LLMConfig
                from sqlalchemy import and_

                providers: list[tuple[str, Optional[str]]] = []
                chatbot = (
                    db.query(ChatbotSettings)
                    .filter(
                        and_(
                            ChatbotSettings.user_id == owner_id,
                            ChatbotSettings.project_id == project_id,
                            ChatbotSettings.api_key.isnot(None),
                            ChatbotSettings.api_key != "",
                            ChatbotSettings.api_key != "None",
                        )
                    )
                    .first()
                )
                if chatbot and chatbot.model_provider:
                    providers.append((chatbot.model_provider, "chatbot"))
                search = (
                    db.query(SearchSettings)
                    .filter(
                        and_(
                            SearchSettings.user_id == owner_id,
                            SearchSettings.project_id == project_id,
                            SearchSettings.api_key.isnot(None),
                            SearchSettings.api_key != "",
                            SearchSettings.api_key != "None",
                        )
                    )
                    .first()
                )
                if search and search.model_provider:
                    providers.append((search.model_provider, "search"))
                llm_cfg = (
                    db.query(LLMConfig)
                    .filter(
                        and_(
                            LLMConfig.user_id == owner_id,
                            LLMConfig.api_key.isnot(None),
                            LLMConfig.api_key != "",
                            LLMConfig.api_key != "None",
                        )
                    )
                    .first()
                )
                if llm_cfg and llm_cfg.model_provider:
                    providers.append((llm_cfg.model_provider, None))

                for provider, source in providers:
                    if not provider or provider.lower() in ("ollama", "custom"):
                        continue
                    try:
                        provider_res = await health_routes.check_llm_provider_health(
                            db, provider, user_id=owner_id, source=source
                        )
                        provider_lower = provider.lower()
                        if "google" in provider_lower or "gemini" in provider_lower:
                            base_name = "Gemini API"
                        elif "mistral" in provider_lower:
                            base_name = "Mistral API"
                        elif "anthropic" in provider_lower or "claude" in provider_lower:
                            base_name = "Anthropic API"
                        elif "openai" in provider_lower:
                            base_name = "OpenAI API"
                        else:
                            base_name = f"{provider.capitalize()} API"
                        service_name = f"{base_name} ({source.capitalize()})" if source else base_name
                        check_results.append(
                            (
                                service_name,
                                0.5 if provider_res.get("status") != "down" else 0.0,
                                provider_res.get("status") != "down",
                                provider_res if isinstance(provider_res, dict) else {},
                            )
                        )
                    except Exception as exc:
                        logger.warning("LLM health probe failed for %s: %s", provider, exc)
            except Exception as exc:
                logger.warning("Could not probe LLM providers for system health: %s", exc)

        services: dict[str, Any] = {}
        total_score = 0.0
        worst = 0
        status_map = {"healthy": 0, "degraded": 1, "at_risk": 2, "down": 3}
        rev = {0: "healthy", 1: "degraded", 2: "at_risk", 3: "down"}
        for name, lat, is_up, metrics in check_results:
            evaluation = health_routes._evaluate_service_health(name, lat, is_up, metrics or {})
            worst = max(worst, status_map.get(evaluation.get("status"), 3))
            total_score += float(evaluation.get("score") or 0)
            services[name] = {
                "status": evaluation.get("status"),
                "health_score": evaluation.get("score"),
                "reason": evaluation.get("reason"),
            }
        overall_score = round(total_score / len(services), 1) if services else 0.0
        return {
            "overall_status": rev.get(worst, "unknown"),
            "overall_health_score": overall_score,
            "services": services,
        }

    try:
        try:
            return asyncio.run(_collect())
        except RuntimeError:
            loop = asyncio.new_event_loop()
            try:
                return loop.run_until_complete(_collect())
            finally:
                loop.close()
    except Exception as exc:
        logger.exception("system_health assistant snapshot failed")
        return {"error": str(exc)}
