# QA gap analysis

## Top gaps between documentation and code

1. **Frontend is not shippable**
   - docs describe many mobile screens
   - code bundle contains a single file of code strings

2. **Pipeline reliability risk**
   - long jobs run in the API process
   - no durable queue or worker handoff

3. **Spend visibility missing**
   - no pre-flight estimate
   - no budget warning UX
   - no real usage ledger

4. **Provider routing too implicit**
   - creative and deterministic tasks are treated similarly
   - no spend-aware router

5. **Operational seams missing**
   - no repository abstraction
   - no queue abstraction
   - no storage adapter seam

## Beta acceptance targets

- create flow must show estimate before submit
- job can be cancelled
- job status recovers after app restart
- soft and hard budgets are enforced
- stage ledger is visible in usage dashboard
- app remains usable if one provider is unavailable
