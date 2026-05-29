# Chat Logic And Context Management Audit

Date: 2026-05-29

## Scope

This audit covers the current production chat path after the OpenRouter/Supabase/Vercel migration:

- frontend message assembly in `src/hooks/use-chat-send.ts`
- SSE transport in `src/lib/stream.ts`
- Supabase Edge Function orchestration in `supabase/functions/chat/index.ts`
- context summarization in `supabase/functions/context-summary/index.ts`
- source numbering and citation rendering in `supabase/functions/chat/numbered-sources.ts`

It focuses on whether the chat logic is aligned with modern long-running LLM conversation standards: state management, compaction, source-aware follow-ups, user memory, document grounding, and token budgeting.

## Executive Verdict

The current chat system is workable and has materially stronger citation controls than the original Lovable/Claude path. The numbered `[Quelle N]` architecture, verified-source filtering, deterministic scrubber, and OpenRouter migration are the right direction.

It is not yet up to modern standards for high-stakes, long-running legal conversations. The biggest gap is not the model. It is context assembly: the app still uses a message-count threshold, a lossy free-text summary, client-side compaction, and naive document stuffing instead of a server-owned token-budgeted context builder with structured rolling memory and retrieval-aware recall.

## Current Behavior

### Conversation History

- The frontend compacts after `MAX_CONTEXT_MESSAGES = 20`, described as about 10 user/assistant pairs.
- When there are more than 20 messages, it sends one synthetic `system` message containing a summary plus the last 20 messages.
- The server accepts at most 40 messages per chat request. Direct callers that bypass the frontend get a hard error instead of server-side compaction.
- The frontend initially fetches only 100 persisted messages for a chat.

Relevant code:

- `src/hooks/use-chat-send.ts`: `MAX_CONTEXT_MESSAGES = 20`, fallback summary, LLM summary request, `truncateMessages()`
- `src/lib/chat-api.ts`: `fetchMessages(chatId, limit = 100)`
- `supabase/functions/chat/index.ts`: `MAX_SERVER_MESSAGES = 40`

### Summary / Compaction

- The summary function receives only the older messages that fell outside the last 20-message window.
- `context-summary` caps the summary input to the first 30 old messages and truncates each to 500 characters.
- The summary output is free text, not a strict JSON schema.
- If OpenRouter fails, the frontend fallback keeps only the last 8 short snippets from the old messages.
- The summary cache is keyed by `chatId` plus old-message count, not by content hash or latest summarized message id.

This means a long chat can lose middle-history facts. For example, if a chat has 80 messages, the current summary can summarize only the earliest 30 old messages, then append the latest 20. Messages 31-60 can effectively disappear from the model context.

### User Memory

The server injects only lightweight profile preferences:

- display name, but not as a salutation
- role
- custom instructions
- response style
- default jurisdiction indirectly through chat filters

There is no durable matter/chat memory for:

- key facts established in the conversation
- user goals
- prior legal conclusions
- verified source commitments
- open questions
- cited but later corrected points
- uploaded-document findings

### Follow-Up Retrieval

Follow-up query enrichment uses only:

- the last 4 messages
- the first user message
- regex-extracted norms, RS numbers, case numbers, and a few capitalized legal nouns

It does not use the generated conversation summary, prior verified source map, uploaded document hits, or a semantic search over previous chat turns. This is brittle for follow-ups like "does the same apply if..." after a long discussion.

### Source Context

The frontend builds two source payloads:

- legacy text `sourceContext`
- structured `source_items`

Only evidentiary sources should enter `source_items` and the numbered source map. Search utility/fallback sources are filtered out. This is good.

Budgets today:

- `sourceContext`: 2,000 words simple, 3,000 medium, 4,000 complex
- source count: 6 simple/medium, 8 complex
- `source_items` snippets: 1,600 characters per item
- server validation: up to 20 `source_items`, each text field up to 10,000 chars

Remaining issue: verification uses only `sourceContext.slice(0, 5000)` from the frontend. If future clients send only structured `source_items` or rely only on server tool results, the client-side verifier may skip or under-check the answer even though a source map exists.

### Document Context

Uploaded document grounding currently loads:

- up to 100 `legal_documents` chunks
- grouped by file
- first chunks in `chunk_index` order
- each file truncated to 15,000 characters

This is first-N context stuffing, not document RAG. It can miss the relevant clause in a 100-page contract if the answer sits late in the file, and it can waste prompt budget on irrelevant opening text.

### Tooling / Model Calls

The server now uses OpenRouter `openai/gpt-5.5` for chat/tool routing with low reasoning effort. This matches the recent latency change.

Current chat tool limits:

