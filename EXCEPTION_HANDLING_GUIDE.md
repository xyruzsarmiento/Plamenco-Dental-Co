# Exception Handling Guide

Operational tasks surface exceptions; they never directly rewrite the underlying source state.

## Payment failure
Create a Payment Review task only from a trusted failed payment/provider state. Resolve the payment in Billing/Payments, then close the task. Do not mark payment successful from the task screen.

## Communication failure
Create a Communication Failure task only from the real delivery log failure state. Retry through the existing communication pipeline. `sent`/`delivered` remain provider-backed states.

## Consent pending
Link to the actual form assignment/appointment. Completion requires the real form submission or an explicitly authorized policy outcome. Never fake a signature or consent state.

## Scheduling failure
For accepted treatment-plan work, keep the task open until a real appointment is created through the existing provider availability/conflict engine.

## Recall exception
Use the Part 39 recall lifecycle. A task can organize contact work but cannot independently complete the recall.

## Inventory exception
Use configured reorder points, expiry data, transfer state, purchase orders, or stock-count workflow. If no threshold/rule exists, do not fabricate a task.

## Expense approval
Link to the real expense. Approval/payment must occur through the expense subsystem, not by changing task status.

## Source unavailable
Preserve task/event history. Show the source as unavailable rather than deleting the task or inventing replacement data.

## Automation failure
Do not report success. Keep source state unchanged, log the failure in the responsible subsystem, and retry only through bounded/idempotent processing.
