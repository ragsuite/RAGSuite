#!/usr/bin/env python3
"""
Simple run script for RAGSuite API (local dev with auto-reload).
"""
import subprocess
import sys

if __name__ == "__main__":
    print("🚀 Starting RAGSuite API...")
    print("📝 Example endpoints (full list at /docs):")
    print("   POST /api/v1/crawl/auth/register")
    print("   POST /api/v1/crawl/auth/login")
    print("   POST /api/v1/crawl/sites")
    print("   POST /api/v1/crawl/start/{source_id}")
    print("   GET  /api/v1/crawl/status/{job_id}")
    print("   POST /api/v1/chat/message")
    print("   POST /api/v1/search/query")
    print("\n🔗 API:  http://localhost:9090 (Docker) or http://localhost:8000 (host uvicorn)")
    print("📖 Docs: http://localhost:9090/docs")
    print("\n🔄 Starting server...")
    print(f"   Interpreter: {sys.executable}\n")

    subprocess.run([
        sys.executable, "-m", "uvicorn",
        "app.main:app",
        "--host", "0.0.0.0",
        "--port", "8000",
        "--reload",
    ])
