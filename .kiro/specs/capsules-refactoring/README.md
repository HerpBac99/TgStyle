# Capsules Module Refactoring Spec

## Overview

This spec outlines a comprehensive refactoring of the Capsules module in TgStyle. The current implementation has grown to 1250 lines with mixed responsibilities, duplicated logic, and fragile state management. This refactoring will transform it into a maintainable, testable, and extensible architecture.

## Problem Statement

The current `CapsulesManager.ts` has several issues:

1. **Monolithic Design**: 1250 lines in a single file with too many responsibilities
2. **Duplicated Logic**: Modal window opening logic duplicated in multiple places
3. **Fragile State Management**: String-based mode with no validation of state transitions
4. **Event Handler Leaks**: Manual cleanup with global array, easy to forget handlers
5. **Hard to Test**: Tight coupling makes unit testing nearly impossible
6. **Hard to Extend**: Adding new features requires touching many parts of the code

## Solution

Split the monolithic class into focused modules:

```
CapsulesManager (coordinator, ~300 lines)
├── ClothingSelectionModal (~200 lines)
├── CanvasController (~250 lines)
├── ResultScreenController (~150 lines)
├── CapsuleStateMachine (~200 lines)
└── types.ts (shared types)
```

## Key Benefits

- **Maintainability**: Each module < 300 lines with single responsibility
- **Testability**: Modules can be unit tested independently
- **Reliability**: State machine prevents invalid state transitions
- **Extensibility**: Easy to add new features without breaking existing code
- **Performance**: Automatic event handler cleanup prevents memory leaks

## Files

- `requirements.md` - Detailed requirements with user stories and acceptance criteria
- `design.md` - Architecture design, interfaces, and diagrams
- `tasks.md` - Step-by-step implementation plan

## Implementation Phases

### Phase 1: Foundation (2-3 hours)
Create type definitions and state machine

### Phase 2: ClothingSelectionModal (2-3 hours)
Extract modal window logic into dedicated module

### Phase 3: CanvasController (2-3 hours)
Extract canvas operations into dedicated controller

### Phase 4: ResultScreenController (1-2 hours)
Extract result screen logic into dedicated controller

### Phase 5: Refactor CapsulesManager (3-4 hours)
Integrate new modules and remove old code

### Phase 6: Testing (2-3 hours)
Integration testing and validation

### Phase 7: Documentation (1-2 hours)
Update docs and cleanup

**Total Estimated Time**: 13-19 hours

## Success Criteria

- [ ] All existing workflows work exactly as before
- [ ] CapsulesManager reduced to < 400 lines
- [ ] Each new module < 300 lines
- [ ] No event handler memory leaks
- [ ] State machine prevents invalid transitions
- [ ] All manual tests pass
- [ ] TypeScript compiles without errors
- [ ] No console errors during testing

## Risks and Mitigation

### Risk: Breaking existing functionality
**Mitigation**: Implement in phases, keep old code commented out for rollback

### Risk: Performance regression
**Mitigation**: Measure performance before/after, optimize if needed

### Risk: Incomplete event handler cleanup
**Mitigation**: Use AbortController pattern, add cleanup validation

### Risk: State machine too complex
**Mitigation**: Start with simple transitions, add complexity incrementally

## Dependencies

- Existing modules: WardrobeManager, UICanvasEditor, UICanvasResultScreen
- Services: CapsulesService, WardrobeService
- Utilities: navigationManager, dataCacheManager, logger

## Testing Strategy

1. **Unit Tests**: Each module tested independently (optional, marked with *)
2. **Integration Tests**: Full workflows tested end-to-end (optional, marked with *)
3. **Manual Tests**: All user scenarios tested manually (required)
4. **Regression Tests**: Verify no existing functionality broken (required)

## Migration Path

This refactoring is designed to be **backward compatible**. All public API methods of CapsulesManager remain unchanged. Internal implementation is refactored, but external interface stays the same.

## Next Steps

1. Review requirements.md and design.md
2. Get approval from team
3. Start implementation following tasks.md
4. Test each phase before moving to next
5. Update documentation after completion

## Questions?

If you have questions about this spec, please review:
1. `requirements.md` for detailed requirements
2. `design.md` for architecture and interfaces
3. `tasks.md` for implementation steps
