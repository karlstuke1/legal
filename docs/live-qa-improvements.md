# Live QA Improvement Notes

Date: 2026-05-28
Environment: https://legal-gamma-three.vercel.app

## Confirmed Working

- Production app loads and renders the landing page after the initial client spinner.
- Login with a confirmed Supabase test user works.
- First-run onboarding progresses into `/app/chat`.
- Supabase Edge Function CORS allows the Vercel production origin.
- Deep links now load through Vercel after adding the SPA rewrite. Direct navigation to `/app/chat` no longer returns `404 NOT_FOUND`.
- Direct production chat replay for `Was ist Mord nach § 75 StGB? Bitte mit Quellen.` returns HTTP 200 and streams successfully from OpenRouter `openai/gpt-5.5-20260423`.
- The chat stream emits a `source_map` before answer text. For the murder query it included verified RIS `NormDokument.wxe` entries for `§ 75 StGB` and `§ 5 StGB`.
- Live UI chat submission works end to end: thinking animation appears, quota decrements, answer renders, console has no app errors, and inline statute links point to exact RIS `NormDokument.wxe` URLs.
- The source sidebar no longer floods with repeated `Agent-Recherche 1` rows. Tool results are deduped and regrouped under the real provider (`RIS`).
- GPT-5.5 reasoning is now set to `low` for chat/tool routing and schema-backed calls. Live norm answers are materially faster than the earlier high-reasoning run.
- Live UI AngG test after exact-norm seeding: `Paragraf 20 Angestelltengesetz` answered in about 30 seconds, cited `§ 20 AngG`, and rendered direct RIS `NormDokument.wxe` links instead of `Ergebnis.wxe` search pages.
- Same-chat follow-up test answered in about 33 seconds, preserved context, kept the exact `§ 20 AngG` link, and had no console errors or horizontal overflow in the in-app browser viewport.
- Route smoke checks passed for `/app/matters`, `/app/knowledge`, `/app/compare`, `/app/pinned`, and `/app/settings`: pages rendered, no console errors, no horizontal overflow at the tested width.

## Fixed During This QA Pass

- Fixed OpenRouter/OpenAI 400s from replayed native tool call transcript IDs by flattening tool results into ordinary system context before the final GPT-5.5 call.
- Fixed internal Edge Function calls from `chat` to `retrieval`/`semantic-search` by forwarding the user's auth header plus anon key instead of using the service key.
- Normalized common Austrian criminal-law model wording (`öStGB`, `oeStGB`) to `StGB` for retrieval/tool calls.
- Added a fast exact RIS norm path for `exactNormOnly` retrieval requests. It still verifies the RIS `NormDokument.wxe` page, but avoids slow decomposition/reranking/enrichment for precise norm lookups.
- Added Vercel SPA fallback rewrites in `vercel.json`.
- Normalized/deduped `SourcesPanel` input so duplicated tool wrapper groups do not create repeated source rows.
- Lowered OpenRouter GPT-5.5 reasoning effort from `high` to `low` across chat, retrieval/reranking, verification, document analysis, risk reports, contract comparison, pseudonymization, title generation, context summary, and embeddings-related LLM helpers.
- Reduced final chat answer token cap and softened the prompt's mandatory "full legal checklist" language so simple norm questions do not become long textbook answers.
- Added deterministic exact-norm seeding in the chat function: explicit `§` / `Paragraf` questions prefetch verified RIS norm sources before the LLM chooses tools.
- Persisted assistant-message source metadata so reloads and historical chats retain verified source context for source panels and inline link resolution.
- Fixed the no-source path so invented `[Quelle N]` tokens are stripped even when the server emits an empty `source_map`.

## Improvement Candidates

- Initial page load briefly shows a nearly blank screen with only a spinner. This is functional, but a branded loading state would feel more polished.
- Landing page hero/product-preview text appears visually soft/low-contrast in the in-app browser screenshot, especially the grey headline line and preview card. Recheck contrast and blur/filter choices on production.
- After onboarding, two blocking overlays appear at the same time: the product tour modal and the confidentiality notice. This makes the first authenticated screen feel crowded and visually confusing. Prefer showing the confidentiality notice first, then starting the tour after it is acknowledged.
- Some onboarding button interactions were flaky through semantic browser automation even though the UI state was correct. This may be an automation/runtime quirk, but it is worth checking focus, disabled-state timing, and accessible names for repeated buttons like `Weiter`.
- Chat latency improved after low reasoning and output caps, but norm answers still take about 30-50 seconds depending on tool calls. For a consumer-grade UX, target another pass that streams a short sourced answer first and optionally expands on demand.
- Citation presentation is not purely `[Quelle N]` in the rendered UI. The final answer is post-processed into superscript-style footnotes (`¹`, `²`) and inline statute links. The links are correct, but this should be aligned with the canonical numbered-source architecture if `[Quelle N]` is still the desired visible format.
- The final answer can include legal context that is not directly represented as a source card, though the latest run handled unsupported verjährung cautiously by citing the retrieved `§ 57 StGB` source. Keep testing this with harder fabricated-citation cases.
- The source sidebar starts collapsed; users must expand `RIS` to see source titles such as `§ 75 Strafgesetzbuch`, `§ 5 Strafgesetzbuch`, `§ 57 Strafgesetzbuch`, or `§ 20 Angestelltengesetz`. Consider auto-expanding when there are only a few verified sources.
- Browser viewport override did not take effect in this session: after setting `390x844` and reloading, `window.innerWidth` stayed `1440`. Mobile layout remains unverified from the in-app browser pass.
- The Browser automation environment could not type the `§` character directly because virtual clipboard support was unavailable. The UI was tested with `Paragraf 75 StGB`; the backend itself was separately tested with the exact `§ 75 StGB` query.
- File upload, real document embedding, compare execution, settings mutation, invite/referral flows, exports, and billing actions were not exhaustively exercised in this pass because they would require uploading/submitting data or changing account state. Their pages/forms loaded where route-smoked.

## Verification Run

- `deno check supabase/functions/retrieval/index.ts supabase/functions/chat/index.ts`
- `npx tsc --noEmit`
- `npm run build`
- `npm test -- src/test/render-source-tokens.test.ts src/test/openrouter-client.test.ts src/test/rerank.test.ts`
- Live direct retrieval: `§ 75 StGB Mord` with `exactNormOnly: true` returned verified `§ 75 Strafgesetzbuch` in about 2 seconds.
- Live direct chat replay: HTTP 200, `source_map` emitted, no `KI-Fehler`.
- Live UI chat: submitted `Was ist Mord nach Paragraf 75 StGB? Bitte mit Quellen.`, answer rendered with exact RIS norm links and no console errors.
- Live UI chat: submitted `Welche Kuendigungsfristen gelten nach Paragraf 20 Angestelltengesetz fuer Arbeitgeber? Bitte mit Quellen.`, answer rendered with exact `§ 20 AngG` RIS `NormDokument.wxe` links and no console errors.
- Live UI follow-up: submitted `Und wie unterscheidet sich das von der Arbeitnehmerkuendigung? Bitte kurz.`, answer preserved context and source links.
- Route smoke: `/app/matters`, `/app/knowledge`, `/app/compare`, `/app/pinned`, `/app/settings`.
