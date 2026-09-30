# AI and language provider recommendations

Checked 2026-09-30. Free tiers and prices change often; confirm on each provider's page
before relying on them. Nothing below is required: without keys the agents use the
in-process rules engine and the UI uses bundled strings.

| Provider (adapter) | Cost | Typical limits | Privacy | Notes |
| --- | --- | --- | --- | --- |
| Rules engine (`rules`) | Free, local | none | nothing leaves the server | Always runs; the safety floor |
| Ollama (`ollama`) | Free, local (your hardware) | hardware-bound | stays on your machine | Best default for field laptops; needs a model pulled |
| Groq (`groq`) | Free tier + paid | ~30 req/min; daily request/token caps per model | prompts go to Groq cloud | Fast open models; limits vary by model |
| OpenRouter `:free` routes (`openrouter`) | Free routes + paid | ~20 req/min; ~50 req/day (≈1,000/day after a one-time credit purchase) | routed to third-party hosts; free routes may log prompts | Good fallback, unreliable at peak |
| Google Gemini API (`gemini`) | Free tier + paid | per-model quotas shown in AI Studio; Google no longer publishes a fixed free table | free-tier prompts may be used to improve Google products | Do not send personal data on free tier |
| Hugging Face Inference Providers (`huggingface`) | Very small monthly free credit, then pay-as-you-go | credit-bound | prompts sent to the selected provider | Useful for trying specific open models |
| **GrokBot / xAI (`grok`)** | **Paid** (promotional/data-sharing credits may exist; do not assume free) | account-dependent | prompts sent to xAI; review data-sharing terms | Adapter provided; off by default |
| **Sarvam AI** (`backend/sarvam.py`) | **Paid** API with trial credits | 2,000 chars/translate request | server-side only | `sarvam-translate:v1` covers Nepali (`ne-IN`); Bulbul TTS and Saarika/Saaras STT do **not** list Nepali |

Sources (paraphrased): [OpenRouter limits](https://openrouter.ai/docs/api_reference/limits),
[Groq rate limits](https://console.groq.com/docs/rate-limits),
[Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits),
[xAI pricing](https://docs.x.ai/developers/pricing),
[HF pricing](https://huggingface.co/docs/inference-providers/main/pricing),
[Sarvam Translate](https://docs.sarvam.ai/api-reference-docs/models/sarvam-translate),
[Sarvam TTS languages](https://docs.sarvam.ai/api-reference-docs/text-to-speech/models/bulbul).

## Recommended configuration

* **Prototype / demo:** rules only (no keys). Deterministic and free.
* **Field pilot:** `AGENT_PROVIDER_ORDER=ollama,groq,openrouter,rules` with a small local model
  on the operator laptop; cloud free tiers only as backup and only with non-personal data.
* **Production:** a contracted provider with a data-processing agreement plus Ollama as the
  offline fallback. Keep the rules engine as the floor — alerts must never depend on an LLM.
* **Language:** static reviewed templates for alert text (fastest, offline); Sarvam for
  operator-authored or agent-drafted text, cached in `translations`. Nepali audio needs a
  different TTS (e.g. a local model) or pre-recorded messages.

Each adapter only calls out when its key and model env vars are set (`XAI_API_KEY`+`XAI_MODEL`,
`GROQ_API_KEY`+`GROQ_MODEL`, `OPENROUTER_API_KEY`+`OPENROUTER_MODEL`, `GEMINI_API_KEY`+`GEMINI_MODEL`,
`HF_API_TOKEN`+`HF_MODEL`, `OLLAMA_BASE_URL`+`OLLAMA_MODEL`). 429s trigger a cooldown
(Retry-After honoured), auth errors disable a provider for an hour, three consecutive
failures open a circuit breaker.
