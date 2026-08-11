# CRITICAL: Patch OpenTelemetry before importing llama-index modules
import sys
import os
os.environ["OTEL_SDK_DISABLED"] = "true"
os.environ["OTEL_PYTHON_DISABLED_INSTRUMENTATIONS"] = "all"
os.environ["MISTRAL_TELEMETRY_ENABLED"] = "false"

# Patch missing OpenTelemetry classes before imports
class ReadableLogRecord:
    pass

class LogRecordExportResult:
    SUCCESS = "SUCCESS"
    FAILURE = "FAILURE"

try:
    import opentelemetry.sdk._logs as otel_logs_module
    if not hasattr(otel_logs_module, 'ReadableLogRecord'):
        otel_logs_module.ReadableLogRecord = ReadableLogRecord
except Exception:
    pass

try:
    import opentelemetry.sdk._logs.export as otel_logs_export_module
    if not hasattr(otel_logs_export_module, 'LogRecordExportResult'):
        otel_logs_export_module.LogRecordExportResult = LogRecordExportResult
except Exception:
    try:
        import opentelemetry.sdk._logs as otel_logs_module
        if not hasattr(otel_logs_module, 'export'):
            class ExportModule:
                LogRecordExportResult = LogRecordExportResult
            otel_logs_module.export = ExportModule()
        else:
            if not hasattr(otel_logs_module.export, 'LogRecordExportResult'):
                otel_logs_module.export.LogRecordExportResult = LogRecordExportResult
    except Exception:
        pass

from typing import Optional, Any
from llama_index.llms.openai import OpenAI
from llama_index.llms.anthropic import Anthropic

# Lazy import Gemini to avoid deprecation warning at startup
# from llama_index.llms.gemini import Gemini
from llama_index.llms.ollama import Ollama
import logging



logger = logging.getLogger(__name__)



import time

class LLMFactory:
    _instances = {}
    _cache_ttl = 3600  # 1 hour standby time

    @staticmethod
    def get_llm(provider: str, model_name: str, api_key: Optional[str] = None) -> Any:
        try:
            # Normalize provider string
            provider = provider.lower()
            if "google" in provider or "gemini" in provider:
                provider = "gemini"
            elif "mistral" in provider:
                provider = "mistral" 
            elif "anthropic" in provider or "claude" in provider:
                provider = "anthropic"
            elif "openai" in provider:
                provider = "openai"
            elif "custom" in provider or "ollama" in provider:
                provider = "ollama"
            
            # Create cache key
            cache_key = f"{provider}:{model_name}:{api_key}"
            current_time = time.time()
            
            # Check cache
            if cache_key in LLMFactory._instances:
                cached_data = LLMFactory._instances[cache_key]
                # If within TTL, access cache
                if current_time - cached_data["timestamp"] < LLMFactory._cache_ttl:
                    # Update timestamp (slide window) to keep alive if active
                    cached_data["timestamp"] = current_time
                    return cached_data["instance"]
            
            # Initialize new instance if not cached or expired
            instance = None
            if provider == "openai":
                instance = OpenAI(model=model_name, api_key=api_key, keep_alive="1h")
            elif provider == "anthropic":
                # Anthropic doesn't support keep_alive parameter - connection pooling handled by SDK
                instance = Anthropic(model=model_name, api_key=api_key)
            elif provider == "mistral":
                # 🔥 LAZY IMPORT — ONLY here
                import os
                os.environ["MISTRAL_TELEMETRY_ENABLED"] = "false"
                os.environ["OTEL_SDK_DISABLED"] = "true"

                from llama_index.llms.mistralai import MistralAI
                # 30-second per-request timeout prevents Mistral API hangs from blocking queries
                try:
                    instance = MistralAI(model=model_name, api_key=api_key, timeout=30)
                except TypeError:
                    instance = MistralAI(model=model_name, api_key=api_key)
            elif provider == "gemini":
                # 🔥 LAZY IMPORT — ONLY here to avoid google.generativeai deprecation warning at startup
                # The deprecation warning will only appear when Gemini is actually used
                from llama_index.llms.gemini import Gemini
                # Gemini doesn't support keep_alive parameter - connection pooling handled by SDK
                instance = Gemini(model=model_name, api_key=api_key)
            elif provider == "ollama":
                 # Custom LLM / Ollama provider
                 # Use the model_name if provided, otherwise default
                 model = model_name if model_name and model_name != "custom-default" else "gpt-oss:120b-cloud"
                 # context_window set explicitly to skip /api/show lookup on every call
                 instance = Ollama(model=model, request_timeout=300.0, keep_alive="1h", context_window=8192)
            else:
                logger.warning(f"Unknown provider '{provider}', falling back to default Ollama")
                instance = Ollama(model="gpt-oss:120b-cloud", request_timeout=300.0, keep_alive="1h", context_window=8192)
            
            # Cache the new instance
            if instance:
                LLMFactory._instances[cache_key] = {
                    "instance": instance,
                    "timestamp": current_time
                }
            
            return instance
            
        except Exception as e:
            logger.error(f"Failed to initialize LLM for provider {provider}: {e}")
            # Fallback to safe default if specific provider fails
            return Ollama(model="gpt-oss:120b-cloud", request_timeout=300.0, keep_alive="1h")