# Ideas for Additional Static Code Analysis Tools

This document outlines potential static code analysis features that could be added to CodeBuddy, building on the existing call graph, control flow, and complexity analysis capabilities.

---

## 1. Dead Code Detection

Identify code that is never executed or referenced.

**Features:**
- Unreachable functions (never called anywhere in the codebase)
- Unused variables and parameters
- Unreachable code after return/break/continue statements
- Unused imports/includes
- Dead branches in conditionals (e.g., `if (false)`)

**Implementation:** Leverage existing call graph data to find functions with zero callers. Extend AST traversal to track variable usage.

---

## 2. Code Duplication / Clone Detection

Find similar or identical code blocks across the codebase.

**Features:**
- Exact duplicates (Type-1 clones)
- Renamed duplicates (Type-2 clones) - same structure, different identifiers
- Near-duplicates (Type-3 clones) - similar with some modifications
- Structural clones (Type-4 clones) - semantically similar but syntactically different
- Cross-file and cross-language detection

**Implementation:** Use AST fingerprinting, token-based hashing, or suffix tree algorithms. Tree-sitter ASTs are ideal for structural comparison.

---

## 3. Dependency Analysis

Analyze module/file dependencies and imports.

**Features:**
- Import/require/include graph visualization
- Circular dependency detection
- Unused dependency detection
- Dependency depth analysis (how deep is the import chain?)
- External vs internal dependency breakdown
- Package/module coupling metrics

**Implementation:** Parse import statements per language, build a file-level dependency graph similar to the function call graph.

---

## 4. Security Vulnerability Detection

Identify common security anti-patterns.

**Features:**
- SQL injection patterns (string concatenation in queries)
- Command injection (shell execution with user input)
- Path traversal vulnerabilities
- Hardcoded secrets/credentials detection
- Insecure cryptographic usage
- XSS vulnerabilities (unescaped output)
- Unsafe deserialization
- Use of deprecated/insecure functions

**Implementation:** Pattern matching on AST nodes combined with taint analysis for data flow tracking.

---

## 5. Code Metrics Dashboard

Expand complexity analysis with additional metrics.

**Features:**
- **Halstead Metrics**: Volume, difficulty, effort, vocabulary
- **Maintainability Index**: Combined metric from LOC, cyclomatic complexity, and Halstead
- **Cognitive Complexity**: Measures how difficult code is to understand (different from cyclomatic)
- **SLOC variants**: Physical LOC, logical LOC, comment density
- **Fan-in/Fan-out**: Already have data, just need to expose metrics
- **Coupling Between Objects (CBO)**: For OOP codebases
- **Depth of Inheritance Tree (DIT)**: Class hierarchy depth
- **Afferent/Efferent coupling**: Package-level dependencies

**Implementation:** Extend `complexity.mjs` with additional metric calculators.

---

## 6. Code Smell Detection

Identify patterns that may indicate design problems.

**Features:**
- **Long Method**: Functions exceeding threshold LOC
- **Long Parameter List**: Too many parameters
- **God Class/Function**: Doing too much
- **Feature Envy**: Method uses other class's data more than its own
- **Data Clumps**: Groups of variables that appear together frequently
- **Primitive Obsession**: Overuse of primitives instead of small objects
- **Switch Statements**: Excessive switch/case usage
- **Speculative Generality**: Unused abstractions
- **Message Chains**: Long chains of method calls (a.b().c().d())
- **Middle Man**: Classes that delegate everything

**Implementation:** Define thresholds and patterns, query AST for matches.

---

## 7. Type Analysis (for dynamic languages)

Infer and track types in dynamically-typed languages.

**Features:**
- Type inference from assignments and usage
- Inconsistent type usage detection
- Nullable/optional value tracking
- Type coercion warnings
- Function return type inference
- Parameter type inference from call sites

**Implementation:** Flow-sensitive analysis tracking variable types through the AST.

---

## 8. API Surface Analysis

Analyze public interfaces and exports.

**Features:**
- Public vs private function ratio
- Exported symbols inventory
- API stability metrics (breaking change detection between versions)
- Undocumented public functions
- API complexity (number of parameters, return types)
- Entry point identification

**Implementation:** Parse export statements, visibility modifiers, and module boundaries.

---

## 9. Documentation Coverage

Measure and analyze code documentation.

**Features:**
- Functions with/without docstrings
- Parameter documentation completeness
- Return value documentation
- Example code in documentation
- Documentation freshness (does it match the code?)
- README/docs coverage by module

**Implementation:** Already extracting comments; extend to analyze completeness.

---

## 10. Change Impact Analysis

Predict impact of changes based on dependencies.

**Features:**
- "If I change function X, what else might break?"
- Ripple effect visualization using call graph
- Test coverage mapping (which tests cover which functions)
- Risk scoring for changes
- Blast radius calculation

