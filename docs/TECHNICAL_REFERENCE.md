# Interactive Memory Allocation Simulator

A frontend-only Operating Systems simulator. No installation, backend, database, account, or network dependency is required. The Interactive Memory Allocation Simulator workspace pairs the existing First Fit, Best Fit, Worst Fit, and Next Fit algorithms with a navy sidebar, neutral slate surfaces, and blue accents. A responsive sidebar organizes Overview, Simulation studio, Processes, Compare algorithms, Memory insights, and Activity log. Light and dark themes persist locally. The studio uses a compact configuration toolbar, process controls beside the memory layout, an allocation trace, live capacity metrics, and a proportional address-space overview.

## Run

From the project root (the folder containing `index.html`):

```sh
python3 -m http.server 8001 --bind 127.0.0.1
```

Open http://localhost:8001. You can also open `index.html` directly for an offline demo. Committed memory and process actions autosave in this browser and restore on reload. Theme preferences also persist. Playback and unfinished allocation previews reset on reload; comparison results should be rerun. Reset saves an empty session. Download a workload JSON file for a portable backup.

## Demo walkthrough

1. Open **Simulation studio**, select **Variable Partitioning** and load **Fragmentation Stress Test**.
2. Click **Run Workload**. Five processes fill 1,000 MB; alternate releases leave 550 MB free, a largest hole of 250 MB, and 300 MB external fragmentation. P6's 400 MB request fails.
3. Inspect the failure diagnostic, process attempts/failures, event history, and three charts.
4. Click **Compact Memory**. Free memory stays 550 MB, the largest hole becomes 550 MB, and external fragmentation becomes 0 MB. Two allocated processes move toward address 0.
5. Allocate P6. Its second attempt succeeds; its previous failure remains in lifecycle history.
6. Run comparison to replay the same lifecycle, including compaction and retry, on four independent states.
7. Reset, load **Algorithm Comparison**, and compare its classic 212, 417, 112, 426 MB workload. Best Fit allocates all four; First Fit, Worst Fit, and Next Fit allocate three. Enable step mode to inspect each free block and the selection rationale.
8. Switch to **Fixed Partitioning**, configure `300, 500`, create a 200 MB process, and allocate it using First Fit. It reserves 300 MB and wastes 100 MB internally. Request 50 MB more: the reserved size stays 300 MB and internal waste falls to 50 MB.

## Playback, guided demo, and reports

Enable step mode, select a waiting process, and click **Allocate**, then **Play**. Pause/resume and Slow/Normal/Fast speed controls advance the existing explanation steps. Allocation commits exactly once when playback finishes. Previous, Run All, configuration changes, algorithm changes, and hiding the browser pause playback. Address-space segments animate splits, release/merge, and compaction; reduced-motion preferences disable those transitions.

The proportional address-space view is the primary memory map. Click a segment (or use Tab, Enter/Space, and the arrow keys) to inspect addresses, useful versus reserved memory, internal waste, and in-place growth capacity. Allocated processes can request more memory or release their region directly from the inspector. Free regions explain whether the selected preview request fits; inspection never changes placement decisions. **Detailed partitions & addresses** expands the readable list and opens automatically in step mode. In fixed mode, hatched space inside an allocated segment shows internal waste. Reserved and useful utilization are displayed separately; the allocation trace includes the latest search cost and leftover space or internal waste.

**Start guided demo** replaces the current workload with the 1,000 MB fragmentation lesson. Its five stages fill memory, create three holes, fail a 400 MB request, compact, and retry successfully. Each stage explains the current state. Outside mutations stop the lesson; restart to continue its original sequence. Compaction analysis includes immutable before/after maps and each process’s old/new address range; exported reports include these address movements.

**Save workload** downloads a versioned JSON file. **Load workload** validates and replays it before replacing the live session. It preserves committed lifecycle actions, algorithm changes, failures, compaction, and scenario progress. Imported files are limited to 2 MB, 1,000 initial regions, and 5,000 actions. Reports and comparisons use computed engine results rather than imported statistics.

