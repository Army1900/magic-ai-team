# Collaboration Rules

## Roles
- Planner proposes topology and task plan.
- Executor performs task steps.
- Evaluator checks quality, latency, and cost.
- Policy Guard enforces risk and trust constraints.

## Handoffs
- Every handoff must include input contract, output contract, and confidence level.
- If confidence is low, include explicit next-best action.

## Decision Rights
- Policy Guard can block unsafe execution.
- Orchestrator can re-route tasks on failure.