**Implementation:** Combine call graph with reverse dependency traversal.

---

## 11. Pattern Detection

Find usage of common design patterns and anti-patterns.

**Features:**
- Singleton detection
- Factory pattern usage
- Observer/pub-sub patterns
- MVC/MVVM structure detection
- Callback hell detection
- Promise chain analysis
- Async/await usage patterns
- Error handling patterns (try/catch coverage)

**Implementation:** Define AST patterns for each design pattern, search across codebase.

---

## 12. Variable Scope Analysis

Analyze variable declarations and their scopes.

**Features:**
- Variable shadowing detection
- Scope depth analysis
- Global variable usage
- Closure variable capture
- Variable lifetime analysis
- Unused variable detection
- Variable mutation tracking (const correctness)

**Implementation:** Build scope tree from AST, track variable declarations and references.

---

## 13. Test Analysis

Analyze test code and coverage patterns.

**Features:**
- Test file detection and categorization
- Test-to-code ratio
- Test function mapping (which tests test which functions)
- Assertion density
- Test complexity metrics
- Mock/stub usage analysis
- Test naming convention compliance

**Implementation:** Identify test files by convention, parse test frameworks' AST patterns.

---

## 14. Inheritance & Class Hierarchy Analysis

For OOP languages, analyze class relationships.

**Features:**
- Class hierarchy visualization (inheritance tree)
- Interface implementation tracking
- Abstract vs concrete class ratio
- Method override analysis
- Diamond inheritance detection
- Liskov Substitution Principle violations
- Composition vs inheritance usage

**Implementation:** Extract class declarations, extends/implements clauses, build hierarchy graph.

---

## 15. Concurrency Analysis

Detect potential concurrency issues.

**Features:**
- Shared mutable state detection
- Lock usage analysis
- Potential race condition patterns
- Deadlock detection patterns
- Async/await correctness
- Thread safety annotations
- Atomic operation usage

**Implementation:** Track shared state and synchronization primitives through AST patterns.

---

## 16. Memory & Resource Analysis

Identify potential resource management issues.

**Features:**
- Resource leak patterns (file handles, connections)
- Missing cleanup/dispose calls
- Large allocation detection
- Recursive call stack depth analysis
- Memory-intensive patterns
- RAII compliance (C++)

**Implementation:** Track resource acquisition/release patterns, identify imbalances.

---

## 17. Code Evolution Metrics

Analyze code changes over time (with git integration).

**Features:**
- Churn rate (frequently changed files/functions)
- Code age analysis
- Author distribution
- Hotspot detection (high churn + high complexity)
- Technical debt accumulation trends
- Refactoring detection

**Implementation:** Integrate git history with existing analysis, track metrics over commits.

---

## 18. Cross-Reference Browser

Enhanced code navigation capabilities.

**Features:**
- "Find all references" for any symbol
- "Go to definition" data
- Symbol rename impact analysis
- Type hierarchy navigation
- Call hierarchy (already partial)
- Include/import hierarchy

**Implementation:** Build comprehensive symbol table with location references.

---

## 19. Naming Convention Analysis

Check adherence to naming standards.

**Features:**
- Case convention detection (camelCase, snake_case, PascalCase)
- Naming consistency scoring
- Abbreviation detection
- Reserved word usage
- Language-specific convention compliance
- Configurable naming rules

**Implementation:** Parse identifiers, classify by pattern, compare against configured rules.

---

## 20. Code Readability Scoring

Quantify how readable/maintainable code is.

**Features:**
- Identifier length analysis
- Comment-to-code ratio
- Function length distribution
- Nesting depth penalties
- Line length analysis
- Magic number detection
- Boolean expression complexity

**Implementation:** Combine multiple metrics into a weighted readability score.

---

## Implementation Priority Suggestions

### High Value, Lower Effort (Quick Wins)
1. Dead Code Detection - leverages existing call graph
2. Documentation Coverage - extends existing comment extraction
3. Code Metrics Dashboard - extends existing complexity module
4. Naming Convention Analysis - straightforward AST traversal

### High Value, Medium Effort
5. Code Duplication Detection - significant value for refactoring
6. Dependency Analysis - complements function-level call graph
7. Code Smell Detection - highly actionable insights
8. Security Vulnerability Detection - critical for many teams

### High Value, Higher Effort
9. Change Impact Analysis - powerful with existing call graph foundation
10. Code Evolution Metrics - requires deeper git integration
11. Type Analysis - complex but valuable for JS/Python codebases

---

## Technical Considerations

- All features should integrate with existing tree-sitter parsing infrastructure
- Results should be stored in PostgreSQL for historical tracking
- Expose via MCP tools, REST API, and CLI consistently
- Web UI visualizations for graph-based analyses
- Consider incremental analysis for large codebases
- Add configurable thresholds and rules for customization
