# 0001: the factory is a LangGraph graph written in TypeScript

- Status: Accepted
- Date: 2026-10-02

## Context

The factory mixes steps of two kinds. Some are deterministic: run the linter,
read the CI checks, derive a version from a tag. Some are agentic: plan a
change, write code, review a diff. It also has to stop and wait for a person,
possibly for days, and resume without repeating an upload.

LangChain describes its own products this way: `create_agent` is "a minimal,
highly configurable harness", and LangGraph is the choice "for advanced needs
combining deterministic and agentic workflows", and its product guide lists
durable execution for long-running, stateful agents among the reasons to
pick it.

## Decision

Use LangGraph directly, with `@langchain/langgraph` in TypeScript.

- **LangGraph over a LangChain agent.** The pipeline is a fixed sequence of
  checks with agent steps inside it. That is the case LangGraph is documented
  for. A LangChain agent stays in use inside the `implement` node, where the
  work is open-ended.
- **TypeScript over Python.** Both libraries are MIT, both document
  `interrupt` with `Command` resume under the same rules, and both ship
  in-memory, SQLite and Postgres checkpointers. With parity on what the
  factory needs, one language for the app, the shared packages and the graph
  removes a second toolchain from CI. The version logic and the error
  contract are imported by the app and by the factory from the same package.
- **Human approval uses `interrupt()`.** The documentation says static
  breakpoints "are not recommended for human-in-the-loop workflows".
- **Checkpointer: SQLite** from `@langchain/langgraph-checkpoint-sqlite` for
  the CLI, in-memory for tests. Postgres is the documented production option
  and is a configuration change.

Python was the runner-up. It is the better pick when exporting the
orchestrator's own traces to an OTLP backend is a day-one requirement,
because the documented OpenTelemetry integration is written for Python.

## Consequences

- A node restarts from its first line when it resumes. Every side effect
  lives in a node of its own, after the node that holds the `interrupt`.
- `interrupt()` is never wrapped in `try/catch`, and a node holds at most one.
- An `interrupt` records a person's intent. It authenticates nobody: whoever
  can resume the thread can answer it. The control that protects the stores
  sits outside the graph (ADR 0008).
- LangSmith is optional. Tracing is off unless a key is configured, and
  nothing in the factory requires an account.
- One documented gap in the JavaScript SDK: error handlers are not available
  on `task` and `entrypoint`. The factory uses `StateGraph` nodes, where they
  are.

## Sources, read on 2026-10-02

- https://docs.langchain.com/oss/python/langchain/overview.md
- https://docs.langchain.com/oss/python/concepts/products.md
- https://docs.langchain.com/oss/javascript/langgraph/interrupts.md
- https://docs.langchain.com/oss/javascript/langgraph/checkpointers.md
- https://docs.langchain.com/oss/javascript/langgraph/fault-tolerance.md
- https://docs.langchain.com/langsmith/trace-with-opentelemetry.md
- https://github.com/langchain-ai/langgraphjs/blob/main/LICENSE
