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
- Live UI regression for `Unterbrechen gerichtliche Schritte, die die Geltendmachung eines Rechtes bloß vorbereiten, die Verjährung?` now finds the exact RIS Rechtssatz source `RS0034826`, shows the direct `Dokument.wxe` link, and does not repeat the old fabricated references (`RS0034891`, `RS0034403`, `RS0034830`, `RS0034431`, `2 Ob 72/10k`, `1 Ob 204/21p`, `4 Ob 110/07f`, `2 Ob 10/09v`).

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
- Fixed RIS Judikatur parsing for the current OGD schema by reading nested `Metadaten.Allgemein`, `Metadaten.Technisch`, and `Metadaten.Judikatur.Justiz` fields. Rechtssatz sources now extract the actual XML `ct="rechtssatz"` text and label the source panel with the exact Rechtssatz rather than only a generic OGH decision title.
- Added a deterministic frontend fallback that inserts a `[Quelle N]` token when the model returns an answer without any source token even though the server emitted verified sources. This keeps persisted answers linked to verified evidence.
- Added a prompt rule requiring directly responsive `Rechtssatz:` / `Leitsatz:` source text to be surfaced at the start of the answer with `[Quelle N]`, while still forbidding RS numbers, GZ, ECLI, and URLs in the answer body.
- Added a deterministic Rechtssatz anchoring pass that picks the source sentence with strong overlap against the generated answer. This prevents unrelated Rechtssatz results from being surfaced just because they appear earlier in the source map.
- Confirmed from Flo's mobile voice note that interrupted streams could lose the assistant answer on reload because messages were only persisted after final `onDone`. Added throttled assistant draft persistence during streaming and replace the draft with the verified final answer after completion.
- Added an immediate fallback chat title for first-message chats so interrupted first answers no longer leave the sidebar stuck at `Neuer Chat`; successful completions still refine the title through the title generator.
- Render bare `Quelle 2` / `Quellen 1 und 3` mentions as source footnotes, covering the mobile observation where a second source marker appeared unlinked.
- Live retest with the built-in Datenschutz prompt exposed RIS false positives for `DSt` / Disziplinarstatut and unrelated Rechtssatz intros. Added a RIS Datenschutz source filter so DSG/DSGVO/Datenschutz queries only keep RIS evidence whose own title/snippet/ref contains privacy-law signals; otherwise the answer falls back to the explicit no-verified-sources path instead of citing unrelated RIS documents.
- Production smoke testing on 2026-05-29 exposed OpenRouter streamed provider errors (`data: { error }` with code `429`) being converted into the generic assistant interruption notice. Fixed the chat stream proxy so these remain retryable errors instead of saved assistant content.
- Production smoke testing for the RS0034826 prompt confirmed retrieval returns the exact Rechtssatz as top verified evidence, but low-relevance verified RIS documents were still included as extra numbered-source candidates. Added a source payload filter that drops low-relevance rerank noise once a strong relevant hit exists.
- Production browser recovery test on 2026-05-29 confirmed persisted streaming drafts now render as a background-loading state instead of raw retry prose. When the same message row is later replaced with the final DB answer, the open chat view auto-refreshes and removes the draft/loading note.

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
- Mobile onboarding still needs a focused UX pass. The product tour and confidentiality/AI disclosure consent can be awkward to dismiss on a phone, especially if they appear close together.
- Datenschutz/DSGVO coverage needs a proper provider expansion pass. The new filter prevents wrong RIS sources, but the app may now answer some Datenschutz prompts with no verified source instead of retrieving EUR-Lex/CURIA/DSB-specific evidence.
- Direct calls to the `chat` Edge Function without frontend/client retrieval can still under-source some case-law questions because the model may choose only `lookup_norm` and seed a statute source. The browser app path performs retrieval first and passes `source_items`, but the server should eventually run the same retrieval planner itself for direct API robustness.

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
- Live direct RIS API check: exact query text with `bloß` / `Verjährung` returned the Rechtssatz document `JJR_19790510_OGH0002_0080OB00514_7900000_001` and `RS0034826`.
- Live UI RS0034826 regression: because browser automation could not type `ß` / `ä`, submitted the transliterated prompt with `bloss` / `Verjaehrung`; retrieval still resolved the exact official RIS Rechtssatz and direct document URL.
- Final live UI RS0034826 regression after source anchoring: answer body begins with `Gerichtliche Schritte, die die Geltendmachung eines Rechtes bloß vorbereiten, unterbrechen die Verjährung nicht.` and links it to the verified source footnote; source panel shows `RIS-Justiz RS0034826`; no old fabricated references were present; console had no app errors.
- Production Edge Function smoke after retry fix: `Was ist Mord nach § 75 StGB in Österreich?` returned a real streamed answer on first attempt, direct RIS `§ 75 Strafgesetzbuch` source, no raw URL, and no generic RIS search URL.
- Production frontend-style RS0034826 flow after source-noise filter: retrieval top hit was `RIS-Justiz RS0034826`, chat source map included that exact document, answer said the preparatory steps do not interrupt limitation, and the answer contained no raw RS number or raw URL.
- Production browser refresh-recovery simulation: opened a chat containing a recent assistant draft marker, verified the UI showed `Antwort wird im Hintergrund fertiggestellt` without exposing the raw `Antwort wird noch erstellt...` suffix, updated the same DB message to final text, and verified the visible chat replaced the draft with the final answer automatically.
- Production browser retest for `Unterbrechen gerichtliche Schritte, die die Geltendmachung eines Rechtes bloß vorbereiten, die Verjährung?` exposed two separate link paths: the verified source card now opens the exact RIS Rechtssatz `RS0034826` via `Dokument.wxe`, and inline `§ 1497 ABGB` links now use a verified `NormDokument.wxe` URL instead of the previous `Ergebnis.wxe` overview/search page.
- 2026-05-30 built-in browser source-link smoke tests verified rendered source-card destinations, not backend-only source maps:
  - `Unterbrechen gerichtliche Schritte, die die Geltendmachung eines Rechtes bloss vorbereiten, die Verjaehrung?` opened direct RIS `Dokument.wxe` Rechtssatz pages, including `RS0034826`.
  - `Was ist Mord nach Paragraf 75 StGB? Bitte mit Quellen.` opened direct RIS `Dokument.wxe` Rechtssatz pages. This still needs a relevance pass so exact `§ 75 StGB` is preferred when the query is primarily a norm question.
  - `Was regelt Paragraf 5 StGB zum Vorsatz? Bitte mit Quellen.` opened the exact direct RIS `NormDokument.wxe` URL for `§ 5 StGB`.
  - `Was regelt Paragraf 83 StGB zur Koerperverletzung? Bitte mit Quellen.` initially missed exact norm seeding for the typed `Paragraf` form; fixed and deployed retrieval parsing. Retest opened the exact direct RIS `NormDokument.wxe` URL for `§ 83 StGB`, plus one unrelated direct BGBl source that should be filtered later.
  - `Erklaere Paragraf 1295 ABGB zum Schadenersatz. Bitte mit Quellen.` opened the exact direct RIS `NormDokument.wxe` URL for `§ 1295 ABGB`.
  - `Was bedeutet Paragraf 1497 ABGB fuer die Unterbrechung der Verjaehrung? Bitte mit Quellen.` opened the exact direct RIS `NormDokument.wxe` URL for `§ 1497 ABGB`.
  - `Welche Kuendigungsfristen gelten nach Paragraf 20 AngG? Bitte mit Quellen.` opened the exact direct RIS `NormDokument.wxe` URL with `Artikel=1&Paragraf=20`.
  - `Was regelt Paragraf 33 FinStrG zur Abgabenhinterziehung? Bitte mit Quellen.` opened only direct `Dokument.wxe` links, but exposed a relevance bug: the source panel did not include the exact `§ 33 FinStrG` norm. Fixes were added for original-query preservation through decomposition, exact norm rerank protection, and FinStrG `Artikel=1`; Live QA quota reached `0 von 25` before this final fix could be re-run through the UI.
