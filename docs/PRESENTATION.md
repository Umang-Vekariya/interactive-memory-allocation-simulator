# Presentation walkthrough

## A five-minute explanation

### 1. Introduce the problem — 30 seconds

“Our project is an Interactive Memory Allocation Simulator. It shows how First Fit, Best Fit, Worst Fit and Next Fit place process requests into memory. We can inspect fragmentation, release memory, compact it and compare strategies using the same workload.”

Explain that the app simulates memory; it does not allocate real system RAM.

### 2. Explain the structure — 45 seconds

“The core folder contains the algorithms and memory engine. The application controller handles user actions. The interface folder displays the memory map, tables and charts and also contains workloads, previews, playback and saved sessions. CSS controls the appearance.”

Open the folder tree in `README.md`, then show `js/core/algorithms.js` and the allocation method in `js/core/memory-engine.js`.

### 3. Show fragmentation and recovery — 2 minutes

1. Open **Simulation studio** and click **Start guided demo**. Confirm replacement if the page asks.
2. Advance the stages using **Next stage**. Read the stage explanation rather than manually editing the workload.
3. After filling memory, alternate releases leave **550 MB free**, but the **largest hole is 250 MB**.
4. Explain why a **400 MB** process fails: enough total free memory exists, but no single contiguous hole fits.
5. The next stage compacts memory. Free memory remains **550 MB**, and the largest hole becomes **550 MB**.
6. The final stage retries the request successfully. Reserved memory becomes **850 MB** and free memory becomes **150 MB**.
7. Show the compaction before/after address map and process failure history.

Say: “Compaction rearranges allocated regions; it does not create extra free memory.”

### 4. Compare strategies — 1 minute

Load **Algorithm Comparison** in the workload panel, replacing the current workload when prompted. Run comparison on its request sequence: **212, 417, 112, 426 MB**.

For this scenario, Best Fit allocates all four requests; First Fit, Worst Fit, and Next Fit allocate three. Show the four memory layouts and expand their address tables, then show success and search counts. Next Fit’s pointer marks its own saved search position. Explain that this example favors Best Fit, while another workload can produce different results.

### 5. Show fixed partitions and close — 45 seconds

Select **Fixed Partitioning**, configure **300, 500**, and create a **200 MB** process. With First Fit it reserves the 300 MB partition and leaves **100 MB internal waste**.

Finish: “The simulator helps us see the tradeoff between successful placement, search effort and wasted space.”

## Short viva answers

| Question | Answer |
| --- | --- |
| What is First Fit? | It selects the first free region that can hold the request. |
| What is Best Fit? | It selects the smallest suitable free region. |
| What is Next Fit? | A circular First Fit search that resumes from the last successful Next Fit allocation instead of always starting at the beginning. |
| What is Worst Fit? | It selects the largest suitable free region. |
| Is Best Fit always best? | No. The request and release sequence determines the outcome; it may also create small unusable holes. |
| What is internal fragmentation? | Unused memory inside a reserved allocation, especially a fixed partition. |
| What is external fragmentation? | Free memory scattered among separate holes, which can prevent a larger contiguous allocation. |
| Why can allocation fail with enough free memory? | The request needs one contiguous region; total free memory alone is insufficient. |
| What is coalescing? | Merging adjacent free regions after memory is released. |
| How does compaction differ from coalescing? | Coalescing merges already adjacent holes. Compaction moves allocated processes so separated holes can become one. |
| Does Previous undo allocation? | No. It reviews explanation steps; the completed action is not repeated or reversed. |
| How is comparison fair? | Each algorithm receives its own state with the same initial memory, partition mode and lifecycle actions. |
| Where is the actual logic? | Placement is in `js/core/algorithms.js`; state changes and metrics are in `js/core/memory-engine.js`. |
| What is the complexity? | Worst-case O(n) search over the region list. Best/Worst Fit scan all free regions; First Fit can stop early. |
| What is saved? | Committed workload actions and configuration are stored locally and reconstructed by replay. |
| What is Python doing? | Serving the static website; the browser runs the JavaScript simulation. |
| What are the limitations? | A simplified contiguous-memory model without paging, virtual memory, swapping or real kernel operations. |

## Before the demonstration

- Start the server from the root folder and open the app.
- Run `node tests/simulator.test.js` to verify the 48 checks.
- Practice the guided demo once and know that loading it replaces the current workload.
- Save a workload JSON if you want to retain an existing experiment.
- For a backup, open `index.html` directly; the simulator works offline.
- Rerun comparison after changing the workload because displayed results are a snapshot.

## Next Fit search position

Next Fit starts in the region containing its saved MB address and scans circularly. After a successful Next Fit allocation, the saved address becomes the end of the reserved region plus one (wrapping to zero at the end of memory). A leftover variable hole can therefore be used immediately by the next request; fixed mode resumes at the next partition.

Failed requests, previews, step review, releases, and algorithm switches do not advance the position. An address rather than a list index keeps the position valid when holes merge or blocks split. If merging places it inside a hole, the search considers that whole region. Configuration/reset and compaction reset it to zero. Saved workloads reconstruct the position through replay; each algorithm comparison has its own independent state.
