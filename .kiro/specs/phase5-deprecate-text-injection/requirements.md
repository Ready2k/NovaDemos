# Phase 5: Deprecate Text Injection Mode

## Overview
Remove the legacy text injection workflow system and fully migrate to LangGraph-based execution, simplifying the codebase and eliminating dual-system maintenance.

## Prerequisites
- ✅ Phase 3 (LangGraph Conversion) must be complete
- ✅ Phase 4 (Full A2A) must be complete
- ✅ All workflows migrated to LangGraph
- ✅ Feature parity achieved between systems

## Current State Analysis

### Text Injection System (Legacy)
**Location:** `backend/src/services/sonic-service.ts`, `backend/src/utils/server-utils.ts`

**How it works:**
1. Workflow JSON converted to text instructions via `convertWorkflowToText()`
2. Text injected into system prompt
3. AI follows text instructions and outputs `[STEP: node_id]` tags
4. Frontend visualizer parses tags to show progress
5. No true state machine - just text following

**Components to Remove:**
- `convertWorkflowToText()` function
- `[STEP: node_id]` tag parsing
- Workflow text injection in system prompts
- Legacy workflow loading in `sonic-service.ts`
- `start_workflow` tool (replaced by native LangGraph workflow nodes)

### LangGraph System (Current)
**Location:** `agents/src/`, `gateway/src/`

**How it works:**
1. Workflow JSON converted to LangGraph StateGraph
2. True state machine execution with LangGraph
3. Real-time graph events streamed to frontend
4. Native tool calling and sub-workflow support
5. Proper state management and persistence

## User Stories

### US-5.1: Seamless Migration for Existing Users
**As a** user  
**I want** my existing conversations to continue working  
**So that** I don't experience disruption

**Acceptance Criteria:**
- Existing sessions gracefully migrate to LangGraph mode
- No data loss during migration
- User experience remains consistent
- Migration happens transparently
- Rollback plan available if issues occur

### US-5.2: Simplified Codebase
**As a** developer  
**I want** a single workflow execution system  
**So that** I can maintain and extend the code more easily

**Acceptance Criteria:**
- Text injection code removed from codebase
- No dual-mode configuration needed
- Reduced code complexity metrics
- Simplified testing requirements
- Clear architecture documentation

### US-5.3: Enhanced Workflow Visualization
**As a** user  
**I want** real-time workflow visualization  
**So that** I can see exactly what the agent is doing

**Acceptance Criteria:**
- Frontend visualizer uses graph events instead of text tags
- Shows current node, completed nodes, and next possible nodes
- Displays node execution time
- Shows tool calls and results
- Supports sub-workflow visualization

### US-5.4: Backward Compatibility for Workflows
**As a** workflow designer  
**I want** existing workflow JSON files to work without changes  
**So that** I don't have to rewrite workflows

**Acceptance Criteria:**
- All existing workflow JSON files compatible with LangGraph
- No breaking changes to workflow schema
- Migration tool for any incompatible workflows
- Validation tool to check workflow compatibility
- Documentation for any required changes

## Technical Requirements

### TR-5.1: Remove Text Injection Code
**Files to modify:**
- `backend/src/services/sonic-service.ts` - Remove workflow text injection
- `backend/src/utils/server-utils.ts` - Remove `convertWorkflowToText()`
- `backend/src/sonic-client.ts` - Remove `[STEP:]` tag handling

**Functions to remove:**
- `convertWorkflowToText()`
- `handleStartWorkflow()` (text injection version)
- Workflow text prompt injection logic
- `[STEP:]` tag parsing and emission

### TR-5.2: Update Frontend Visualizer
**Files to modify:**
- `frontend-v2/components/chat/WorkflowVisualizer.tsx`

**Changes:**
- Remove `[STEP:]` tag parsing
- Use graph events from WebSocket
- Update state management to use graph state
- Add support for sub-workflow visualization
- Add node execution timing display

### TR-5.3: Remove Legacy Configuration
**Files to modify:**
- `frontend-v2/lib/context/AppContext.tsx`
- `backend/src/types.ts`

**Changes:**
- Remove `brainMode` configuration (always use LangGraph)
- Remove text injection settings
- Simplify session configuration
- Update TypeScript types

### TR-5.4: Migration Strategy
**Components:**
1. **Feature Flag System** - Gradual rollout control
2. **Session Migration** - Convert active sessions
3. **Monitoring** - Track migration success
4. **Rollback Plan** - Revert if issues occur

