## 1. Baseline and Inventory

- [x] 1.1 Run the complete existing test suite before modifying production code
- [x] 1.2 Inventory production file count, oversized logic, fragmented contracts, and overlap with the PostgreSQL change

## 2. Consolidate Stable Boundaries

- [x] 2.1 Consolidate Interpretation port contracts without changing their names or semantics
- [x] 2.2 Consolidate other multi-file port groups where one module-owned contract file is clearer
- [x] 2.3 Group small related queries and control operations while retaining distinct public operation classes
- [x] 2.4 Update imports and module contracts, then run typecheck and focused tests

## 3. Simplify Oversized Logic

- [x] 3.1 Separate Interpretation state definitions and validation from aggregate transitions
- [x] 3.2 Separate draft resolution and registration construction from Interpretation publication orchestration
- [x] 3.3 Extract planning value and dependency rules from command orchestration
- [x] 3.4 Keep the development-only inspector in one infrastructure file
- [x] 3.5 Review remaining files over 200 lines and simplify only when a cohesive reduction exists

## 4. Verification

- [x] 4.1 Format changed TypeScript and OpenSpec files and check for stale imports or obsolete files
- [x] 4.2 Run the complete test suite, typecheck, and build
- [x] 4.3 Compare structural metrics to the baseline and validate the OpenSpec change strictly
