# Implementation Plan

## Phase 1: Foundation - Create Type Definitions and State Machine

- [ ] 1. Create type definitions and interfaces
  - Create `client/src/modules/capsules/types.ts` with all TypeScript interfaces
  - Define CapsuleState discriminated union type
  - Define CapsuleAction discriminated union type
  - Define configuration interfaces for all modules
  - Define error types (CapsuleError, InvalidStateTransitionError, etc.)
  - Export all types from central location
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 2. Implement CapsuleStateMachine
  - Create `client/src/modules/capsules/CapsuleStateMachine.ts`
  - Implement state storage with currentState property
  - Define validTransitions array with all allowed state transitions
  - Implement transition() method with validation
  - Implement getCurrentState() method
  - Implement canTransition() method for validation
  - Implement subscribe() method for state change listeners
  - Implement getContext() method for accessing state context
  - Add comprehensive logging for all state transitions
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 8.1_

- [ ]* 2.1 Write unit tests for CapsuleStateMachine
  - Test valid state transitions
  - Test invalid transition prevention
  - Test context management
  - Test event emission
  - Test edge cases
  - _Requirements: 3.2, 3.3, 10.5_

## Phase 2: Extract ClothingSelectionModal

- [ ] 3. Create ClothingSelectionModal module
  - Create `client/src/modules/capsules/ClothingSelectionModal.ts`
  - Implement constructor with ClothingSelectionModalConfig
  - Implement show() method that accepts ShowModalOptions
  - Implement hide() method with automatic cleanup
  - Implement getSelectedItems() method
  - Add selectedItems and wardrobeItems private properties
  - Add eventHandlers Map for tracking handlers
  - Add abortController for cleanup
  - _Requirements: 2.1, 2.2, 6.1, 6.2_

- [ ] 3.1 Implement modal event handlers
  - Implement setupEventHandlers() private method
  - Add overlay click handler for cancel
  - Add close button click handler
  - Add next button click handler
  - Subscribe to 'wardrobe:item-selection-toggle' event
  - Store all handlers in eventHandlers Map
  - _Requirements: 2.3, 6.1_

- [ ] 3.2 Implement event handler cleanup
  - Implement cleanupEventHandlers() private method
  - Remove all event listeners from eventHandlers Map
  - Abort AbortController if exists
  - Clear selectedItems array
  - Log cleanup completion
  - _Requirements: 2.4, 6.2, 6.3, 6.5_

- [ ] 3.3 Implement item selection logic
  - Implement handleItemToggle() private method
  - Add/remove items from selectedItems array
  - Update visual state of card elements
  - Call updateNextButtonState() after each toggle
  - Log selection changes
  - _Requirements: 2.6, 8.1_

- [ ] 3.4 Integrate with WardrobeManager
  - Call wardrobeManager.handleWardrobeOpen() in show() method
  - Load wardrobe items from dataCacheManager
  - Apply preselectedIds to visual state
  - Update modal title if provided
  - _Requirements: 2.5, 7.5_

- [ ]* 3.5 Write unit tests for ClothingSelectionModal
  - Test show/hide functionality
  - Test item selection/deselection
  - Test event handler cleanup
  - Test preselection
  - _Requirements: 10.1, 10.2_

## Phase 3: Extract CanvasController

- [ ] 4. Create CanvasController module
  - Create `client/src/modules/capsules/CanvasController.ts`
  - Implement constructor with CanvasControllerConfig
  - Add canvasEditor private property
  - Implement show() and hide() methods
  - Implement destroy() method
  - Add logging for all operations
  - _Requirements: 4.1, 8.1_

- [ ] 4.1 Implement createNew() method
  - Accept WardrobeItem[] parameter
  - Initialize UICanvasEditor if not exists
  - Call loadItems() on canvas editor
  - Sort items by layer before loading
  - Log creation with item count
  - _Requirements: 4.1, 7.2_

- [ ] 4.2 Implement edit() method
  - Accept capsuleId parameter
  - Load capsule data from capsulesService
  - Initialize UICanvasEditor if not exists
  - Call restoreState() with canvas data
  - Log edit operation with capsuleId
  - _Requirements: 4.2, 7.2_

- [ ] 4.3 Implement addItems() method
  - Accept WardrobeItem[] parameter
  - Get current item IDs from canvas
  - Filter out items already on canvas
  - Add only new items using canvas.addItem()
  - Preserve positions of existing items
  - Log items added count
  - _Requirements: 4.3, 4.5, 7.3_

- [ ] 4.4 Implement removeItems() method
  - Accept itemIds number[] parameter
  - Remove each item using canvas.removeItemById()
  - Preserve positions of remaining items
  - Log items removed count
  - _Requirements: 4.4, 4.6_

- [ ] 4.5 Implement utility methods
  - Implement getState() method returning CanvasState
  - Implement getItemIds() method returning number[]
  - Add error handling for uninitialized canvas
  - _Requirements: 8.2, 8.4_

- [ ]* 4.6 Write unit tests for CanvasController
  - Test createNew functionality
  - Test edit functionality
  - Test addItems without clearing
  - Test removeItems
  - _Requirements: 10.1, 10.2_

## Phase 4: Extract ResultScreenController

- [ ] 5. Create ResultScreenController module
  - Create `client/src/modules/capsules/ResultScreenController.ts`
  - Implement constructor with ResultScreenControllerConfig
  - Add resultScreen and currentImage private properties
  - Implement show() method accepting imageBase64
  - Implement hide() method
  - Implement getCurrentImage() method
  - Implement destroy() method
  - _Requirements: 7.6, 8.1_

- [ ] 5.1 Implement result screen actions
  - Implement handleSave() private method
  - Implement handleShare() private method
  - Implement handleDone() private method
  - Wire up callbacks from config
  - Add error handling for each action
  - Log all actions
  - _Requirements: 7.2, 8.2, 8.3_