### TR-5.5: Testing and Validation
**Requirements:**
- All existing workflows tested with LangGraph
- Performance comparison (text injection vs LangGraph)
- User acceptance testing
- Load testing with LangGraph only
- Regression testing for all features

## Implementation Plan

### Phase 5.1: Preparation (1 week)

#### Step 1: Feature Flag Implementation (1-2 days)
1. Add feature flag system to gateway
2. Create `USE_LANGGRAPH_ONLY` environment variable
3. Implement gradual rollout (0% → 25% → 50% → 100%)
4. Add monitoring for feature flag usage
5. Write tests for feature flag logic

#### Step 2: Workflow Compatibility Audit (2-3 days)
1. Test all 10 workflow files with LangGraph
2. Identify any incompatibilities
3. Create migration scripts if needed
4. Document required workflow changes
5. Validate all workflows pass tests

#### Step 3: Frontend Visualizer Update (2-3 days)
1. Update `WorkflowVisualizer.tsx` to use graph events
2. Remove `[STEP:]` tag parsing
3. Add sub-workflow visualization support
4. Add node execution timing display
5. Write tests for new visualizer
6. Deploy to staging for testing

### Phase 5.2: Migration (1 week)

#### Step 4: Backend Code Removal (2-3 days)
1. Remove `convertWorkflowToText()` from `server-utils.ts`
2. Remove workflow text injection from `sonic-service.ts`
3. Remove `[STEP:]` tag handling from `sonic-client.ts`
4. Remove `start_workflow` tool definition
5. Update TypeScript types
6. Run full test suite

#### Step 5: Configuration Cleanup (1-2 days)
1. Remove `brainMode` from AppContext
2. Remove text injection settings
3. Update environment variable documentation
4. Simplify session initialization
5. Update configuration examples

#### Step 6: Documentation Updates (1-2 days)
1. Update `docs/WORKFLOW_VS_A2A.md` - mark Phase 5 complete
2. Update `docs/workflows.md` - remove text injection references
3. Create migration guide for operators
4. Update developer documentation
5. Create troubleshooting guide

### Phase 5.3: Rollout (1 week)

#### Step 7: Staged Rollout (3-4 days)
1. **Day 1:** Enable for 10% of sessions, monitor closely
2. **Day 2:** Increase to 25%, monitor metrics
3. **Day 3:** Increase to 50%, monitor metrics
4. **Day 4:** Increase to 100%, monitor metrics

**Monitoring Metrics:**
- Session success rate
- Workflow execution errors
- User satisfaction scores
- Performance metrics (latency, throughput)
- Error rates

#### Step 8: Validation and Cleanup (2-3 days)
1. Validate all metrics are stable
2. Remove feature flag code
3. Remove any remaining legacy code
4. Final code review
5. Update CHANGELOG

## Rollback Plan

### Trigger Conditions
- Session success rate drops below 95%
- Critical bugs affecting > 10% of users
- Performance degradation > 50%
- User satisfaction drops significantly

### Rollback Steps
1. Set feature flag to 0% (revert to text injection)
2. Notify engineering team
3. Investigate root cause
4. Fix issues in staging
5. Re-attempt rollout

### Rollback Testing
- Test rollback procedure in staging
- Document rollback steps
- Assign rollback decision maker
- Set up alerting for rollback triggers

## Migration Validation

### Pre-Migration Checklist
- [ ] All Phase 3 features complete and tested
- [ ] All Phase 4 features complete and tested
- [ ] All workflows tested with LangGraph
- [ ] Frontend visualizer updated and tested
- [ ] Feature flag system implemented
- [ ] Monitoring and alerting configured
- [ ] Rollback plan documented and tested
- [ ] Stakeholder approval obtained

### Post-Migration Checklist
- [ ] All sessions using LangGraph
- [ ] No text injection code in production
- [ ] Metrics stable for 1 week
- [ ] User feedback positive
- [ ] Documentation updated
- [ ] Code cleanup complete
- [ ] Feature flag removed

## Code Removal Checklist

### Files to Modify
- [ ] `backend/src/services/sonic-service.ts`
  - Remove `handleStartWorkflow()` text injection logic
  - Remove workflow text prompt injection
  - Remove `[STEP:]` tag emission
  
- [ ] `backend/src/utils/server-utils.ts`
  - Remove `convertWorkflowToText()` function
  - Remove workflow text formatting utilities
  
- [ ] `backend/src/sonic-client.ts`
  - Remove `[STEP:]` tag parsing
  - Remove workflow step tracking
  
- [ ] `frontend-v2/components/chat/WorkflowVisualizer.tsx`
  - Remove `[STEP:]` tag parsing
  - Update to use graph events
  
