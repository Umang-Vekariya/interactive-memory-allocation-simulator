/*
 * Simulation Engine — state, process/memory operations, statistics, UI wiring.
 * Allocation algorithms (First Fit / Best Fit / Worst Fit) live in algorithms.js.
 * 
 * This file manages:
 * - Simulation state
 * - Process creation
 * - Memory allocation
 * - Memory splitting
 * - Memory release
 * - Free-block merging
 * - Additional memory requests
 * - Statistics
 */

const simulation = {
    totalMemory: 0,
    memory: [],
    initialMemory: [],   // untouched original layout, used by Algorithm Comparison
    processes: [],
    algorithm: "first-fit",
    events: [],
    nextBlockId: 1,
    stepMode: false,
    stepSimulation: { steps: [], currentStep: 0, processId: null, algorithmResult: null }
};

const SAMPLE_MEMORY = [500, 800, 300, 1200];

/* ============================== MEMORY ============================== */

// Creates the initial memory layout from an array of block sizes.
function createMemory(blockSizes) {
    if (!Array.isArray(blockSizes) || blockSizes.length === 0) {
        throw new Error("Memory must contain at least one block.");
    }

    simulation.memory = [];
    simulation.initialMemory = [];
    simulation.nextBlockId = 1;

    for (const size of blockSizes) {
        if (!Number.isFinite(size) || size <= 0) {
            throw new Error("Every memory block must be greater than 0.");
        }

        const block = { id: simulation.nextBlockId++, size, free: true, processId: null, processName: null };
        simulation.memory.push(block);
        simulation.initialMemory.push({ id: block.id, size: block.size });
    }

    simulation.totalMemory = blockSizes.reduce((total, size) => total + size, 0);
    recalculateAddresses();
    simulation.processes = [];
    simulation.events = [];
    addEvent(`Memory initialized with ${simulation.totalMemory} MB.`);
}

// Recalculates simulated (not real) start/end addresses for every partition.
function recalculateAddresses() {
    let currentAddress = 0;
    for (const block of simulation.memory) {
        block.startAddress = currentAddress;
        block.endAddress = currentAddress + block.size - 1;
        currentAddress += block.size;
    }
}

// Merges neighboring free partitions into one.
function mergeFreeBlocks() {
    const mergedMemory = [];
    for (const block of simulation.memory) {
        const previousBlock = mergedMemory[mergedMemory.length - 1];
        if (previousBlock && previousBlock.free && block.free) {
            previousBlock.size += block.size;
        } else {
            mergedMemory.push(block);
        }
    }
    simulation.memory = mergedMemory;
    recalculateAddresses();
}

/* ============================== PROCESSES ============================== */

// Creates a simulated process after validating input.
function createProcess(id, name, requestedMemory) {
    if (!id || id.trim() === "") return { success: false, message: "Process ID cannot be empty." };
    if (!name || name.trim() === "") return { success: false, message: "Process name cannot be empty." };
    if (!Number.isFinite(requestedMemory) || requestedMemory <= 0) {
        return { success: false, message: "Memory requirement must be greater than 0." };
    }

    const duplicate = simulation.processes.some(p => p.id.toLowerCase() === id.trim().toLowerCase());
    if (duplicate) return { success: false, message: `Process ID ${id} already exists.` };

    if (requestedMemory > simulation.totalMemory) {
        return { success: false, message: "Process is larger than total memory." };
    }

    const process = {
        id: id.trim(),
        name: name.trim(),
        requestedMemory,
        allocatedMemory: 0,
        status: "waiting",
        blockId: null
    };

    simulation.processes.push(process);
    addEvent(`${process.id} (${process.name}) created — requested ${process.requestedMemory} MB.`);
    return { success: true, process };
}

// Changes the active allocation algorithm.
function setAlgorithm(algorithm) {
    const validAlgorithms = ["first-fit", "best-fit", "worst-fit"];
    if (!validAlgorithms.includes(algorithm)) return { success: false, message: "Invalid allocation algorithm." };

    simulation.algorithm = algorithm;
    addEvent(`Allocation algorithm changed to ${formatAlgorithmName(algorithm)}.`);
    return { success: true, algorithm };
}