- [ ]* 5.2 Write unit tests for ResultScreenController
  - Test show/hide functionality
  - Test save action
  - Test share action
  - Test done action
  - _Requirements: 10.1, 10.2_

## Phase 5: Refactor CapsulesManager

- [ ] 6. Initialize new modules in CapsulesManager
  - Import all new modules (ClothingSelectionModal, CanvasController, etc.)
  - Add private properties for each module
  - Create initializeModules() private method
  - Initialize ClothingSelectionModal in initializeModules()
  - Initialize CanvasController in initializeModules()
  - Initialize ResultScreenController in initializeModules()
  - Initialize CapsuleStateMachine in initializeModules()
  - Call initializeModules() in constructor
  - _Requirements: 1.5, 10.2_

- [ ] 6.1 Setup state machine listeners
  - Create setupStateMachineListeners() private method
  - Subscribe to state machine changes
  - Implement onStateChange() handler
  - Handle GRID state: show capsules grid
  - Handle SELECTING_ITEMS state: show clothing modal
  - Handle EDITING_CANVAS state: show canvas
  - Handle VIEWING_RESULT state: show result screen
  - _Requirements: 3.4, 5.1_

- [ ] 6.2 Refactor handleAddCapsuleClick()
  - Replace direct modal logic with clothingModal.show()
  - Pass onConfirm callback that transitions to EDITING_CANVAS
  - Pass onCancel callback that transitions back to GRID
  - Use stateMachine.transition(START_CREATE)
  - Remove old setupCapsuleModalHandlers() call
  - Remove manual event handler setup
  - _Requirements: 2.1, 2.2, 3.1, 7.1_

- [ ] 6.3 Refactor handleViewCapsule()
  - Use stateMachine.transition(START_EDIT)
  - Use canvasController.edit(capsuleId)
  - Remove direct UICanvasEditor initialization
  - Simplify navigation setup
  - _Requirements: 4.2, 7.2_

- [ ] 6.4 Refactor canvas add items flow
  - Update handleCanvasAddItem() to use clothingModal.show()
  - Pass preselectedIds from canvasController.getItemIds()
  - Pass onConfirm callback that calls canvasController.addItems()
  - Use stateMachine.transition(START_ADD_ITEMS)
  - Remove duplicate modal setup code
  - _Requirements: 2.1, 2.2, 4.3, 7.3_

- [ ] 6.5 Refactor result screen flow
  - Update handleCanvasNext() to use resultController.show()
  - Use stateMachine.transition(PROCESS_CANVAS)
  - Remove direct UICanvasResultScreen initialization
  - Wire up save/share/done callbacks
  - _Requirements: 7.6, 8.1_

- [ ] 6.6 Implement navigation state management
  - Add navigationStack private property
  - Implement pushState() private method
  - Implement popState() private method
  - Replace manual navigationManager calls with pushState/popState
  - Clear navigationStack when returning to grid
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [ ] 6.7 Remove old code and cleanup
  - Remove showCapsuleCreationModal() method
  - Remove setupCapsuleModalHandlers() method
  - Remove handleClothingConfirmed() method (logic moved to callbacks)
  - Remove handleClothingCancelled() method (logic moved to callbacks)
  - Remove returnToClothingSelection() method (handled by state machine)
  - Remove initializeCanvasEditor() method (handled by CanvasController)
  - Remove handleAddToCanvasConfirmed() method (logic moved to callbacks)
  - Remove cleanupFunctions array (handled by modules)
  - Remove mode property (replaced by state machine)
  - Verify CapsulesManager is under 400 lines
  - _Requirements: 1.5, 6.3_

## Phase 6: Testing and Validation

- [ ] 7. Integration testing
  - Test create new capsule workflow end-to-end
  - Test edit existing capsule workflow
  - Test add items to canvas workflow (verify positions preserved)
  - Test remove items from canvas workflow
  - Test generated capsule workflow
  - Test back button navigation in all states
  - Test modal close and cancel buttons
  - Test error scenarios (network failure, invalid data)
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [ ] 7.1 Manual testing checklist
  - Create new capsule with 3 items
  - Arrange items on canvas
  - Add 4th item via "Add Item" button
  - Verify first 3 items positions preserved
  - Remove one item
  - Save capsule
  - Edit saved capsule
  - Share capsule
  - Delete capsule
  - Test back button in each state
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ] 7.2 Performance validation
  - Measure canvas initialization time
  - Measure modal open/close time
  - Measure state transition time
  - Verify no memory leaks (event handlers cleaned up)
  - Check browser console for errors
  - _Requirements: 8.5, 6.5_

- [ ]* 7.3 Write integration tests
  - Test full create workflow
  - Test full edit workflow
  - Test add items workflow
  - Test navigation flows
  - _Requirements: 10.1, 10.2, 10.3_

## Phase 7: Documentation and Cleanup

- [ ] 8. Update documentation
  - Update README.md with new architecture
  - Document each module's public API
  - Create migration guide for developers
  - Update architecture diagrams in .kiro/steering/
  - Add JSDoc comments to all public methods
  - Document state machine transitions
  - _Requirements: 8.1, 8.6_

- [ ] 8.1 Code cleanup and optimization
  - Run TypeScript type checker
  - Fix any type errors
  - Remove unused imports
  - Format code consistently
  - Add missing error handling
  - Optimize event handler usage
  - _Requirements: 9.1, 9.2, 9.3, 8.2_

- [ ] 8.2 Final validation
  - Run full test suite
  - Perform manual testing of all workflows
  - Check for console errors
  - Verify backward compatibility
  - Get code review approval
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_