**Export report** downloads a standalone HTML report containing configuration, statistics, memory addresses, processes, the last comparison snapshot (if run), and event history. Open it in a browser and use Print / Save as PDF. It includes no executable JavaScript or external assets. Comparison charts show allocation/growth success, search effort, external fragmentation, and internal waste; the table and recommendation retain exact numerical details.

## Request preview and waiting queue

Click a waiting-process chip in the studio to select it for allocation and preview its request. The preview shows each algorithm's chosen block, leftover hole (variable mode) or internal waste (fixed mode), and free blocks examined. Changing the active algorithm preserves the selected waiting process.

Clear the process selection to enter a custom request size. Previews never allocate, record attempts, or advance simulation steps. Recovery hints distinguish fragmented free space, insufficient total memory, and fixed partition limits. Predictions use the current layout; unlike workload comparison, they describe a single prospective allocation, not the outcome of a full workload.

## Memory model and formulas

- Memory sizes are positive whole MB values. Address ranges are simulated MB offsets, not real machine addresses.
- Configured variable regions initially remain independently selectable, preserving the project's textbook hole-list behavior. Releases and growth coalesce adjacent free regions; compaction combines all free regions. Fixed regions always retain their original sizes and boundaries.
- Variable allocation splits a selected free region. One process occupies exactly one contiguous allocated block. Growth consumes only the following contiguous free region; it does not relocate the process.
- Fixed allocation reserves one entire partition. Growth may use unused capacity inside that same partition. Fixed free partitions do not merge, and compaction is disabled.
- Allocated memory is **reserved** memory, including fixed-partition internal waste. Useful payload utilization measures requested memory in allocated processes divided by total memory.
- Variable external fragmentation = total free memory − largest free block.
- External fragmentation ratio = external fragmentation / free memory × 100; 0 when free memory is 0.
- Internal fragmentation = sum of (reserved − requested) for allocated processes.
- Internal fragmentation ratio = internal fragmentation / reserved memory × 100; 0 when reserved memory is 0.
- Fixed partitioning has no classical external fragmentation: unusable free partitions are diagnosed as partition-capacity limitations. External fragmentation and its ratio display 0 in this mode.
- Total wasted memory = internal fragmentation + external fragmentation. External fragmentation is still free memory and may satisfy smaller requests.
- A failed request keeps a process waiting and records a snapshot of the failure metrics. A growth failure preserves the existing allocation and requested size. Oversized processes can be created so insufficient-total-memory failures can be demonstrated.
- Creation, allocation, growth, termination, merge, algorithm change, and compaction events use simulation steps. Charts take one sample per event. Reset clears all simulation state, results, history, charts, and configuration mode; configure memory or load a scenario to begin again.

## Comparison and recommendation

All algorithms start from the same initial sizes and partition mode. They replay recorded create/allocate/terminate/grow/compact actions; for a loaded scenario, remaining actions are appended. Any manually created waiting process without an allocation attempt is then attempted once. Live memory is never changed by comparison. Invalid lifecycle actions (for example, terminating a process that an algorithm could not allocate) do not count as allocation failures.

Successful allocations include successful growth attempts. Search operations count **free blocks examined**, matching the search trails returned by the existing algorithms. Best Fit and Worst Fit scan every free block; First Fit stops at its first suitable block. Fixed growth inside reserved capacity performs zero free-block searches. Average search length = searches / valid allocation and growth attempts.

The transparent score out of 100 is:

```text
0.65 × success rate
+ 0.15 × useful payload utilization
+ 0.15 × (100 − external fragmentation ratio)
+ 5 × (1 − searches / max(maximum searches across algorithms, 1))
```

Success has the greatest weight. Payload utilization prevents fixed-partition waste from being rewarded. Exact score ties retain all tied recommendations. Comparison labels include the simulation step at which the snapshot was taken; rerun comparison after editing the workload.

## Step mode

Choose a waiting process and click Allocate (or its table action). Next shows the request, each inspected free block, selection, splitting or fixed reservation, commit, and result. The inspected block is highlighted. Previous reviews the explanation. Once completed, revisiting steps never repeats an allocation or rolls memory back. Failed previews commit exactly one failed attempt. Changing the algorithm, configuring memory, compacting, releasing, or growing memory cancels an unfinished preview.

