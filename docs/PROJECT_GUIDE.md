# Project guide

## What the project does

This project shows how an operating system can place process requests into contiguous memory regions. The user chooses a placement strategy and partition mode, then observes allocation, release, fragmentation, growth, and compaction.

**One sentence for your explanation:** “Our simulator makes memory-allocation decisions visible, so we can compare placement strategies and understand why a request succeeds or fails.”

## Architecture: explain these three layers

1. **Core logic** decides what happens to memory. It does not depend on the browser interface.
2. **Application controller** receives user actions, calls the core, and asks the interface to refresh.
3. **Interface** displays the state and provides navigation, interactive demonstrations, charts, and saved workloads. These files live together in `js/interface/`.

```text
User clicks Allocate
        ↓
js/app.js → validate request and cancel stale step previews
        ↓
js/core/memory-engine.js → locate the waiting process
        ↓
js/core/algorithms.js → choose a suitable free region
        ↓
Memory engine → split/reserve region, update process, addresses and event history
        ↓
Application controller → renderApplication()
        ↓
js/interface/ → refresh map, statistics, tables and explanations
```

## File map

### Entry point and styling

| File | Responsibility | What to explain |
| --- | --- | --- |
| `index.html` | Defines pages, controls, dialogs, icon symbols, and loads scripts. | The visible structure of the simulator. |
| `css/style.css` | Defines layout, process colors, dark/light themes, mobile rules, and animations. | Appearance is separate from allocation logic. |
| `js/app.js` | Owns the live `simulation`, initializes the app, handles controls, comparisons and step mode. | The coordinator connecting user actions to the model and rendering. |

### Core: the most important files for an OS presentation

| File | Key entry points | Responsibility |
| --- | --- | --- |
| `js/core/algorithms.js` | `firstFit`, `bestFit`, `worstFit` | Selects a free region and returns the examined blocks. These functions choose placement; they do not change memory. |
| `js/core/memory-engine.js` | `state`, `initialize`, `allocate`, `terminate`, `grow`, `compact`, `statistics`, `apply` | Maintains state, changes memory safely, computes metrics, records events, and replays lifecycle actions. |

### Interface: displaying results and providing interactions

| File | Responsibility |
| --- | --- |
| `js/interface/visualization.js` | Memory list, process tables, statistics, history, and allocation explanations; also shared rendering helpers. |
| `js/interface/workspace.js` | Page navigation, mobile menu, themes, overview summary and proportional address-space map. |
| `js/interface/analytics.js` | Utilization, memory and fragmentation charts; failure diagnostics and compaction analysis. |
| `js/interface/dialogs.js` | Accessible dialogs for reset, replacing a workload, termination and additional memory requests. |
| `js/interface/block-inspector.js` | Selected block details, keyboard interaction, in-place growth capacity, and before/after compaction addresses. |

| `js/interface/overview-demo.js` | Independent 200 MB request example on Overview, using the real algorithms without changing the session. |
| `js/interface/scenarios.js` | Five predefined workloads, their descriptions, and Next Action / Run Workload controls. |
| `js/interface/studio-tools.js` | Waiting-process queue and read-only predictions for all three placement strategies. |
| `js/interface/lab-features.js` | Guided fragmentation lesson, playback, memory animations, local autosave, JSON import/export, HTML reports and comparison charts. |

### Verification and supporting material

| File or folder | Responsibility |
| --- | --- |
| `tests/simulator.test.js` | Dependency-free Node.js regression suite. It loads scripts from the paths in `index.html` and checks core and controller behavior. |
| `tests/responsive.html` | Embeds the real app at phone, tablet and laptop widths. |
| `tests/design-preview.html` | Desktop visual preview of the real app. |
| `docs/TECHNICAL_REFERENCE.md` | Detailed model assumptions, formulas, comparison scoring and advanced behavior. |
| `docs/PRESENTATION.md` | Speaking order, live examples and viva questions. |

## How state is represented

`simulation` is created by `MemoryEngine.state()` and is the live source of truth.

- **Memory blocks:** size, start/end address, free/allocated state, block ID and assigned process.
- **Processes:** ID, name, requested size, reserved size, status, allocation attempts and failures.
- **Configuration:** partition mode, selected algorithm and total memory.
- **History and metrics:** simulation steps, events, chart samples, workload actions and latest failure/compaction result.

Address values are simulated MB offsets. For example, a 200 MB block beginning at 0 ends at 199. A process owns one contiguous region.

## The three algorithms

| Strategy | Rule | Search behavior |
| --- | --- | --- |
| First Fit | Choose the first free region large enough. | Stops at the first suitable region. |
| Best Fit | Choose the smallest free region large enough. | Examines every free region. |
| Worst Fit | Choose the largest free region large enough. | Examines every free region. |

All three have worst-case O(n) search time for n regions with the current list representation. Best Fit is not universally the best: results depend on the request sequence and release pattern. The simulator counts free blocks examined to make the search tradeoff visible.

## Fixed versus variable partitioning

**Variable:** allocation splits a hole into an allocated region and any remaining free space. Release coalesces adjacent free regions. Growth consumes free memory immediately after the process. Compaction moves allocated regions together and combines free space.

**Fixed:** a process reserves an entire configured partition. Unused capacity inside it is internal fragmentation. Partition boundaries stay fixed; free partitions do not merge and compaction is disabled. A process can grow within its reserved partition's unused capacity.

Configured variable regions initially remain independently selectable to support textbook hole-list examples. They are coalesced by release/growth operations or combined by compaction.

## Metrics to explain

| Metric | Formula or meaning |
| --- | --- |
| Reserved utilization | Reserved allocated memory / total memory × 100 |
| Useful utilization | Requested memory of allocated processes / total memory × 100 |
| Internal fragmentation | Sum of reserved size − requested size for allocated processes |
| External fragmentation (variable mode) | Total free memory − largest free region |
| Search effort | Number of free regions examined by allocation/growth attempts |

External fragmentation is a simulator metric describing scattered free space. It is still free memory and can serve smaller requests. Fixed-mode capacity limitations are diagnosed separately; its external-fragmentation metric is zero.

## Comparison and step mode

Comparison creates independent states with the same initial memory and partition mode and replays the same workload for each strategy. It does not alter the live session. The detailed reference explains the recommendation score; it is our weighted comparison metric rather than a standard OS formula.

Step mode shows examined holes and the chosen region before committing. Previous reviews the explanation; it does not undo memory changes. Completion commits exactly once. Changing relevant memory or configuration cancels an unfinished preview.

## Script loading and limitations

Scripts are plain browser scripts sharing functions through the page. They load in the order written at the bottom of `index.html`; `js/app.js` loads last and starts the application after the page is ready. Folder organization does not turn them into independent ES modules. Avoid reordering scripts without checking dependencies.

This is an educational contiguous-memory model. It does not implement real OS allocation, paging, virtual memory, swapping, scheduling, or kernel interaction. Python serves static files and does not perform simulation calculations.

## Suggested reading order

1. `js/core/algorithms.js`: understand placement.
2. `js/core/memory-engine.js`: follow allocate → release → compact → statistics.
3. `js/app.js`: follow startup and `handleAllocate` / `renderApplication`.
4. `index.html` and `js/interface/visualization.js`: connect state to the interface.
5. `js/interface/scenarios.js`: follow an example workload.
6. Other interface and feature files as needed for the demonstration.