- one tool round
- at most two tool calls per round
- legal questions force tool usage unless the client already supplied rich source context or the task is direct document/text processing
- final answer streams with `maxTokens: 2048`

This is a reasonable latency/safety tradeoff for normal questions, but complex multi-issue legal prompts can require more than two source lookups. The system should make that tradeoff explicit per query complexity rather than fixed globally.

### Citation Guardrails

This area is now comparatively strong:

- LLM-visible sources are numbered `[Quelle N]`.
- `doc_ref` is not shown to the model but is kept in `source_map` for scrubber matching.
- titles/snippets are stripped of RS/GZ/ECLI/CELEX-style citation tokens before entering the prompt.
- the renderer replaces mapped `[Quelle N]` tokens with source links and drops out-of-bounds tokens.
- the scrubber rewrites source-backed hard citations to `[Quelle N]` and removes unsupported hard citations.

Remaining architectural issue: the final verification/scrub before persistence is still primarily frontend-owned. A direct caller of the `chat` Edge Function can receive streamed text without the same persistence gate. For a legal product, server-side finalization should be canonical.

## Modern Standard Comparison

Current provider guidance has moved beyond simple "send the last N messages" patterns:

- OpenAI documents stateful conversation APIs and explicitly notes that Chat Completions users must manage state themselves. It also documents server-side and standalone compaction for long-running conversations, where compaction is triggered by rendered token count rather than message count.
- OpenAI prompt caching guidance recommends stable prompt prefixes and pushing dynamic/user-specific content later in the request.
- OpenRouter prompt caching similarly recommends keeping the initial message array stable and moving variations toward the end.
- OpenRouter structured-output guidance recommends `response_format: json_schema` plus `provider.require_parameters=true` for schema-dependent tasks.
- OpenRouter message transforms can compress oversized prompts, but it removes/truncates from the middle and is explicitly better for cases where perfect recall is not required. That is not ideal as the primary memory strategy for legal advice.

References:

- OpenAI conversation state: https://developers.openai.com/api/docs/guides/conversation-state
- OpenAI compaction: https://developers.openai.com/api/docs/guides/compaction
- OpenAI prompt caching: https://developers.openai.com/api/docs/guides/prompt-caching
- OpenRouter structured outputs: https://openrouter.ai/docs/guides/features/structured-outputs
- OpenRouter prompt caching: https://openrouter.ai/docs/guides/best-practices/prompt-caching
- OpenRouter message transforms: https://openrouter.ai/docs/guides/features/message-transforms

## Main Findings

### P1: Message-Count Compaction Is Too Crude

The app compacts based on 20 messages, not token budget, relevance, source commitments, or answer risk. Ten short turns and ten long pasted-document turns are treated the same.

Recommended change:

- move context assembly to the chat Edge Function
- use a token budget ledger for system prompt, memory, sources, docs, recent messages, and output reserve
- keep recent turns by token budget, not fixed message count
- apply server-side fallback compaction if a client sends too much history

### P1: Summary Can Drop Important Middle History

`context-summary` summarizes only `messages.slice(0, 30)` from the old segment. In long chats, middle turns can disappear. The fallback summary is even more lossy.

Recommended change:

- replace free-text summary with a strict schema:
  - `topic`
  - `user_goal`
  - `established_facts`
  - `legal_questions`
  - `prior_conclusions`
  - `verified_sources`
  - `open_questions`
  - `document_findings`
  - `warnings_or_corrections`
- summarize every dropped turn, not just the first 30
- store the summary per chat in the database with `covered_until_message_id`
- update incrementally as new turns age out of the live window

### P1: Follow-Up Retrieval Is Not Source-Aware Enough

Follow-up retrieval uses a regex-enriched query from the last 4 messages and first user message. It does not reuse prior source maps or matter memory.

Recommended change:

- store verified sources attached to each assistant answer
- include the last relevant verified sources in follow-up retrieval planning
- for follow-up questions, retrieve over:
  - current user message
  - structured chat summary
  - last answer's verified sources
  - current matter/document context
- add tests where a follow-up depends on a source found 15+ turns earlier

### P1: Verification Should Be Server-Side Before Persistence

The frontend currently runs the post-stream scrub/verification before writing the final answer. That improves the browser UX, but the Edge Function is still the producer of legal text and should own the canonical finalization path.

Recommended change:

- stream draft content to the UI as now
- have the Edge Function produce a final verified answer event or finalization endpoint
- persist only the server-verified answer
- make frontend rendering a view concern, not the source of truth for legal safety

### P1: Document Grounding Needs Real RAG

The app loads the first 100 chunks and truncates each file to 15,000 characters. That is not robust for long contracts, case bundles, or knowledge-base files.

Recommended change:

- embed and retrieve relevant uploaded chunks per question
- rerank chunks before prompt assembly
- cite uploaded file chunks separately from public legal sources
- reserve document context budget independently from public-law source budget

### P2: Prompt Budget And Cache Shape Need Tightening

The current system prompt is large and dynamic content is appended in the same system message. Prompt caching works best with stable prefixes and dynamic content later.

Recommended change:

- split prompt into stable instructions first, dynamic context later
- measure prompt tokens per section and log them
- keep model/tool definitions stable across requests
- consider OpenRouter/OpenAI prompt-cache telemetry in usage logs if exposed

### P2: User Memory Is Too Thin For Professional Workflows

Profile preferences exist, but there is no matter-aware working memory.

Recommended change:

- add per-chat and per-matter memory records
- expose a UI view where the user can inspect/delete saved memory
- store only legally relevant, user-approved persistent facts by default
- keep volatile conversation memory separate from durable matter facts

### P2: Tool Call Budget Should Scale With Query Complexity

One round and two tool calls are good for latency, but not always enough for complex legal prompts involving statutes plus case law plus administrative guidance.

Recommended change:

- keep the default fast path
- allow a second retrieval/tool round for complex prompts, explicit "gründlich" prompts, or low-confidence retrieval
- show this in the thinking/status UI so users understand why a deeper answer takes longer

## Recommended Target Architecture

### Context Assembly Order

Build the final model input server-side in this order:

1. stable system/developer instructions
2. user profile and explicit answer preferences
3. current matter/chat structured memory
4. current user message
5. verified source block
6. retrieved uploaded-document chunks
7. recent conversation turns by token budget
8. compacted older conversation summary
9. final no-hallucination and answer-format guardrails

The exact order can be tuned for cache performance, but the builder should own a token budget for every section.

### Suggested Budgets

These are starting targets, not hard product requirements:

- reserve 2,000-3,000 output tokens for final prose
- recent turns: keep the newest 8-12 turns if they fit, otherwise trim by token count
- structured memory: 1,000-2,000 tokens
- public legal sources: 6-10 highly relevant verified sources
- uploaded docs: 8-16 reranked chunks, not first-N chunks
- no single source/doc section should be allowed to crowd out the current user request

### Summary Schema

Use strict JSON for compaction output:

```json
{
  "topic": "string",
  "user_goal": "string",
  "established_facts": ["string"],
  "legal_questions": ["string"],
  "prior_conclusions": ["string"],
  "verified_sources": [
    {
      "provider": "string",
      "title": "string",
      "url": "string",
      "doc_ref": "string",
      "supports": "string"
    }
  ],
  "open_questions": ["string"],
  "document_findings": ["string"],
  "warnings_or_corrections": ["string"]
}
```

### Minimum Tests To Add

- 25-turn chat keeps an important fact from turn 3 after compaction.
- 60-turn chat does not drop middle-history legal conclusions.
- Follow-up after compaction reuses an earlier verified source.
- A direct Edge Function caller sending 60 messages gets server-side compaction, not a hard error.
- Uploaded 100-page document: question about a late clause retrieves the late chunk.
- Prompt snapshot shows dynamic source/doc/user content is separated from stable instructions.
- Usage logging records prompt section token counts.
- Verification runs when structured `source_items` or server tool sources exist, even if legacy `sourceContext` is empty.

## Priority Plan

### Phase 1: Make Compaction Correct

- Move context assembly into `supabase/functions/chat`.
- Add `chat_context_summaries` table or equivalent per-chat summary storage.
- Replace free-text summary with strict JSON schema.
- Summarize all dropped turns incrementally using `covered_until_message_id`.
- Keep frontend compaction only as a defensive fallback.

### Phase 2: Make Follow-Ups Source-Aware

- Persist assistant `source_map` entries per message.
- Feed prior verified sources into follow-up retrieval planning.
- Add regression tests around long legal follow-ups and prior source reuse.

### Phase 3: Replace Document Stuffing With Document RAG

- Query uploaded-document embeddings for each user message.
- Rerank candidate chunks.
- Build a separate uploaded-document source map.
- Render document citations separately from public legal citations.

### Phase 4: Tighten Prompt And Telemetry

- Split stable and dynamic prompt sections.
- Add token counting before LLM calls.
- Log per-section token counts and cache usage if returned by provider.
- Scale tool rounds and source budget by query complexity.

## Bottom Line

For short legal chats, the current implementation is usable and much safer on citations than before. For long-running professional legal work, it is not enough. The next serious hardening pass should focus on server-owned context assembly, structured rolling memory, source-aware follow-ups, and document RAG. These changes will likely reduce hallucinations more than changing the reasoning effort again.
