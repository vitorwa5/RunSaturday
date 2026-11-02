# Next release workstream after B4

Prepared 2026-11-02. No merge or production deployment is authorized by this document.

## CENTRAL: originating-session enforcement

Highest actionable production blocker: non-B4 personal endpoints can receive an old view's intent with a replacement account's cookie when transition notifications are missed. Cookie ownership alone does not represent the originating view. Preserve private UserPerformance ownership and keep all personal evidence out of public analytics.

Start a focused branch from the final B4 integration candidate. Reuse the existing `50c9134` implementation selectively; do not overlay `eca92e2` wholesale. That older candidate would remove `auth/historyOperation.ts` and overwrite independently reviewed H1 hook integration.

1. Inventory contextual private reads, profile/settings, manual performances, favourites, export/deletion and authentication cookie transitions. Record necessary session-bootstrap/health/OTP exceptions explicitly.
2. Reconcile the existing central transport and server preconditions with H1's immutable originating session, shared authentication Web Lock, authoritative post-acquisition revalidation and request-completion lock lifetime. Retain M1 replay semantics and cookie-derived ownership.
3. Extend direct negative API tests for absent/stale bindings without positive-fixture refresh. Test missed notifications, A-to-B, same-account replacement, queued operations and in-flight cookie transitions across every private endpoint family.
4. Run API/database and browser suites sequentially using the supplied test database. Require independent QA/security review on the exact resulting commit. Reassess cached-client compatibility because CENTRAL changes the contract beyond B4.

Acceptance: stale private intentions are rejected before contextual read/write/delete, no cross-owner exposure or database change occurs, H1/M1 stay intact, and complete current validation passes. A B4 integration approval does not resolve this broader production blocker.

## Following independent preparation

Review and selectively integrate existing host-neutral packaging, PWA offline behavior and calendar-date validation work only after checking their divergence from final B4. Preserve all existing branches. Revalidate mobile navigation and every tool against honest unavailable states when authorized historical evidence is absent.

Public launch still needs owner decisions for licensed catalogue/results rights, hosting/database and budget, production domain/email credentials via secure bindings, repository licensing, and explicit deployment approval. Do not fabricate production rankings, scrape providers, purchase services or deploy while those decisions are pending.