// Allocates memory to a process using the currently selected algorithm.
function allocateProcess(processId) {
    const process = simulation.processes.find(p => p.id === processId);
    if (!process) return { success: false, message: `Process ${processId} not found.` };
    if (process.status === "allocated") return { success: false, message: `${processId} is already allocated.` };

    let result;
    switch (simulation.algorithm) {
        case "first-fit": result = firstFit(simulation.memory, process.requestedMemory); break;
        case "best-fit": result = bestFit(simulation.memory, process.requestedMemory); break;
        case "worst-fit": result = worstFit(simulation.memory, process.requestedMemory); break;
        default: return { success: false, message: "Unknown allocation algorithm." };
    }

    if (!result.success) {
        process.status = "waiting";
        addEvent(`${process.id} allocation failed — no suitable contiguous block found.`);
        return { success: false, message: "No suitable contiguous free block available.", algorithmResult: result };
    }

    const blockIndex = simulation.memory.findIndex(block => block.id === result.selectedBlockId);
    if (blockIndex === -1) return { success: false, message: "Selected memory block could not be found." };

    const selectedBlock = simulation.memory[blockIndex];
    const requestedSize = process.requestedMemory;
    const leftoverSize = selectedBlock.size - requestedSize;

    // Replace the free block with an allocated partition, plus a leftover free partition if any space remains.
    const allocatedBlock = { id: selectedBlock.id, size: requestedSize, free: false, processId: process.id, processName: process.name };
    simulation.memory.splice(blockIndex, 1, allocatedBlock);

    if (leftoverSize > 0) {
        const freeBlock = { id: simulation.nextBlockId++, size: leftoverSize, free: true, processId: null, processName: null };
        simulation.memory.splice(blockIndex + 1, 0, freeBlock);
    }

    process.allocatedMemory = requestedSize;
    process.status = "allocated";
    process.blockId = allocatedBlock.id;
    recalculateAddresses();
    addEvent(`${process.id} allocated ${requestedSize} MB using ${formatAlgorithmName(simulation.algorithm)}.`);

    return { success: true, process, block: allocatedBlock, algorithmResult: result };
}

// Releases the memory held by a process.
function terminateProcess(processId) {
    const process = simulation.processes.find(p => p.id === processId);
    if (!process) return { success: false, message: `Process ${processId} not found.` };
    if (process.status !== "allocated") return { success: false, message: `${processId} does not currently hold memory.` };

    const blockIndex = simulation.memory.findIndex(block => block.processId === processId);
    if (blockIndex === -1) return { success: false, message: `Memory block for ${processId} could not be found.` };

    const releasedBlock = simulation.memory[blockIndex];
    releasedBlock.free = true;
    releasedBlock.processId = null;
    releasedBlock.processName = null;
    const releasedSize = releasedBlock.size;

    process.status = "terminated";
    process.allocatedMemory = 0;
    process.blockId = null;

    addEvent(`${processId} terminated — ${releasedSize} MB released.`);
    mergeFreeBlocks();
    recalculateAddresses();

    return { success: true, releasedMemory: releasedSize };
}

// Grants additional memory to an allocated process; must come from the free block immediately after it.
function requestAdditionalMemory(processId, additionalMemory) {
    const process = simulation.processes.find(p => p.id === processId);
    if (!process) return { success: false, message: `Process ${processId} not found.` };
    if (process.status !== "allocated") return { success: false, message: `${processId} is not currently allocated.` };
    if (!Number.isFinite(additionalMemory) || additionalMemory <= 0) {
        return { success: false, message: "Additional memory request must be greater than 0." };
    }

    const processIndex = simulation.memory.findIndex(block => block.processId === processId);
    if (processIndex === -1) return { success: false, message: "Process memory block not found." };

    const nextBlock = simulation.memory[processIndex + 1];
    if (!nextBlock || !nextBlock.free) {
        addEvent(`${processId} requested ${additionalMemory} MB — no contiguous free space after process.`);
        return { success: false, message: "No contiguous free memory available after the process." };
    }

    if (nextBlock.size < additionalMemory) {
        addEvent(`${processId} requested ${additionalMemory} MB — adjacent free block is only ${nextBlock.size} MB.`);
        return { success: false, message: `Only ${nextBlock.size} MB of contiguous memory is available.` };
    }

    const processBlock = simulation.memory[processIndex];
    processBlock.size += additionalMemory;
    nextBlock.size -= additionalMemory;

    if (nextBlock.size === 0) simulation.memory.splice(processIndex + 1, 1);

    process.allocatedMemory += additionalMemory;
    recalculateAddresses();
    addEvent(`${processId} received ${additionalMemory} MB additional memory.`);

    return { success: true, additionalMemory, newAllocation: process.allocatedMemory };
}

