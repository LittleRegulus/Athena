# Athena architecture and Infinet research notes

Research date: August 8, 2026.

## What Infinet appears to be

Infinet is a web application around third-party large language models, not one single ChatGPT-like model created entirely by the site. Its own Terms describe it as a unified interface to multiple third-party LLMs and name Venice.ai as the inference provider. Its Privacy Policy says it also uses Clerk for authentication, Stripe for billing, Railway for hosting/database, and Firecrawl for URL scraping.

Public sources:

- [Infinet Terms of Service](https://infinetai.org/terms)
- [Infinet Privacy Policy](https://infinetai.org/privacy)
- [Infinet pricing/features](https://infinetai.org/pricing)
- [Venice API overview](https://docs.venice.ai/overview/about-venice)

The practical request path is therefore approximately:

```text
Browser UI
   |  authenticated HTTPS request
   v
Infinet application backend
   |  provider API request + model choice + feature flags
   v
Venice inference gateway
   |  runs or routes the selected LLM
   v
Streamed tokens return to the browser
```

The quality and behavior mainly come from the selected base model, the system prompt, model parameters, optional tools such as web search, and any application-side context or retrieval. Calling it “uncensored” does not mean the website itself is the LLM.

## Why this repository is a clean-room build

Infinet's Terms say its code, design, branding, and content are owned by Clarity Digital Development. They also prohibit reverse engineering, decompilation, scraping that burdens the service, and redistribution. Unlike Panoptes' open-source Osiris base, no public Infinet source license was found. Athena therefore recreates the general product category and workflow without copying Infinet bundles, source, branding, or protected assets.

## How Athena works

```text
React client                     Local Express server                  Venice API
------------                     --------------------                  ----------
browser safety copy  --------->  SQLite in data/athena.db
file upload          --------->  data/attachments
active context        --------->  POST /api/chat          ----------->  selected LLM
Markdown UI           <--------- SSE byte stream         <-----------  token stream
image prompt          --------->  POST /api/images/generate ----------> selected image model
inline image          <--------- data/generated-images   <------------ base64 WebP
reference + prompt    --------->  POST /api/images/generate ----------> private image-edit model
edited image          <--------- data/generated-images   <------------ binary image
                                 API key stays here
```

The Express server stores conversations, Trash, profile settings, terms, and the local usage ledger in `data/athena.db`. Browser data under `athena:conversations:v1` is imported once per database and retained as a safety copy. Imports, daily state, manual backups, and pre-Trash snapshots are written as readable JSON under `data/backups`. When the user sends a message, the client posts only the active conversation, chosen allow-listed model, and web-search flag to the local Express API. The server adds Athena's system prompt, authenticates to Venice with `VENICE_API_KEY`, and pipes Venice's Server-Sent Events stream back unchanged. The client parses each SSE event and progressively renders `choices[0].delta.content`.

The hosted iPhone build uses a second deployment path:

```text
GitHub Pages PWA             Firebase                    Venice API
----------------             --------                    ----------
Firebase login       ------> Authentication
encrypted IndexedDB          verifies ID token
active context       ------> protected Cloud Function -> selected model
streamed response    <------ SSE proxy                  <- token stream
                                 |
                                 +-- VENICE_API_KEY in Secret Manager
```

Authentication persistence is memory-only, so a fresh app launch requires another login. The PWA creates a random
device-vault master key, encrypts records with AES-256-GCM, and wraps the master key with a PBKDF2-SHA-256 key derived
from the current password. The Cloud Function accepts only verified tokens for Athena's allow-listed Firebase user
and only the GitHub Pages or loopback origins. Hosted attachment data stays in the encrypted vault between requests;
it is sent through the authenticated Function only when it is present in active context.

Uploaded originals are written to `data/attachments` under random IDs; only bounded metadata is saved in the chat
record. For active messages with attachments, the server reads those IDs, creates private base64 data URLs, and
sends Venice `file` blocks for documents/code or `image_url` blocks for images. The local server accepts only a
fixed file-type allow-list, a maximum of 25 MB per file, eight attachments per request, and 50 MB total attachment
context. Fenced code in responses is packaged into a ZIP entirely in the browser.

Image models use a separate allow-listed server route. Athena validates the selected model, prompt length,
composition, and adults-only acknowledgement, calls Venice's native `/image/generate` endpoint, decodes the returned
base64 image, and stores the WebP plus bounded metadata under `data/generated-images`. Chat records retain only the
generated-image ID and display metadata. The browser never receives the Venice API key or provider base64 payload.

When one consented reference image is attached, the same local route validates its random attachment ID, MIME type,
size, prompt, selected composition, and explicit permission acknowledgement before calling Venice's `/image/edit`
endpoint. The provider model is server-selected from a fixed mapping; Athena Lustify reference requests use the
private `qwen-edit-uncensored` edit model because `lustify-v8` itself supports text-to-image generation only. The
source remains a locally stored chat attachment and the edited output is stored like any other generated image.
Reference requests default to the provider's `auto` aspect ratio and receive a server-side edit constraint that
asks the model to retain the original identity, pose, camera perspective, framing, and all unmentioned regions.

The endpoint is OpenAI-compatible but Athena uses Venice-specific web-search flags. Relevant official documentation:

- [Chat completions endpoint](https://docs.venice.ai/api-reference/endpoint/chat/completions)
- [OpenAI compatibility and Venice parameters](https://docs.venice.ai/api-reference/api-spec)
- [Current model catalog](https://docs.venice.ai/models/overview)
- [API key setup](https://docs.venice.ai/guides/getting-started/generating-api-key)

## What “private” and “E2EE” actually mean

Local-only history prevents a remote chat database from accumulating, but inference still requires sending the prompt somewhere. Venice documents four privacy classes: anonymized, private/no-retention, TEE, and E2EE. E2EE models encrypt the prompt client-side and decrypt it only inside an attested Trusted Execution Environment. That protocol uses ephemeral secp256k1 ECDH keys, HKDF-SHA256, and AES-256-GCM.

Athena v0.1 uses a conventional server-side API proxy and Venice private/anonymized models. TLS protects transport, but this implementation is **not E2EE**. Adding verified E2EE correctly requires client-side key generation, attestation verification, encrypted streamed-message handling, and an eligible Venice model/account. See Venice's [TEE and E2EE guide](https://docs.venice.ai/guides/features/tee-e2ee-models).

## Security choices

- Provider credentials exist only in `.env` on the desktop server or Firebase Secret Manager for the hosted PWA.
- Firebase authentication is session-only, and the hosted provider proxy verifies the ID token and allow-listed user.
- Hosted durable browser records are encrypted with AES-GCM before IndexedDB writes them.
- The client cannot choose arbitrary provider model IDs; the server enforces an allow-list.
- JSON request size, conversation length, message length, and output token count are bounded.
- React Markdown does not enable raw HTML, reducing stored script-injection risk.
- The production server binds to loopback by default.
- Storage mutation endpoints reject non-local browser origins.
- SQLite writes are transactional, and browser imports plus Trash operations create recovery snapshots.

Before expanding beyond the single-user deployment, add per-user rate limits and quotas, App Check, structured audit
logs that exclude prompt content, automated secret rotation, and a carefully reviewed retention policy.