- [ ] `frontend-v2/lib/context/AppContext.tsx`
  - Remove `brainMode` configuration
  - Remove text injection settings
  
- [ ] `backend/src/types.ts`
  - Remove text injection type definitions
  - Update session types

### Tools to Remove
- [ ] `start_workflow` tool (text injection version)
- [ ] Workflow text conversion utilities

### Configuration to Remove
- [ ] `brainMode` setting
- [ ] Text injection feature flags
- [ ] Legacy workflow loading paths

## Testing Strategy

### Pre-Migration Testing
- [ ] All workflows tested with LangGraph
- [ ] Performance benchmarks (text injection vs LangGraph)
- [ ] Feature parity validation
- [ ] User acceptance testing

### During Migration Testing
- [ ] Canary testing (10% rollout)
- [ ] A/B testing (text injection vs LangGraph)
- [ ] Real-time monitoring
- [ ] User feedback collection

### Post-Migration Testing
- [ ] Regression testing
- [ ] Performance validation
- [ ] Load testing
- [ ] Long-term stability monitoring

## Success Metrics

### Code Quality Metrics
- Lines of code removed: ~500-1000 lines
- Code complexity reduction: ~30%
- Test coverage maintained: > 80%
- Build time reduction: ~10%

### Performance Metrics
- Workflow execution latency: No regression
- Memory usage: Reduced by ~15%
- CPU usage: Reduced by ~10%

### User Experience Metrics
- Session success rate: Maintained at > 95%
- User satisfaction: No decrease
- Workflow visualization: Improved clarity

### Operational Metrics
- Deployment complexity: Reduced
- Maintenance burden: Reduced by ~40%
- Bug rate: Reduced by ~25%

## Risks and Mitigations

### Risk: Feature Parity Gaps
**Mitigation:** Comprehensive testing before migration, feature flag for gradual rollout

### Risk: Performance Regression
**Mitigation:** Performance benchmarking, load testing, monitoring

### Risk: User Disruption
**Mitigation:** Gradual rollout, clear communication, rollback plan

### Risk: Workflow Incompatibilities
**Mitigation:** Workflow validation tool, migration scripts, documentation

### Risk: Visualization Bugs
**Mitigation:** Extensive frontend testing, user feedback, quick fixes

## Documentation Requirements

- Update `docs/WORKFLOW_VS_A2A.md` - Mark Phase 5 complete
- Update `docs/workflows.md` - Remove text injection references
- Create `docs/MIGRATION_GUIDE.md` - Operator migration guide
- Update `docs/ARCHITECTURE.md` - Reflect simplified architecture
- Update `README.md` - Remove text injection mentions
- Create `docs/LANGGRAPH_ONLY.md` - LangGraph-only architecture guide

## Communication Plan

### Internal Communication
- Engineering team briefing on migration plan
- Weekly status updates during migration
- Post-migration retrospective

### External Communication
- User notification of upcoming changes
- Migration timeline announcement
- Post-migration success announcement

## Definition of Done

- [ ] All text injection code removed from codebase
- [ ] All sessions using LangGraph exclusively
- [ ] Frontend visualizer using graph events
- [ ] All workflows tested and working
- [ ] Performance metrics stable
- [ ] User satisfaction maintained
- [ ] Documentation updated
- [ ] Code reviewed and approved
- [ ] Deployed to production
- [ ] Monitoring confirms stability for 1 week
- [ ] Feature flag removed
- [ ] Post-migration retrospective complete
- [ ] CHANGELOG updated
- [ ] Architecture documentation reflects new state

## Timeline

### Week 1: Preparation
- Feature flag implementation
- Workflow compatibility audit
- Frontend visualizer update

### Week 2: Migration
- Backend code removal
- Configuration cleanup
- Documentation updates

### Week 3: Rollout
- Staged rollout (10% → 25% → 50% → 100%)
- Validation and monitoring
- Final cleanup

### Week 4: Stabilization
- Monitor metrics
- Address any issues
- Complete documentation
- Retrospective

**Total Duration:** 4 weeks

## Post-Migration Benefits

### For Developers
- Single workflow execution system to maintain
- Clearer architecture and code structure
- Easier to add new features
- Reduced testing complexity
- Better debugging capabilities

### For Users
- More reliable workflow execution
- Better real-time visualization
- Faster performance
- More consistent experience
- Enhanced features (sub-workflows, consultations)

### For Operations
- Simplified deployment
- Reduced monitoring complexity
- Clearer troubleshooting
- Better observability
- Reduced infrastructure costs