Scenario Next Action runs one lifecycle action. With step mode enabled, scenario allocation actions pause until Next or Run All completes the preview, then the scenario can continue. Run Workload executes all remaining actions or pauses at the next step-mode allocation.

## Files

- `js/core/algorithms.js`: existing allocation algorithms and search trails.
- `js/core/memory-engine.js`: shared state, lifecycle, statistics, diagnostics, compaction, and replay transitions.
- `js/app.js`: existing interactive controller and improved comparison/step controls.
- `js/interface/visualization.js`: memory map, process table, statistics, history, and allocation explanations.
- `js/interface/scenarios.js`: five predefined workloads and scenario controls.
- `js/interface/analytics.js`: diagnostics, compaction report, and three responsive SVG charts. All assets work offline.
- `js/interface/dialogs.js`: accessible page dialogs for reset, replacement, termination, and additional requests.
- `js/interface/block-inspector.js`: keyboard-accessible live block inspection and compaction address snapshots.
- `js/interface/lab-features.js`: playback, memory transitions, guided lesson, validated workload replay, autosave, report export, and comparison charts.
- `js/interface/studio-tools.js`: read-only request predictions, algorithm placement previews, and clickable waiting queue.
- `js/interface/workspace.js`: page navigation, theme preferences, mobile navigation, and live overview.
- `index.html`, `css/style.css`: simulator dashboard and responsive styling.
- `tests/simulator.test.js`: dependency-free regression suite.
- `tests/responsive.html`: actual pages embedded at 390, 768, and 1366 px for responsive verification.

## Verification

```sh
node tests/simulator.test.js
```

The 48 regression tests cover the four placement algorithms, splitting, release/merge, insufficient-memory and external-fragmentation failures, compaction/retry, identical independent comparisons, fixed internal waste, growth, lifecycle replay, chart sample data, live overview synchronization, read-only predictions against actual allocations, request feasibility and waiting-queue synchronization, and reset rendering, step navigation and single commits, preview cancellation, scenario step mode, invalid input, zero-denominator statistics, guided lesson states and invalidation, pause/resume and single commits, workload replay/validation/autosave, escaped report output, live block growth capacity, immutable compaction snapshots and address movements, every scenario/algorithm/mode combination, and memory invariants after 4,000 deterministic mixed actions.

Browser checks cover creation/configuration, fixed reservation and growth, growth failure diagnostics, termination, clean reset, sample loading, Best Fit search highlighting, Previous/Next/Run All, comparison/recommendation, the fragmentation scenario, compaction/retry, and chart rendering. Page dialogs support Cancel and Escape; no native alert/prompt is required.

Responsive browser checks confirmed no page overflow at 390, 768, and 1366 px. At 390 px, populated process and comparison tables scroll inside their panels. The final standalone demo completed with no application console errors.

## Next Fit search position

Next Fit starts in the region containing its saved MB address and scans circularly. After a successful Next Fit allocation, the saved address becomes the end of the reserved region plus one (wrapping to zero at the end of memory). A leftover variable hole can therefore be used immediately by the next request; fixed mode resumes at the next partition.

Failed requests, previews, step review, releases, and algorithm switches do not advance the position. An address rather than a list index keeps the position valid when holes merge or blocks split. If merging places it inside a hole, the search considers that whole region. Configuration/reset and compaction reset it to zero. Saved workloads reconstruct the position through replay; each algorithm comparison has its own independent state.

## Read-only learning views

The saved Next Fit address appears beneath the proportional map when Next Fit is active. The marker shows where scanning resumes; it does not promise the next allocation will fit that region. Allocated regions are skipped and the search wraps as needed.

**Compare algorithms** displays four maps on the same scale, consistent process colors, internal-waste overlays, and expandable address tables. They describe the comparison snapshot rather than the live state. A later live action marks the comparison stale; configuration/reset clears it. Next Fit has its own pointer in its comparison card.

Expandable explanations on Overview and in the studio show useful utilization, internal waste and external fragmentation using the current numbers. Memory insights displays the same explanations. The wording distinguishes fragmented free space from memory reserved but unused inside a process.
