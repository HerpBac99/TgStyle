# Requirements Document

## Introduction

This document outlines the requirements for refactoring the Capsules module in the TgStyle application. The current implementation has grown to 1250 lines with mixed responsibilities, duplicated logic, and fragile state management. This refactoring aims to create a maintainable, testable, and extensible architecture by separating concerns into focused modules.

## Glossary

- **Capsules Module**: The system responsible for creating, editing, and managing outfit capsules (collections of wardrobe items arranged on a canvas)
- **Canvas Editor**: The Fabric.js-based interface for arranging wardrobe items visually
- **Clothing Selection Modal**: The modal window that displays wardrobe items for selection
- **State Machine**: A pattern for managing valid state transitions in the capsules workflow
- **CapsulesManager**: The main coordinator class that orchestrates all capsule-related operations
- **Result Screen**: The screen showing the final processed capsule image with save/share options
- **Navigation Stack**: The browser back button handler stack managed by navigationManager

## Requirements

### Requirement 1: Modular Architecture

**User Story:** As a developer, I want the Capsules module split into focused sub-modules, so that each module has a single responsibility and is easier to maintain.

#### Acceptance Criteria

1. THE System SHALL create a ClothingSelectionModal module that handles all clothing selection modal operations
2. THE System SHALL create a CanvasController module that manages all canvas editor operations
3. THE System SHALL create a ResultScreenController module that handles result screen operations
4. THE System SHALL create a CapsuleStateMachine module that manages state transitions
5. THE System SHALL reduce CapsulesManager to a coordinator role with less than 400 lines of code
6. WHEN a module is created, THE System SHALL ensure it has a single, well-defined responsibility

### Requirement 2: Unified Modal Window Management

**User Story:** As a developer, I want a single way to open the clothing selection modal, so that there is no duplicated logic and event handlers are managed consistently.

#### Acceptance Criteria

1. THE ClothingSelectionModal SHALL provide a single show() method for opening the modal
2. THE ClothingSelectionModal SHALL accept configuration options including preselectedIds, title, onConfirm, and onCancel callbacks
3. WHEN the modal is shown, THE ClothingSelectionModal SHALL automatically set up event handlers
4. WHEN the modal is hidden, THE ClothingSelectionModal SHALL automatically clean up all event handlers
5. THE ClothingSelectionModal SHALL integrate with WardrobeManager for grid rendering
6. THE ClothingSelectionModal SHALL manage selectedItems state internally

### Requirement 3: State Machine for Workflow Management

**User Story:** As a developer, I want a state machine to manage capsule workflow states, so that invalid state transitions are impossible and the flow is predictable.

#### Acceptance Criteria

1. THE CapsuleStateMachine SHALL define states: GRID, SELECTING_ITEMS, EDITING_CANVAS, VIEWING_RESULT
2. THE CapsuleStateMachine SHALL define valid transitions between states
3. THE CapsuleStateMachine SHALL prevent invalid state transitions
4. WHEN a state transition occurs, THE CapsuleStateMachine SHALL emit events for observers
5. THE CapsuleStateMachine SHALL store context data for each state (e.g., capsuleId, selectedItems)
6. THE CapsuleStateMachine SHALL provide methods: transition(), getCurrentState(), canTransition()

### Requirement 4: Canvas Operations Unification

**User Story:** As a developer, I want unified methods for canvas operations, so that creating, editing, and adding items to canvas follow consistent patterns.

#### Acceptance Criteria

1. THE CanvasController SHALL provide a createNew() method for creating new capsules
2. THE CanvasController SHALL provide an edit() method for editing existing capsules
3. THE CanvasController SHALL provide an addItems() method that adds items without clearing canvas
4. THE CanvasController SHALL provide a removeItems() method for removing specific items
5. WHEN addItems() is called, THE CanvasController SHALL only add items not already on canvas
6. WHEN removeItems() is called, THE CanvasController SHALL preserve positions of remaining items

### Requirement 5: Simplified Navigation Management

**User Story:** As a developer, I want declarative navigation state management, so that back button behavior is predictable and easy to understand.

#### Acceptance Criteria

1. THE CapsulesManager SHALL maintain an internal navigationStack array
2. THE CapsulesManager SHALL provide pushState() and popState() methods
3. WHEN pushState() is called, THE System SHALL save current state and register back button handler
4. WHEN back button is pressed, THE System SHALL restore previous state from navigationStack
5. THE System SHALL clear navigationStack when returning to grid view
6. THE System SHALL log all navigation state changes for debugging

### Requirement 6: Event Handler Cleanup

**User Story:** As a developer, I want automatic event handler cleanup, so that duplicate handlers and memory leaks are prevented.

#### Acceptance Criteria

1. EACH module SHALL manage its own event handlers internally
2. WHEN a module is hidden or destroyed, THE System SHALL automatically remove all event handlers
3. THE System SHALL NOT use a global cleanupFunctions array
4. THE System SHALL use AbortController pattern for event handler cleanup where appropriate
5. THE System SHALL log warnings if event handlers are not properly cleaned up

### Requirement 7: Backward Compatibility

**User Story:** As a user, I want the refactored module to work exactly like before, so that my workflow is not disrupted.

#### Acceptance Criteria

1. THE System SHALL maintain all existing public API methods of CapsulesManager
2. THE System SHALL preserve all existing user workflows: create, edit, view, delete, generate capsules
3. THE System SHALL preserve canvas item positioning when adding new items
4. THE System SHALL preserve all navigation behaviors (back button, modal close)
5. THE System SHALL maintain integration with WardrobeManager for item selection
6. THE System SHALL maintain integration with sharing and result screen features

### Requirement 8: Error Handling and Logging

**User Story:** As a developer, I want comprehensive error handling and logging, so that issues are easy to diagnose and fix.

#### Acceptance Criteria

1. EACH module SHALL log state transitions and important operations
2. WHEN an error occurs, THE System SHALL log the error with context information
3. THE System SHALL provide meaningful error messages to users
4. THE System SHALL gracefully handle errors without breaking the application
5. THE System SHALL log performance metrics for canvas operations
6. THE System SHALL include stack traces in debug logs for state transitions

### Requirement 9: Type Safety

**User Story:** As a developer, I want strong TypeScript typing throughout the refactored modules, so that type errors are caught at compile time.

#### Acceptance Criteria

1. THE System SHALL define TypeScript interfaces for all module configurations
2. THE System SHALL define TypeScript types for all state machine states and transitions
3. THE System SHALL avoid using 'any' type except where absolutely necessary
4. THE System SHALL use discriminated unions for state machine states
5. THE System SHALL export all public types from a central types.ts file
6. THE System SHALL ensure all callbacks have properly typed parameters

### Requirement 10: Testing Support

**User Story:** As a developer, I want the refactored modules to be easily testable, so that unit tests can be written for each module.

#### Acceptance Criteria

1. EACH module SHALL have minimal external dependencies
2. EACH module SHALL accept dependencies through constructor injection
3. THE System SHALL provide mock implementations for testing
4. THE System SHALL separate DOM manipulation from business logic where possible
5. THE System SHALL make state machine transitions pure functions
6. THE System SHALL provide factory functions for creating test instances
