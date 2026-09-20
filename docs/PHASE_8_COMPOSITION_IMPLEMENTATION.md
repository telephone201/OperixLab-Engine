# Phase 8 Composition Implementation Details

## 1. Logic Overview
The `CompositionEngine` identifies a minimal set of existing workflows that collectively satisfy all `MUST` requirements. It ensures that components are technically compatible before generating a `Composition Blueprint`.

## 2. Algorithm
1. **Filter**: Use `HardGateEvaluator` to remove any workflows with critical failures (Security, License, Trigger).
2. **Set Cover**: Use a greedy algorithm to select the minimum number of workflows that cover all `MUST` requirements.
3. **Compatibility Check**:
   - **Data Flow**: Verifies that the output of Component N can be mapped to the input of Component N+1.
   - **Trigger Sequence**: Ensures the first component has a valid entry point and subsequent components are triggerable.
4. **Conflict Detection**: Scans for redundant responsibilities or incompatible integration assumptions.

## 3. The Composition Blueprint
The output is a JSON blueprint containing:
- **`component_responsibilities`**: Explicit role for each workflow.
- **`execution_order`**: The sequence of execution.
- **`data_mappings`**: Explicit field-level transformations.
- **`security_analysis`**: Aggregated security surface of the composition.

## 4. Constraints
- **Immutable Source**: No original workflow in the library is modified.
- **Non-Executable**: The blueprint is a specification for human review, not a deployed n8n workflow.
- **Deterministic**: Selection is based on metadata coverage, not opaque AI scores.
