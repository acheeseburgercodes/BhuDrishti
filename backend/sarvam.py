"""Server-side Sarvam AI adapter (translation, TTS capability, STT capability).

The API key stays on the server; browsers/mobile call BhuDrishti endpoints, never Sarvam.
Capability table reflects Sarvam docs checked 2026-09-30:
* sarvam-translate:v1 — 22 scheduled Indian languages incl. Nepali (ne-IN), 2,000 chars/request.
* bulbul (TTS) — 11 languages (10 Indian + English); Nepali is NOT listed.
* saarika/saaras (STT) — same 11-language family; Nepali is NOT listed.
Re-check https://docs.sarvam.ai before relying on this; capabilities can change.
"""
from __future__ import annotations

import hashlib
import logging
from collections import OrderedDict
from typing import Any, Callable

import requests

try:
    from .config import settings
except ImportError:  # pragma: no cover
    from config import settings

log = logging.getLogger("bhudrishti.sarvam")
BASE_URL = "https://api.sarvam.ai"

LANGUAGES = {
    "en": {"label": "English", "native": "English", "code": "en-IN", "translate": True, "tts": True, "stt": True},
    "ne": {"label": "Nepali", "native": "नेपाली", "code": "ne-IN", "translate": True, "tts": False, "stt": False},
    "hi": {"label": "Hindi", "native": "हिन्दी", "code": "hi-IN", "translate": True, "tts": True, "stt": True},
}

# Static fallbacks for templated alert messages (mirrors shared/src/i18n.js).
TEMPLATES = {
    "advisory": {
        "en": "Advisory: unusual ground vibration detected near {place}. Stay alert and away from the riverbank.",
        "ne": "सूचना: {place} नजिक असामान्य जमिन कम्पन देखियो। सतर्क रहनुहोस् र नदी किनारबाट टाढा बस्नुहोस्।",
        "hi": "सूचना: {place} के पास असामान्य कंपन दर्ज हुआ। सतर्क रहें और नदी किनारे से दूर रहें।",
    },
    "watch": {
        "en": "Watch: vibration at {place} confirmed by two independent sensors. Prepare to move to higher ground.",
        "ne": "सावधान: {place} मा कम्पन दुई स्वतन्त्र सेन्सरले पुष्टि गरे। अग्लो ठाउँमा जान तयार रहनुहोस्।",
        "hi": "सावधान: {place} पर कंपन की पुष्टि दो स्वतंत्र सेंसरों ने की। ऊँचे स्थान पर जाने के लिए तैयार रहें।",
    },
}


class SarvamAdapter:
    def __init__(self, api_key: str | None = None, post: Callable[..., requests.Response] | None = None, cache_size: int = 500,
                 on_cache_write: Callable[[dict[str, Any]], Any] | None = None) -> None:
        self.api_key = settings.sarvam_api_key if api_key is None else api_key
        self._post = post or requests.post
        self.cache: OrderedDict[str, str] = OrderedDict()
        self.cache_size = cache_size
        self.on_cache_write = on_cache_write
        self.last_error: str | None = None

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    def capabilities(self) -> list[dict[str, Any]]:
        return [{"code": code, "label": v["label"], "native": v["native"],
                 "translate": self.configured and v["translate"], "tts": self.configured and v["tts"], "stt": self.configured and v["stt"],
                 "static_ui": True, "provider": "sarvam" if self.configured else "static"} for code, v in LANGUAGES.items()]

    @staticmethod
    def cache_key(text: str, source: str, target: str) -> str:
        return hashlib.sha256(f"sarvam-translate:v1|{source}|{target}|{text}".encode()).hexdigest()

    def _headers(self) -> dict[str, str]:
        return {"api-subscription-key": self.api_key, "Content-Type": "application/json"}

    def translate(self, text: str, target: str, source: str = "en") -> dict[str, Any]:
        """Return {text, provider, cached}. Falls back to the source text with provider='none'."""
        src, tgt = source.split("-")[0], target.split("-")[0]
        if src == tgt:
            return {"text": text, "provider": "identity", "cached": False}
        if tgt not in LANGUAGES or not LANGUAGES[tgt]["translate"]:
            return {"text": text, "provider": "none", "cached": False, "reason": "unsupported language"}
        key = self.cache_key(text, src, tgt)
        if key in self.cache:
            self.cache.move_to_end(key)
            return {"text": self.cache[key], "provider": "sarvam", "cached": True}
        if not self.configured:
            return {"text": text, "provider": "none", "cached": False, "reason": "SARVAM_API_KEY not configured"}
        try:
            response = self._post(f"{BASE_URL}/translate", headers=self._headers(), timeout=10, json={
                "input": text[:2000], "source_language_code": LANGUAGES[src]["code"], "target_language_code": LANGUAGES[tgt]["code"],
                "model": "sarvam-translate:v1"})
            response.raise_for_status()
            translated = response.json()["translated_text"]
        except (requests.RequestException, KeyError, ValueError, TypeError) as exc:
            self.last_error = type(exc).__name__
            log.warning("sarvam translate failed: %s", self.last_error)
            return {"text": text, "provider": "none", "cached": False, "reason": "translation service unavailable"}
        self.cache[key] = translated
        while len(self.cache) > self.cache_size:
            self.cache.popitem(last=False)
        if self.on_cache_write:
            self.on_cache_write({"cache_key": key, "source_lang": src, "target_lang": tgt, "source_text": text[:2000], "translated_text": translated, "provider": "sarvam"})
        return {"text": translated, "provider": "sarvam", "cached": False}

    def tts(self, text: str, lang: str) -> dict[str, Any]:
        info = LANGUAGES.get(lang)
        if not info or not info["tts"]:
            return {"audio_base64": None, "reason": f"text-to-speech not available for {lang}"}
        if not self.configured:
            return {"audio_base64": None, "reason": "SARVAM_API_KEY not configured"}
        try:
            response = self._post(f"{BASE_URL}/text-to-speech", headers=self._headers(), timeout=15,
                                  json={"text": text[:1500], "target_language_code": info["code"]})
            response.raise_for_status()
            return {"audio_base64": response.json()["audios"][0], "format": "wav", "provider": "sarvam"}
        except (requests.RequestException, KeyError, ValueError, IndexError, TypeError) as exc:
            self.last_error = type(exc).__name__
            return {"audio_base64": None, "reason": "speech service unavailable"}


def template_message(level: str, lang: str, place: str) -> dict[str, Any]:
    templates = TEMPLATES.get(level, TEMPLATES["advisory"])
    text = templates.get(lang) or templates["en"]
    return {"text": text.format(place=place), "provider": "static-template", "lang": lang if lang in templates else "en",
            "reviewed": lang == "en"}


sarvam = SarvamAdapter()