/* ============================== STATISTICS ============================== */

// Calculates statistics from the actual simulation state.
function calculateStatistics() {
    const allocatedMemory = simulation.memory.filter(b => !b.free).reduce((t, b) => t + b.size, 0);
    const freeBlocks = simulation.memory.filter(b => b.free);
    const freeMemory = freeBlocks.reduce((t, b) => t + b.size, 0);
    const largestFreeBlock = freeBlocks.length > 0 ? Math.max(...freeBlocks.map(b => b.size)) : 0;

    const allocatedProcesses = simulation.processes.filter(p => p.status === "allocated").length;
    const waitingProcesses = simulation.processes.filter(p => p.status === "waiting").length;
    const terminatedProcesses = simulation.processes.filter(p => p.status === "terminated").length;
    const utilization = simulation.totalMemory > 0 ? (allocatedMemory / simulation.totalMemory) * 100 : 0;

    // Exact-sized variable partitions have no wasted space inside a block, so internal fragmentation is 0.
    return {
        totalMemory: simulation.totalMemory,
        allocatedMemory,
        freeMemory,
        largestFreeBlock,
        freeBlockCount: freeBlocks.length,
        utilization,
        internalFragmentation: 0,
        externalFragmentation: freeMemory,
        totalProcesses: simulation.processes.length,
        allocatedProcesses,
        waitingProcesses,
        terminatedProcesses
    };
}

function addEvent(message) {
    simulation.events.unshift({ time: new Date().toLocaleTimeString(), message });
}

// Resets the simulation to an empty state.
function resetSimulation() {
    simulation.totalMemory = 0;
    simulation.memory = [];
    simulation.initialMemory = [];
    simulation.processes = [];
    simulation.algorithm = "first-fit";
    simulation.events = [];
    simulation.nextBlockId = 1;
    simulation.stepMode = false;
    simulation.stepSimulation = { steps: [], currentStep: 0, processId: null, algorithmResult: null };

    const stepToggle = document.getElementById("stepModeToggle");
    if (stepToggle) stepToggle.checked = false;

    const stepControls = document.getElementById("stepControls");
    if (stepControls) stepControls.classList.add("hidden");

    addEvent("Simulation reset.");
    return { success: true };
}

function formatAlgorithmName(algorithm) {
    switch (algorithm) {
        case "first-fit": return "First Fit";
        case "best-fit": return "Best Fit";
        case "worst-fit": return "Worst Fit";
        default: return algorithm;
    }
}

/* ============================== INITIALIZATION ============================== */

