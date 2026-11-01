# 5K Compass engineering team

The coordinator owns master issue [#3](https://github.com/vitorwa5/RunSaturday/issues/3), backlog sequencing and integration. Four standalone project agents live in `agents/`: developer, qa_tester, security_reviewer and release_engineer. Their TOML files define their role, model and instructions. Global defaults enable delegation with at most four spawned threads (the primary thread is excluded), using GPT-6.1 Sol and medium reasoning.

Configuration follows the current [Codex subagent documentation](https://developers.openai.com/codex/subagents) and [configuration reference](https://developers.openai.com/codex/config-reference), checked 2026-11-01. Python `tomllib` parsed all five TOML files and checked the three required custom-agent fields. The installed CLI is `0.159.0-alpha.3` and reports `multi_agent` stable/enabled. CLI strict startup validation was blocked by its read-only default SQLite state directory; no successful named-role discovery is claimed from that attempt.

The current chat runtime exposes native `spawn_agent` with task names, model and effort overrides, but no custom-role selector or configuration reload. The coordinator therefore passes each definition explicitly to a native subagent, assigns a separate worktree and limits active workers to four. Writing these files does not create a persistent background service. Future trusted Codex sessions can discover project roles normally; this session reports actual spawned tasks separately.

## Execution rules

1. Read `AGENTS.md`; use assigned isolated branches/worktrees. Never switch another agent's checkout.
2. Record concrete issue evidence and acceptance checks before implementation. Preserve deterministic algorithms and private canonical history.
3. Reserve the single shared database/browser validation lane with the coordinator. Never run Prisma generation or database suites while another worker uses a watched API/browser server. Vitest uses one worker; Playwright uses the configured pinned browser and IPv4-first DNS.
4. Developer implements. QA reproduces and runs checks independently. Security reviews code it did not implement. Release engineer prepares and tests local packaging and operations. Findings return to the developer for remediation, then independent recheck.
5. Report commands, real outcomes, skipped checks, commit IDs, blockers and next executable task at each stage. No fabricated pass claims or fabricated public data.
6. PRs are review artifacts. Main merges and production deployment require explicit owner approval. Real credentials, billing and data-source rights are external dependencies; never commit secrets or read them from source.

The absence of authorized public event/results data and production infrastructure access blocks a live production verdict, not safe local implementation, test, review or release preparation.
