# Browser demo and verification evidence

Prepared on 14 October 2026 for the Interactive Memory Allocation Simulator.

Project team: Umang Vekariya, Sarthak Dhawale, Aditya Khunt.

## Start here

Open `Interactive-Memory-Allocation-Simulator-Browser-Proof.pdf`. It is now a 15-page A4 landscape document built mainly from website screenshots and short captions. It covers the main demonstrations and summarizes all 40 built-in scenario combinations on page 15. The full 150-capture evidence collection remains separate below.

- **40 scenario runs:** all five built-in workloads, four algorithms and two partition modes.
- **110 feature checkpoints:** guided stages, step success/failure under all eight strategy/mode combinations, playback, circular Next Fit, growth, release, compaction/retry, every scenario comparison, preview, downloads, autosave, import validation, reset, invalid input, cancellation, keyboard navigation, themes, three viewport widths and opening the project directly offline.
- **150 original screenshot figures:** `M01`-`M40` are scenario captures; `F01`-`F110` are feature evidence. The exported-report figure is named `exported-report.png`.

PASS means that the stated behavior and assertions matched. Expected allocation failures are correct demonstrations of the simulation. The scope covers every built-in combination plus the listed edge cases, not infinitely many custom workloads or every browser/device.

## Files

- `screenshots/`: full-size native Chrome screenshots, without annotations added to the images.
- `Browser-Results.json`: recorded browser state, statistics, workload and pass results for every checkpoint.
- `Scenario-Coverage.csv`: concise matrix suitable for a spreadsheet.
- `Evidence-Manifest.json`: screenshot SHA-256 hashes, pages for the representative PDF captures, and the coverage summary page. Captures omitted from the short PDF remain in the screenshot folder.
- `Verified-Workload.json`: a portable workload downloaded through the app's Save workload control. Import it through Load workload to reproduce the fixed Next Fit wraparound example.
- `Verified-Simulation-Report.html`: an actual standalone report downloaded using Export report; it includes configuration, metrics, addresses, comparison and event history.
- `page-index.json`: the 15 PDF page titles and the screenshots selected for each page.

## Test environment

Chrome 155, macOS, isolated browser contexts. Desktop viewport 1440 x 1050 px, reduced motion enabled. Responsive checks at widths 390, 768 and 1024 px. A dedicated test server used `http://127.0.0.1:8002/`; any available local port can serve the project. The local file URL was tested separately.

Matrix runs were driven through real interface controls and compared with standalone replay of the same engine. Additional exact examples and memory invariants verify address continuity, process ownership, capacity conservation, fixed boundaries and nonnegative waste. This does not constitute a completely independent reference implementation. The project's existing regression suite also passed 48 checks, including 4,000 deterministic mixed actions.

## Fix made during testing

Unsafe configuration sizes or a total exceeding JavaScript's safe integer range previously reached an engine guard as a browser exception. The configuration form now displays a useful rejection before altering the live session. F97 and F98 capture verification of the individual-value and summed-capacity cases.

## Reproduce a clear demonstration

1. Open Overview and switch the four mini-example strategies.
2. Start the guided fragmentation demo and advance through all five stages.
3. Explain why a 400 MB request fails with 550 MB free but a 250 MB largest hole.
4. Compact and retry; show the preserved free total and final 850 MB allocation.
5. Run the classic comparison in variable mode: successful requests are 3 / 4 / 3 / 3.
6. Load `Verified-Workload.json` to show a saved fixed Next Fit wraparound session.
7. Contrast fixed internal waste with variable splitting and explain an in-place growth limit.
8. Show step mode, save, reload, import and reset.
