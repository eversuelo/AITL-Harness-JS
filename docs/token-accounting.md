# Token accounting in the harness (how Runs are counted)

> Why the **Runs** tab shows ~42.6M tokens while Claude Code's `/context` shows ~250k.
> **This is not a contradiction: they measure different things.**

## TL;DR

| Measure | What it is | Value (run `d4227793`) |
|---|---|---|
| `/context` (Claude Code) | The **current size** of the context window — a snapshot | ~250.3k / 1M (25%) |
| Runs → `tokens total` | The **cumulative sum** billed across ALL API calls of the session | 42,664,539 |

`/context` answers *"how full is the window right now?"*.
Runs answers *"how many tokens were processed/billed summing all 272 turns?"*.

These are two different questions. One is a **stock** (instantaneous); the other is a
**cumulative flow** (an integral over time).

## Why the Runs number is so large

An agent like Claude Code runs a **loop**: on each turn it re-sends **almost the entire
context** to the API. With prompt caching, that repeated context is billed as `cache_read`
(≈0.1× the price of fresh input), but it **still counts as tokens** on every turn.

The harness, in `parseTranscript` (`src/context/capture.ts`), sums the `usage` of **each
assistant turn** in the transcript:

```
token_usage.input = Σ_turns ( input_tokens + cache_creation_input_tokens + cache_read_input_tokens )
token_usage.output = Σ_turns ( output_tokens )
```

With 272 turns and a window that grows to ~150–250k, re-reading the context each turn
accumulates tens of millions of `cache_read`.

## Real breakdown of this run (272 turns)

| Component | Tokens | % of input | Meaning |
|---|---:|---:|---|
| **cache_read** | 41,367,842 | 97.7% | Context **re-read** from cache each turn (cheap, ~0.1×) |
| cache_creation | 963,253 | 2.3% | Context **written** to cache once (~1.25×) |
| fresh input | 24,779 | 0.06% | Input never seen before (your new prompt per turn) |
| **total input** | **42,355,874** | 100% | Sum of the three above |
| **output** | **308,665** | — | Tokens **generated** by the model (no double counting) |
| **total** | **42,664,539** | — | input + output |

`cache_read` is **97.7%** of the total. That is why 42.6M ≠ "42.6M unique tokens were
spent".

## Which number to use for what

Depending on what you want to report:

1. **Real generated work** → `output` = **308,665**. Solid, no re-counting.
2. **Unique content ingested** (what the model read *at least once*, without re-reads) →
   `fresh input + cache_creation` ≈ **988k**.
3. **Billed cost** → you must **weight** by Anthropic's cache multipliers:

   ```
   input-equivalent = fresh×1.0 + cache_creation×1.25 + cache_read×0.1
                    = 24,779 + 1,204,066 + 4,136,784
                    ≈ 5,365,629 input-equivalent tokens
   ```

   Plus `output` at its rate (for Opus, ~5× the input). In other words, the **real cost** is
   equivalent to ~5.4M input + ~309k output, **not** 42.6M.
4. **Cumulative throughput** (tokens processed summing turns — a loop-efficiency metric) →
   the **42.6M**. Useful to compare C0 vs. C2: a loop that iterates more re-processes more
   context.

## Relationship between `/context` and Runs

- `/context` ≈ the input size of **one** turn (the current, largest one).
- Runs `input` ≈ the **Σ** of the input of **all** turns.
- Since each turn re-reads ~150k, and there were 272 turns:
  `41.4M cache_read / 272 ≈ 152k per turn`, which matches the window size.

In other words: **Runs ≈ /context × number of turns** (roughly, because the window grows).
The 25% in `/context` is the final state; the 42.6M is the integral.

## How the UI shows it

The **Runs** tab shows the `total` (42.6M) as the headline **and** the cache breakdown
(`creation`/`read`/`fresh`) underneath, precisely so the total does not mislead:
`host_meta.cache = { creation, read }` and `raw_input_tokens` (fresh) are persisted on the
run doc. `aitl run-show <runId>` exposes the same.

## Recommendation for the thesis (metric #7, efficiency)

For the metric to be defensible and not inflated by cache re-reads, report separately:

- **output_tokens** (generation) — the cleanest indicator of "model effort".
- **unique input** (`fresh + cache_creation`) — the context actually loaded.
- **weighted cost** (the formula above) — for economic comparisons.
- **cumulative throughput** (total) — only if the hypothesis is about the *loop's work*
  (e.g. C0 vs. C2: more iterations ⇒ more re-processing).

Comparing the raw `total` across conditions is still valid **if** both are measured the same
way (same model, same prompt caching), because the `cache_read` bias is systematic.

---

*Data source: the `runs` collection (ADR-0034 for `run-host`; ADR-0034/0035 for sessions
captured with `aitl capture-session`). The breakdown is extracted from the per-turn `usage`
of Claude Code's JSONL transcript.*
