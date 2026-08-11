# RAGSuite Crawler App
# CRITICAL: Patch OpenTelemetry before any other imports
import os
import sys

os.environ["OTEL_SDK_DISABLED"] = "true"
os.environ["OTEL_PYTHON_DISABLED_INSTRUMENTATIONS"] = "all"
os.environ["MISTRAL_TELEMETRY_ENABLED"] = "false"

# Patch missing OpenTelemetry classes before any llama-index imports
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
    # Create export submodule if needed
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
