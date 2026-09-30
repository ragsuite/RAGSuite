from app.platform.widget_capabilities import collect_public_widget_capabilities
from app.platform.module_loader import reset_registry
from app.platform.module_types import ModuleManifest, ModuleSurfaces


def test_manifest_parses_public_capabilities():
    man = ModuleManifest.from_dict(
        {
            "id": "voice",
            "version": "1.0.0",
            "edition": "community",
            "status": "migrated",
            "public_capabilities": ["voice.stt", "voice.tts"],
        }
    )
    assert man.public_capabilities == ["voice.stt", "voice.tts"]
    reset_registry()
    assert collect_public_widget_capabilities() == []


def test_collect_capabilities_only_from_loaded_modules(monkeypatch):
    reset_registry()
    voice = ModuleManifest(
        id="voice",
        version="1.0.0",
        edition="community",
        status="migrated",
        surfaces=ModuleSurfaces(frontend=True, backend=True),
        permissions=["voice:use"],
        public_capabilities=["voice.stt", "voice.tts", "secret.dump"],
    )
    pilot = ModuleManifest(
        id="ai_voice_pilot",
        version="1.0.0",
        edition="community",
        status="migrated",
        surfaces=ModuleSurfaces(frontend=True, backend=True),
        permissions=["ai_voice_pilot:use"],
        public_capabilities=["voice.pilot.widget", "secret.dump"],
    )
    sso = ModuleManifest(
        id="sso",
        version="1.0.0",
        edition="enterprise",
        status="migrated",
        surfaces=ModuleSurfaces(),
        public_capabilities=["voice.stt"],
    )
    monkeypatch.setattr(
        "app.platform.widget_capabilities.loaded_module_ids",
        lambda: ["voice", "ai_voice_pilot"],
    )
    monkeypatch.setattr(
        "app.platform.widget_capabilities.loaded_manifests",
        lambda: {"voice": voice, "ai_voice_pilot": pilot, "sso": sso},
    )
    caps = collect_public_widget_capabilities()
    assert set(caps) == {"voice.stt", "voice.tts", "voice.pilot.widget"}
    assert "secret.dump" not in caps
    # sso is not loaded — only one voice.stt from the voice module
    assert caps.count("voice.stt") == 1


def test_voice_pilot_widget_capability_allowlisted():
    from app.platform.widget_capabilities import ALLOWED_PUBLIC_CAPABILITIES

    assert "voice.pilot.widget" in ALLOWED_PUBLIC_CAPABILITIES


def test_ce_only_loads_voice_modules_without_license(monkeypatch, tmp_path):
    from fastapi import FastAPI

    from app.platform.extension_loader import load_extensions, loaded_extension_ids
    from app.platform.license_state import reset_license_cache

    monkeypatch.delenv("RAGSUITE_EE_ROOT", raising=False)
    monkeypatch.setenv("RAGSUITE_LICENSE_FILE", str(tmp_path / "missing.key"))
    reset_license_cache()
    reset_registry()
    try:
        load_extensions(FastAPI())
        ids = set(loaded_extension_ids())
        assert {"voice", "ai_voice_pilot"} <= ids
        assert set(collect_public_widget_capabilities()) >= {
            "voice.stt",
            "voice.tts",
            "voice.pilot.widget",
        }
    finally:
        reset_registry()
        reset_license_cache()