document.addEventListener("DOMContentLoaded", () => {
    createMemory(SAMPLE_MEMORY);
    renderApplication();
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById("algorithmSelect").addEventListener("change", handleAlgorithmChange);
    document.getElementById("processForm").addEventListener("submit", handleCreateProcess);
    document.getElementById("allocateButton").addEventListener("click", handleAllocate);
    document.getElementById("loadSampleButton").addEventListener("click", handleLoadSample);
    document.getElementById("configureMemoryButton").addEventListener("click", handleConfigureMemory);
    document.getElementById("resetButton").addEventListener("click", handleReset);
    document.getElementById("compareButton").addEventListener("click", runAlgorithmComparison);
    document.getElementById("stepModeToggle").addEventListener("change", handleStepModeToggle);
    document.getElementById("previousStepButton").addEventListener("click", handlePreviousStep);
    document.getElementById("nextStepButton").addEventListener("click", handleNextStep);
    document.getElementById("runAllButton").addEventListener("click", handleRunAll);
}

/* ============================== UI HANDLERS ============================== */

function handleAlgorithmChange(event) {
    const algorithm = event.target.value;
    const result = setAlgorithm(algorithm);

    if (!result.success) return showNotification(result.message, "error");

    showNotification(`Algorithm changed to ${formatAlgorithmName(algorithm)}.`, "success");
    renderApplication();
}

function handleCreateProcess(event) {
    event.preventDefault();

    const processId = document.getElementById("processId").value.trim();
    const processName = document.getElementById("processName").value.trim();
    const memory = Number(document.getElementById("memoryRequest").value);

    const result = createProcess(processId, processName, memory);
    if (!result.success) return showNotification(result.message, "error");

    showNotification(`${processId} created successfully.`, "success");
    event.target.reset();
    renderApplication();
}

function handleAllocate() {
    const select = document.getElementById("allocationProcessSelect");
    const processId = select.value;

    if (!processId) return showNotification("Select a waiting process first.", "error");
    if (simulation.stepMode) return startStepSimulation(processId);

    const result = allocateProcess(processId);
    renderApplication();

    if (result.algorithmResult) renderAllocationSteps(result.algorithmResult, getProcessRequest(processId));
    if (!result.success) return showNotification(result.message, "error");

    showNotification(`${processId} allocated successfully.`, "success");
}

function allocateFromTable(processId) {
    const result = allocateProcess(processId);
    renderApplication();

    if (result.algorithmResult) renderAllocationSteps(result.algorithmResult, getProcessRequest(processId));
    if (!result.success) return showNotification(result.message, "error");

    showNotification(`${processId} allocated successfully.`, "success");
}

function requestMoreFromTable(processId) {
    const input = prompt(`How much additional memory should ${processId} request? (MB)`);
    if (input === null) return;

    const amount = Number(input);
    const result = requestAdditionalMemory(processId, amount);
    if (!result.success) return showNotification(result.message, "error");

    renderApplication();
    showNotification(`${processId} received ${amount} MB additional memory.`, "success");
}

function terminateFromTable(processId) {
    const process = simulation.processes.find(p => p.id === processId);
    if (!process) return;

    const confirmed = confirm(`Terminate ${processId} (${process.name}) and release its memory?`);
    if (!confirmed) return;

    const result = terminateProcess(processId);
    if (!result.success) return showNotification(result.message, "error");

    renderApplication();
    showNotification(`${processId} terminated and ${result.releasedMemory} MB released.`, "success");
}

function handleLoadSample() {
    const confirmed = simulation.processes.length === 0 || confirm("Load sample data and clear the current simulation?");
    if (!confirmed) return;

    createMemory([100, 500, 200, 300, 600]);
    createProcess("P1", "Process A", 212);
    createProcess("P2", "Process B", 417);
    createProcess("P3", "Process C", 112);
    createProcess("P4", "Process D", 426);

    renderApplication();
    showNotification("Sample memory and processes loaded.", "success");
}

function handleConfigureMemory() {
    const input = document.getElementById("memoryBlocks").value.trim();
    if (!input) return showNotification("Enter at least one memory block.", "error");

    const blocks = input.split(",").map(value => Number(value.trim()));

    if (blocks.length === 0 || blocks.some(size => !Number.isFinite(size) || size <= 0)) {
        return showNotification("Every memory block must be a number greater than 0.", "error");
    }
    if (blocks.some(size => !Number.isInteger(size))) {
        return showNotification("Memory block sizes must be whole numbers.", "error");
    }

    if (simulation.processes.length > 0) {
        const confirmed = confirm("Configuring new memory will clear the current processes. Continue?");
        if (!confirmed) return;
    }

    createMemory(blocks);
    renderApplication();

    const steps = document.getElementById("allocationSteps");
    if (steps) steps.innerHTML = `<div class="empty-state small"><span>Allocation decisions will appear here.</span></div>`;

    showNotification(`Memory configured: ${simulation.totalMemory} MB across ${blocks.length} partitions.`, "success");
}

function handleReset() {
    const confirmed = confirm("Reset the simulation? All processes and allocations will be cleared.");
    if (!confirmed) return;

    resetSimulation();
    renderApplication();
    showNotification("Simulation reset.", "success");
}

function renderApplication() {
    renderMemoryMap();
    renderProcessTable();
    renderProcessSelect();
    renderStatistics();
    renderActivityLog();
}

function getProcessRequest(processId) {
    const process = simulation.processes.find(p => p.id === processId);
    return process ? process.requestedMemory : 0;
}

/* ============================== NOTIFICATIONS ============================== */

let notificationTimer = null;

function showNotification(message, type = "success") {
    const notification = document.getElementById("notification");
    notification.textContent = message;
    notification.className = `notification visible ${type}`;

    clearTimeout(notificationTimer);
    notificationTimer = setTimeout(() => {
        notification.className = "notification";
    }, 3000);
}

/* ============================== ALGORITHM COMPARISON ============================== */

// Runs the current workload through all three algorithms independently (does not modify the live simulation).
function runAlgorithmComparison() {
    if (!simulation.initialMemory || simulation.initialMemory.length === 0) {
        return showNotification("Configure memory before running a comparison.", "error");
    }
    if (!simulation.processes || simulation.processes.length === 0) {
        return showNotification("Create at least one process before running a comparison.", "error");
    }

    // Terminated processes are excluded — they no longer represent an active workload.
    const workload = simulation.processes
        .filter(p => p.status !== "terminated")
        .map(p => ({ id: p.id, name: p.name, requestedMemory: p.requestedMemory }));

    if (workload.length === 0) {
        return showNotification("There are no active processes to compare.", "error");
    }

    const algorithms = [
        { name: "First Fit", key: "first-fit", function: firstFit },
        { name: "Best Fit", key: "best-fit", function: bestFit },
        { name: "Worst Fit", key: "worst-fit", function: worstFit }
    ];

    const results = algorithms.map(algorithm => ({
        name: algorithm.name,
        key: algorithm.key,
        ...simulateWorkload(simulation.initialMemory, workload, algorithm.function)
    }));

    renderComparisonResults(results);
    showNotification("Algorithm comparison completed.", "success");
}

// Runs a full workload on an isolated copy of memory; never touches simulation.memory.
function simulateWorkload(initialMemory, workload, algorithmFunction) {
    let memory = initialMemory.map(b => ({ id: b.id, size: b.size, free: true, processId: null, processName: null }));
    let nextBlockId = Math.max(...memory.map(b => b.id), 0) + 1;
    let successfulAllocations = 0;
    let failedAllocations = 0;

    for (const process of workload) {
        const result = algorithmFunction(memory, process.requestedMemory);

        if (!result.success) {
            failedAllocations++;
            continue;
        }

        const blockIndex = memory.findIndex(b => b.id === result.selectedBlockId);
        if (blockIndex === -1) {
            failedAllocations++;
            continue;
        }

        const selectedBlock = memory[blockIndex];
        const requestedSize = process.requestedMemory;
        const leftoverSize = selectedBlock.size - requestedSize;

        memory.splice(blockIndex, 1, { id: selectedBlock.id, size: requestedSize, free: false, processId: process.id, processName: process.name });

        if (leftoverSize > 0) {
            memory.splice(blockIndex + 1, 0, { id: nextBlockId++, size: leftoverSize, free: true, processId: null, processName: null });
        }

        successfulAllocations++;
    }

    const allocatedMemory = memory.filter(b => !b.free).reduce((t, b) => t + b.size, 0);
    const freeBlocks = memory.filter(b => b.free);
    const freeMemory = freeBlocks.reduce((t, b) => t + b.size, 0);
    const largestFreeBlock = freeBlocks.length > 0 ? Math.max(...freeBlocks.map(b => b.size)) : 0;
    const totalMemory = initialMemory.reduce((t, b) => t + b.size, 0);
    const utilization = totalMemory > 0 ? (allocatedMemory / totalMemory) * 100 : 0;

    return { successfulAllocations, failedAllocations, allocatedMemory, freeMemory, largestFreeBlock, freeBlockCount: freeBlocks.length, utilization, finalMemory: memory };
}

function renderComparisonResults(results) {
    const tableBody = document.getElementById("comparisonTableBody");
    if (!tableBody) return;

    tableBody.innerHTML = "";

    const bestAllocationCount = Math.max(...results.map(r => r.successfulAllocations));

    for (const result of results) {
        const row = document.createElement("tr");
        const allocationClass = result.successfulAllocations === bestAllocationCount ? "comparison-best" : "";
        const failedClass = result.failedAllocations > 0 ? "comparison-failed" : "";

        row.innerHTML = `
            <td class="${allocationClass}">${escapeHtml(result.name)}</td>
            <td>${result.successfulAllocations}</td>
            <td class="${failedClass}">${result.failedAllocations}</td>
            <td>${result.utilization.toFixed(1)}%</td>
            <td>${result.freeMemory} MB</td>
            <td>${result.largestFreeBlock} MB</td>
            <td>${result.freeBlockCount}</td>`;

        tableBody.appendChild(row);
    }

    renderComparisonSummary(results);
}

function renderComparisonSummary(results) {
    const container = document.getElementById("comparisonSummary");
    if (!container || results.length === 0) return;

    const best = Math.max(...results.map(r => r.successfulAllocations));
    const winnerNames = results.filter(r => r.successfulAllocations === best).map(r => r.name).join(" and ");

    const highestUtilization = Math.max(...results.map(r => r.utilization));
    const utilizationNames = results.filter(r => r.utilization === highestUtilization).map(r => r.name).join(" and ");

    container.innerHTML = `
        <div class="comparison-summary-title">Comparison Summary</div>
        <div><strong>${escapeHtml(winnerNames)}</strong> achieved the highest number of successful allocations in this workload.</div>
        <div><strong>${escapeHtml(utilizationNames)}</strong> achieved the highest memory utilization (${highestUtilization.toFixed(1)}%).</div>`;
}

/* ============================== STEP-BY-STEP MODE ============================== */

function handleStepModeToggle(event) {
    simulation.stepMode = event.target.checked;
    const controls = document.getElementById("stepControls");

    if (simulation.stepMode) {
        controls.classList.remove("hidden");
        showNotification("Step-by-step mode enabled.", "success");
    } else {
        controls.classList.add("hidden");
        resetStepSimulation();
        showNotification("Step-by-step mode disabled.", "success");
    }
}

// Builds the list of explanation steps for a given allocation attempt.
function createStepSequence(process, algorithmResult) {
    const steps = [{ type: "info", text: `${process.id} requests ${process.requestedMemory} MB.` }];

    for (const block of algorithmResult.checkedBlocks) {
        const text = block.suitable
            ? `Block ${block.blockId} — ${block.size} MB → Suitable`
            : `Block ${block.blockId} — ${block.size} MB → Too small`;
        steps.push({ type: "check", text });
    }

    if (algorithmResult.success) {
        steps.push({ type: "selected", text: `Block ${algorithmResult.selectedBlockId} selected by ${formatAlgorithmName(simulation.algorithm)}.` });

        if (algorithmResult.leftover > 0) {
            steps.push({ type: "split", text: `Split block: ${process.requestedMemory} MB allocated + ${algorithmResult.leftover} MB free.` });
        }

        steps.push({ type: "success", text: `${process.id} allocated successfully.` });
    } else {
        steps.push({ type: "failure", text: `Allocation failed — no suitable contiguous block available.` });
    }

    return steps;
}

function startStepSimulation(processId) {
    const process = simulation.processes.find(p => p.id === processId);
    if (!process) return showNotification("Process not found.", "error");
    if (process.status !== "waiting") return showNotification("Only waiting processes can start allocation.", "error");

    let result;
    switch (simulation.algorithm) {
        case "first-fit": result = firstFit(simulation.memory, process.requestedMemory); break;
        case "best-fit": result = bestFit(simulation.memory, process.requestedMemory); break;
        case "worst-fit": result = worstFit(simulation.memory, process.requestedMemory); break;
        default: return;
    }

    simulation.stepSimulation = { steps: createStepSequence(process, result), currentStep: 0, processId, algorithmResult: result };

    updateStepControls();
    renderStepProgress();
    renderStepExplanation();
    showNotification("Step-by-step allocation started.", "success");
}

function handleNextStep() {
    const stepSimulation = simulation.stepSimulation;
    if (stepSimulation.steps.length === 0 || stepSimulation.currentStep >= stepSimulation.steps.length) return;

    stepSimulation.currentStep++;
    renderStepProgress();
    renderStepExplanation();
    updateStepControls();

    // The final step actually performs the allocation.
    if (stepSimulation.currentStep === stepSimulation.steps.length) completeStepAllocation();
}

function handlePreviousStep() {
    const stepSimulation = simulation.stepSimulation;
    if (stepSimulation.currentStep <= 0 || stepSimulation.currentStep >= stepSimulation.steps.length) return;

    stepSimulation.currentStep--;
    renderStepProgress();
    renderStepExplanation();
    updateStepControls();
}

function handleRunAll() {
    const stepSimulation = simulation.stepSimulation;
    if (stepSimulation.steps.length === 0) return;

    stepSimulation.currentStep = stepSimulation.steps.length;
    completeStepAllocation();
    renderStepProgress();
    renderStepExplanation();
    updateStepControls();
}

function completeStepAllocation() {
    const stepSimulation = simulation.stepSimulation;
    const processId = stepSimulation.processId;
    const result = stepSimulation.algorithmResult;

    if (!result.success) {
        const process = simulation.processes.find(p => p.id === processId);
        if (process) process.status = "waiting";

        addEvent(`${processId} allocation failed — no suitable contiguous block found.`);
        renderApplication();
        updateStepControls();
        return;
    }

    const allocationResult = allocateProcess(processId);
    if (allocationResult.algorithmResult) {
        renderAllocationSteps(allocationResult.algorithmResult, getProcessRequest(processId));
    }

    renderApplication();
    updateStepControls();

    if (allocationResult.success) {
        showNotification(`${processId} allocated successfully.`, "success");
    } else {
        showNotification(allocationResult.message, "error");
    }
}

function renderStepProgress() {
    const progress = document.getElementById("stepProgress");
    if (!progress) return;

    const total = simulation.stepSimulation.steps.length;
    const current = simulation.stepSimulation.currentStep;
    progress.textContent = `Step ${Math.min(current, total)} / ${total}`;
}

function renderStepExplanation() {
    const container = document.getElementById("allocationSteps");
    if (!container) return;

    const stepSimulation = simulation.stepSimulation;
    if (stepSimulation.steps.length === 0) return;

    container.innerHTML = "";
    const visibleSteps = stepSimulation.steps.slice(0, stepSimulation.currentStep);

    if (visibleSteps.length === 0) {
        container.innerHTML = `<div class="empty-state small"><span>Click Next to begin.</span></div>`;
        return;
    }

    visibleSteps.forEach((step, index) => addStep(container, index + 1, step.text));
}

function updateStepControls() {
    const previous = document.getElementById("previousStepButton");
    const next = document.getElementById("nextStepButton");
    const runAll = document.getElementById("runAllButton");
    if (!previous || !next || !runAll) return;

    const { steps, currentStep } = simulation.stepSimulation;
    const total = steps.length;

    previous.disabled = currentStep <= 0 || currentStep >= total;
    next.disabled = total === 0 || currentStep >= total;
    runAll.disabled = total === 0 || currentStep >= total;
}

function resetStepSimulation() {
    simulation.stepSimulation = { steps: [], currentStep: 0, processId: null, algorithmResult: null };
    renderStepProgress();
    updateStepControls();
}
