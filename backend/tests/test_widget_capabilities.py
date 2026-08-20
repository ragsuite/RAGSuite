from app.platform.widget_capabilities import collect_public_widget_capabilities
from app.platform.module_loader import reset_registry
from app.platform.module_types import ModuleManifest, ModuleSurfaces


def test_manifest_parses_public_capabilities():
    man = ModuleManifest.from_dict(
        {
            "id": "voice",
            "version": "1.0.0",
            "edition": "enterprise",
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
        edition="enterprise",
        status="migrated",
        surfaces=ModuleSurfaces(frontend=True, backend=True),
        permissions=["voice:use"],
        public_capabilities=["voice.stt", "voice.tts", "secret.dump"],
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
        lambda: ["voice"],
    )
    monkeypatch.setattr(
        "app.platform.widget_capabilities.loaded_manifests",
        lambda: {"voice": voice, "sso": sso},
    )
    assert collect_public_widget_capabilities() == ["voice.stt", "voice.tts"]
