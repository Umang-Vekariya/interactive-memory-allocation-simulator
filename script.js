/*
 * ============================================================
 * MEMORY ALLOCATION SIMULATOR
 * Simulation Engine
 * ============================================================
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
 *
 * The actual First Fit / Best Fit / Worst Fit algorithms
 * are implemented separately in algorithms.js.
 * ============================================================
 */


/* ============================================================
   GLOBAL SIMULATION STATE
   ============================================================ */

const simulation = {
    totalMemory: 0,

    // Current memory state
    memory: [],

    // Original memory configuration.
    // Used when running algorithm comparisons.
    initialMemory: [],

    // Simulated processes
    processes: [],

    // Current allocation algorithm
    algorithm: "first-fit",

    // Event history
    events: [],

    nextBlockId: 1,

    stepMode: false,

    stepSimulation: {
        steps: [],
        currentStep: 0,
        processId: null,
        algorithmResult: null
    },
};


/* ============================================================
   MEMORY CREATION
   ============================================================ */

/**
 * Creates the initial memory layout.
 *
 * Example:
 *
 * createMemory([500, 800, 300, 1200]);
 *
 * Creates four free memory partitions.
 */
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

        const block = {
            id: simulation.nextBlockId++,
            size: size,
            free: true,
            processId: null,
            processName: null
        };

        simulation.memory.push(block);

        /*
        * Store the original configuration separately.
        * The comparison feature uses this untouched layout.
        */
        simulation.initialMemory.push({
            id: block.id,
            size: block.size
        });
    }

    simulation.totalMemory = blockSizes.reduce(
        (total, size) => total + size,
        0
    );

    recalculateAddresses();

    simulation.processes = [];
    simulation.events = [];

    addEvent(
        `Memory initialized with ${simulation.totalMemory} MB.`
    );
}


/* ============================================================
   MEMORY ADDRESSES
   ============================================================ */

/**
 * Recalculates the starting and ending address of every
 * partition.
 *
 * We use simulated addresses only.
 * This does NOT access real computer memory.
 */
function recalculateAddresses() {
    let currentAddress = 0;

    for (const block of simulation.memory) {
        block.startAddress = currentAddress;
        block.endAddress = currentAddress + block.size - 1;

        currentAddress += block.size;
    }
}


/* ============================================================
   PROCESS CREATION
   ============================================================ */

/**
 * Creates a simulated process.
 *
 * Example:
 *
 * createProcess("P1", "Chrome", 500);
 */
function createProcess(id, name, requestedMemory) {
    // Validate process ID
    if (!id || id.trim() === "") {
        return {
            success: false,
            message: "Process ID cannot be empty."
        };
    }

    // Validate process name
    if (!name || name.trim() === "") {
        return {
            success: false,
            message: "Process name cannot be empty."
        };
    }

    // Validate memory requirement
    if (
        !Number.isFinite(requestedMemory) ||
        requestedMemory <= 0
    ) {
        return {
            success: false,
            message: "Memory requirement must be greater than 0."
        };
    }

    // Prevent duplicate process IDs
    const duplicate = simulation.processes.some(
        process => process.id.toLowerCase() === id.trim().toLowerCase()
    );

    if (duplicate) {
        return {
            success: false,
            message: `Process ID ${id} already exists.`
        };
    }

    // Process cannot be larger than total memory
    if (requestedMemory > simulation.totalMemory) {
        return {
            success: false,
            message: "Process is larger than total memory."
        };
    }

    const process = {
        id: id.trim(),
        name: name.trim(),
        requestedMemory: requestedMemory,
        allocatedMemory: 0,
        status: "waiting",
        blockId: null
    };

    simulation.processes.push(process);

    addEvent(
        `${process.id} (${process.name}) created — requested ${process.requestedMemory} MB.`
    );

    return {
        success: true,
        process
    };
}


/* ============================================================
   ALGORITHM SELECTION
   ============================================================ */

/**
 * Changes the currently selected allocation algorithm.
 *
 * Accepted values:
 * - first-fit
 * - best-fit
 * - worst-fit
 */
function setAlgorithm(algorithm) {
    const validAlgorithms = [
        "first-fit",
        "best-fit",
        "worst-fit"
    ];

    if (!validAlgorithms.includes(algorithm)) {
        return {
            success: false,
            message: "Invalid allocation algorithm."
        };
    }

    simulation.algorithm = algorithm;

    addEvent(
        `Allocation algorithm changed to ${formatAlgorithmName(algorithm)}.`
    );

    return {
        success: true,
        algorithm
    };
}


/* ============================================================
   ALLOCATION
   ============================================================ */

/**
 * Allocates memory to a process using the selected algorithm.
 */
function allocateProcess(processId) {
    const process = simulation.processes.find(
        p => p.id === processId
    );

    if (!process) {
        return {
            success: false,
            message: `Process ${processId} not found.`
        };
    }

    // Already allocated
    if (process.status === "allocated") {
        return {
            success: false,
            message: `${processId} is already allocated.`
        };
    }

    let result;

    // Run selected allocation algorithm
    switch (simulation.algorithm) {
        case "first-fit":
            result = firstFit(
                simulation.memory,
                process.requestedMemory
            );
            break;

        case "best-fit":
            result = bestFit(
                simulation.memory,
                process.requestedMemory
            );
            break;

        case "worst-fit":
            result = worstFit(
                simulation.memory,
                process.requestedMemory
            );
            break;

        default:
            return {
                success: false,
                message: "Unknown allocation algorithm."
            };
    }

    // Allocation failed
    if (!result.success) {
        process.status = "waiting";

        addEvent(
            `${process.id} allocation failed — no suitable contiguous block found.`
        );

        return {
            success: false,
            message: "No suitable contiguous free block available.",
            algorithmResult: result
        };
    }

    // Find selected block
    const blockIndex = simulation.memory.findIndex(
        block => block.id === result.selectedBlockId
    );

    if (blockIndex === -1) {
        return {
            success: false,
            message: "Selected memory block could not be found."
        };
    }

    const selectedBlock = simulation.memory[blockIndex];

    const requestedSize = process.requestedMemory;
    const leftoverSize = selectedBlock.size - requestedSize;

    /*
     * Replace the selected free block with:
     *
     * 1. Allocated process partition
     * 2. Remaining free partition
     *
     * Example:
     *
     * FREE 800
     *
     * becomes:
     *
     * P1 500
     * FREE 300
     */

    const allocatedBlock = {
        id: selectedBlock.id,
        size: requestedSize,
        free: false,
        processId: process.id,
        processName: process.name
    };

    simulation.memory.splice(
        blockIndex,
        1,
        allocatedBlock
    );

    // Create leftover free block if necessary
    if (leftoverSize > 0) {
        const freeBlock = {
            id: simulation.nextBlockId++,
            size: leftoverSize,
            free: true,
            processId: null,
            processName: null
        };

        simulation.memory.splice(
            blockIndex + 1,
            0,
            freeBlock
        );
    }

    // Update process
    process.allocatedMemory = requestedSize;
    process.status = "allocated";
    process.blockId = allocatedBlock.id;

    recalculateAddresses();

    addEvent(
        `${process.id} allocated ${requestedSize} MB using ${formatAlgorithmName(simulation.algorithm)}.`
    );

    return {
        success: true,
        process,
        block: allocatedBlock,
        algorithmResult: result
    };
}


/* ============================================================
   TERMINATE PROCESS
   ============================================================ */

/**
 * Releases the memory belonging to a process.
 */
function terminateProcess(processId) {
    const process = simulation.processes.find(
        p => p.id === processId
    );

    if (!process) {
        return {
            success: false,
            message: `Process ${processId} not found.`
        };
    }

    if (process.status !== "allocated") {
        return {
            success: false,
            message: `${processId} does not currently hold memory.`
        };
    }

    const blockIndex = simulation.memory.findIndex(
        block => block.processId === processId
    );

    if (blockIndex === -1) {
        return {
            success: false,
            message: `Memory block for ${processId} could not be found.`
        };
    }

    // Convert allocated block into a free block
    const releasedBlock = simulation.memory[blockIndex];

    releasedBlock.free = true;
    releasedBlock.processId = null;
    releasedBlock.processName = null;

    const releasedSize = releasedBlock.size;

    // Update process state
    process.status = "terminated";
    process.allocatedMemory = 0;
    process.blockId = null;

    addEvent(
        `${processId} terminated — ${releasedSize} MB released.`
    );

    // Merge adjacent free blocks
    mergeFreeBlocks();

    recalculateAddresses();

    return {
        success: true,
        releasedMemory: releasedSize
    };
}


/* ============================================================
   MERGE ADJACENT FREE BLOCKS
   ============================================================ */

/**
 * Combines neighboring free partitions.
 *
 * Example:
 *
 * FREE 200
 * FREE 300
 *
 * becomes:
 *
 * FREE 500
 */
function mergeFreeBlocks() {
    const mergedMemory = [];

    for (const block of simulation.memory) {
        const previousBlock =
            mergedMemory[mergedMemory.length - 1];

        if (
            previousBlock &&
            previousBlock.free &&
            block.free
        ) {
            previousBlock.size += block.size;
        } else {
            mergedMemory.push(block);
        }
    }

    simulation.memory = mergedMemory;

    recalculateAddresses();
}


/* ============================================================
   ADDITIONAL MEMORY REQUEST
   ============================================================ */

/**
 * Attempts to give an already allocated process
 * additional contiguous memory.
 *
 * For this project, additional memory must come from
 * the free partition immediately after the process.
 */
function requestAdditionalMemory(processId, additionalMemory) {
    const process = simulation.processes.find(
        p => p.id === processId
    );

    if (!process) {
        return {
            success: false,
            message: `Process ${processId} not found.`
        };
    }

    if (process.status !== "allocated") {
        return {
            success: false,
            message: `${processId} is not currently allocated.`
        };
    }

    if (
        !Number.isFinite(additionalMemory) ||
        additionalMemory <= 0
    ) {
        return {
            success: false,
            message: "Additional memory request must be greater than 0."
        };
    }

    const processIndex = simulation.memory.findIndex(
        block => block.processId === processId
    );

    if (processIndex === -1) {
        return {
            success: false,
            message: "Process memory block not found."
        };
    }

    const nextBlock = simulation.memory[processIndex + 1];

    /*
     * Additional memory must be contiguous with the existing
     * process allocation.
     */
    if (!nextBlock || !nextBlock.free) {
        addEvent(
            `${processId} requested ${additionalMemory} MB — no contiguous free space after process.`
        );

        return {
            success: false,
            message: "No contiguous free memory available after the process."
        };
    }

    if (nextBlock.size < additionalMemory) {
        addEvent(
            `${processId} requested ${additionalMemory} MB — adjacent free block is only ${nextBlock.size} MB.`
        );

        return {
            success: false,
            message: `Only ${nextBlock.size} MB of contiguous memory is available.`
        };
    }

    // Increase process block size
    const processBlock = simulation.memory[processIndex];

    processBlock.size += additionalMemory;

    // Reduce the free block
    nextBlock.size -= additionalMemory;

    // Remove empty free block
    if (nextBlock.size === 0) {
        simulation.memory.splice(processIndex + 1, 1);
    }

    // Update process
    process.allocatedMemory += additionalMemory;

    recalculateAddresses();

    addEvent(
        `${processId} received ${additionalMemory} MB additional memory.`
    );

    return {
        success: true,
        additionalMemory,
        newAllocation: process.allocatedMemory
    };
}


/* ============================================================
   STATISTICS
   ============================================================ */

/**
 * Calculates statistics from the actual simulation state.
 */
function calculateStatistics() {
    const allocatedMemory = simulation.memory
        .filter(block => !block.free)
        .reduce(
            (total, block) => total + block.size,
            0
        );

    const freeBlocks = simulation.memory.filter(
        block => block.free
    );

    const freeMemory = freeBlocks.reduce(
        (total, block) => total + block.size,
        0
    );

    const largestFreeBlock =
        freeBlocks.length > 0
            ? Math.max(...freeBlocks.map(block => block.size))
            : 0;

    const allocatedProcesses =
        simulation.processes.filter(
            process => process.status === "allocated"
        ).length;

    const waitingProcesses =
        simulation.processes.filter(
            process => process.status === "waiting"
        ).length;

    const terminatedProcesses =
        simulation.processes.filter(
            process => process.status === "terminated"
        ).length;

    const utilization =
        simulation.totalMemory > 0
            ? (allocatedMemory / simulation.totalMemory) * 100
            : 0;

    /*
     * With exact-sized variable partitions, unused space inside
     * an allocated block is zero.
     *
     * Free space is represented as separate holes, so it is
     * external fragmentation.
     */
    const internalFragmentation = 0;

    return {
        totalMemory: simulation.totalMemory,
        allocatedMemory,
        freeMemory,
        largestFreeBlock,
        freeBlockCount: freeBlocks.length,
        utilization,
        internalFragmentation,
        externalFragmentation: freeMemory,
        totalProcesses: simulation.processes.length,
        allocatedProcesses,
        waitingProcesses,
        terminatedProcesses
    };
}


/* ============================================================
   EVENT LOG
   ============================================================ */

/**
 * Adds an event to the simulation history.
 */
function addEvent(message) {
    const now = new Date();

    const time = now.toLocaleTimeString();

    simulation.events.unshift({
        time,
        message
    });
}


/* ============================================================
   RESET
   ============================================================ */

/**
 * Resets the simulation to an empty state.
 */
function resetSimulation() {

    simulation.totalMemory = 0;

    simulation.memory = [];

    simulation.initialMemory = [];

    simulation.processes = [];

    simulation.algorithm = "first-fit";

    simulation.events = [];

    simulation.nextBlockId = 1;


    // Reset Step-by-Step Mode
    simulation.stepMode = false;

    simulation.stepSimulation = {
        steps: [],
        currentStep: 0,
        processId: null,
        algorithmResult: null
    };


    // Turn off the Step Mode toggle in the UI
    const stepToggle =
        document.getElementById("stepModeToggle");

    if (stepToggle) {
        stepToggle.checked = false;
    }


    // Hide step controls
    const stepControls =
        document.getElementById("stepControls");

    if (stepControls) {
        stepControls.classList.add("hidden");
    }


    addEvent("Simulation reset.");

    return {
        success: true
    };
}


/* ============================================================
   UTILITY FUNCTIONS
   ============================================================ */

/**
 * Converts internal algorithm names into readable names.
 */
function formatAlgorithmName(algorithm) {
    switch (algorithm) {
        case "first-fit":
            return "First Fit";

        case "best-fit":
            return "Best Fit";

        case "worst-fit":
            return "Worst Fit";

        default:
            return algorithm;
    }
}


/**
 * Prints the current memory state to the browser console.
 */
function printMemory() {
    console.table(
        simulation.memory.map(block => ({
            ID: block.id,
            Size: `${block.size} MB`,
            Status: block.free
                ? "FREE"
                : `Allocated to ${block.processId}`,
            Start: block.startAddress,
            End: block.endAddress
        }))
    );
}


/**
 * Prints current process information.
 */
function printProcesses() {
    console.table(
        simulation.processes.map(process => ({
            PID: process.id,
            Process: process.name,
            Requested: `${process.requestedMemory} MB`,
            Allocated: `${process.allocatedMemory} MB`,
            Status: process.status,
            Block: process.blockId
        }))
    );
}


/**
 * Prints current statistics.
 */
function printStatistics() {
    console.table(calculateStatistics());
}

/* ============================================================
   USER INTERFACE
   ============================================================ */


/* ============================================================
   SAMPLE DATA
   ============================================================ */

const SAMPLE_MEMORY = [
    500,
    800,
    300,
    1200
];


/* ============================================================
   INITIALIZE APPLICATION
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {

    initializeApplication();

});


function initializeApplication() {

    /*
     * Load the sample configuration when the application
     * starts so the user immediately has something to see.
     */
    createMemory(SAMPLE_MEMORY);

    renderApplication();

    setupEventListeners();

}


/* ============================================================
   EVENT LISTENERS
   ============================================================ */
function setupEventListeners() {

    const algorithmSelect =
        document.getElementById("algorithmSelect");

    algorithmSelect.addEventListener(
        "change",
        handleAlgorithmChange
    );

    const processForm =
        document.getElementById("processForm");

    processForm.addEventListener(
        "submit",
        handleCreateProcess
    );

    document
        .getElementById("allocateButton")
        .addEventListener(
            "click",
            handleAllocate
        );

    document
        .getElementById("loadSampleButton")
        .addEventListener(
            "click",
            handleLoadSample
        );

    document
        .getElementById("configureMemoryButton")
        .addEventListener(
            "click",
            handleConfigureMemory
        );

    document
        .getElementById("resetButton")
        .addEventListener(
            "click",
            handleReset
        );
    
    document
        .getElementById("compareButton")
        .addEventListener(
            "click",
            runAlgorithmComparison
        );

    document
    .getElementById("stepModeToggle")
    .addEventListener(
        "change",
        handleStepModeToggle
    );

    document
        .getElementById("previousStepButton")
        .addEventListener(
            "click",
            handlePreviousStep
        );


    document
        .getElementById("nextStepButton")
        .addEventListener(
            "click",
            handleNextStep
        );


    document
        .getElementById("runAllButton")
        .addEventListener(
            "click",
            handleRunAll
        );
}


/* ============================================================
   ALGORITHM CHANGE
   ============================================================ */

function handleAlgorithmChange(event) {

    const algorithm =
        event.target.value;

    const result =
        setAlgorithm(algorithm);


    if (!result.success) {

        showNotification(
            result.message,
            "error"
        );

        return;
    }


    showNotification(
        `Algorithm changed to ${formatAlgorithmName(algorithm)}.`,
        "success"
    );


    renderApplication();
}


/* ============================================================
   CREATE PROCESS
   ============================================================ */

function handleCreateProcess(event) {

    event.preventDefault();


    const processId =
        document
            .getElementById("processId")
            .value
            .trim();


    const processName =
        document
            .getElementById("processName")
            .value
            .trim();


    const memory =
        Number(
            document
                .getElementById("memoryRequest")
                .value
        );


    const result =
        createProcess(
            processId,
            processName,
            memory
        );


    if (!result.success) {

        showNotification(
            result.message,
            "error"
        );

        return;
    }


    showNotification(
        `${processId} created successfully.`,
        "success"
    );


    /*
     * Clear form
     */
    event.target.reset();


    renderApplication();
}


/* ============================================================
   ALLOCATE
   ============================================================ */

function handleAllocate() {

    const select =
        document.getElementById(
            "allocationProcessSelect"
        );


    const processId =
        select.value;


    if (!processId) {

        showNotification(
            "Select a waiting process first.",
            "error"
        );

        return;
    }

    if (simulation.stepMode) {

        startStepSimulation(processId);

        return;
    }


    const result =
        allocateProcess(processId);


    renderApplication();


    /*
     * Show algorithm reasoning
     */
    if (result.algorithmResult) {

        renderAllocationSteps(
            result.algorithmResult,
            getProcessRequest(processId)
        );
    }


    if (!result.success) {

        showNotification(
            result.message,
            "error"
        );

        return;
    }


    showNotification(
        `${processId} allocated successfully.`,
        "success"
    );
}


/* ============================================================
   TABLE ALLOCATION
   ============================================================ */

function allocateFromTable(processId) {

    const result =
        allocateProcess(processId);


    renderApplication();


    if (result.algorithmResult) {

        renderAllocationSteps(
            result.algorithmResult,
            getProcessRequest(processId)
        );
    }


    if (!result.success) {

        showNotification(
            result.message,
            "error"
        );

        return;
    }


    showNotification(
        `${processId} allocated successfully.`,
        "success"
    );
}


/* ============================================================
   REQUEST MORE
   ============================================================ */

function requestMoreFromTable(processId) {

    const input =
        prompt(
            `How much additional memory should ${processId} request? (MB)`
        );


    if (input === null) {
        return;
    }


    const amount =
        Number(input);


    const result =
        requestAdditionalMemory(
            processId,
            amount
        );


    if (!result.success) {

        showNotification(
            result.message,
            "error"
        );

        return;
    }


    renderApplication();


    showNotification(
        `${processId} received ${amount} MB additional memory.`,
        "success"
    );
}


/* ============================================================
   TERMINATE
   ============================================================ */

function terminateFromTable(processId) {

    const process =
        simulation.processes.find(
            p => p.id === processId
        );


    if (!process) {
        return;
    }


    const confirmed =
        confirm(
            `Terminate ${processId} (${process.name}) and release its memory?`
        );


    if (!confirmed) {
        return;
    }


    const result =
        terminateProcess(processId);


    if (!result.success) {

        showNotification(
            result.message,
            "error"
        );

        return;
    }


    renderApplication();


    showNotification(
        `${processId} terminated and ${result.releasedMemory} MB released.`,
        "success"
    );
}
/* ============================================================
   LOAD SAMPLE
   ============================================================ */

function handleLoadSample() {

    const confirmed =
        simulation.processes.length === 0 ||
        confirm(
            "Load sample data and clear the current simulation?"
        );


    if (!confirmed) {
        return;
    }


    createMemory([
        100,
        500,
        200,
        300,
        600
    ]);


    /*
     * Sample workload from the project specification.
     */
    createProcess(
        "P1",
        "Process A",
        212
    );

    createProcess(
        "P2",
        "Process B",
        417
    );

    createProcess(
        "P3",
        "Process C",
        112
    );

    createProcess(
        "P4",
        "Process D",
        426
    );


    renderApplication();


    showNotification(
        "Sample memory and processes loaded.",
        "success"
    );
}

/* ============================================================
   CONFIGURE CUSTOM MEMORY
   ============================================================ */

function handleConfigureMemory() {

    const input =
        document
            .getElementById("memoryBlocks")
            .value
            .trim();


    if (!input) {

        showNotification(
            "Enter at least one memory block.",
            "error"
        );

        return;
    }


    /*
     * Convert:
     *
     * "500, 800, 300, 1200"
     *
     * into:
     *
     * [500, 800, 300, 1200]
     */
    const blocks =
        input
            .split(",")
            .map(value => Number(value.trim()));


    /*
     * Validate every block.
     */
    if (
        blocks.length === 0 ||
        blocks.some(
            size => !Number.isFinite(size) || size <= 0
        )
    ) {

        showNotification(
            "Every memory block must be a number greater than 0.",
            "error"
        );

        return;
    }


    /*
     * Make sure values are whole MB values.
     */
    if (
        blocks.some(
            size => !Number.isInteger(size)
        )
    ) {

        showNotification(
            "Memory block sizes must be whole numbers.",
            "error"
        );

        return;
    }


    /*
     * Don't accidentally destroy an active simulation.
     */
    if (simulation.processes.length > 0) {

        const confirmed =
            confirm(
                "Configuring new memory will clear the current processes. Continue?"
            );


        if (!confirmed) {
            return;
        }
    }


    createMemory(blocks);


    renderApplication();


    /*
     * Clear previous allocation explanation.
     */
    const steps =
        document.getElementById("allocationSteps");

    if (steps) {

        steps.innerHTML = `
            <div class="empty-state small">
                <span>
                    Allocation decisions will appear here.
                </span>
            </div>
        `;
    }


    showNotification(
        `Memory configured: ${simulation.totalMemory} MB across ${blocks.length} partitions.`,
        "success"
    );
}


/* ============================================================
   RESET
   ============================================================ */

function handleReset() {

    const confirmed =
        confirm(
            "Reset the simulation? All processes and allocations will be cleared."
        );


    if (!confirmed) {
        return;
    }


    resetSimulation();


    renderApplication();


    showNotification(
        "Simulation reset.",
        "success"
    );
}


/* ============================================================
   RENDER EVERYTHING
   ============================================================ */

function renderApplication() {

    renderMemoryMap();

    renderProcessTable();

    renderProcessSelect();

    renderStatistics();

    renderActivityLog();

}


/* ============================================================
   UTILITY
   ============================================================ */

function getProcessRequest(processId) {

    const process =
        simulation.processes.find(
            p => p.id === processId
        );


    return process
        ? process.requestedMemory
        : 0;
}


/* ============================================================
   NOTIFICATIONS
   ============================================================ */

let notificationTimer = null;


function showNotification(
    message,
    type = "success"
) {

    const notification =
        document.getElementById(
            "notification"
        );


    notification.textContent =
        message;


    notification.className =
        `notification visible ${type}`;


    clearTimeout(notificationTimer);


    notificationTimer =
        setTimeout(() => {

            notification.className =
                "notification";

        }, 3000);
}

/* ============================================================
   ALGORITHM COMPARISON
   ============================================================ */

/**
 * Runs the current process workload through all three
 * allocation algorithms independently.
 *
 * IMPORTANT:
 * The user's current simulation is NOT modified.
 */
function runAlgorithmComparison() {

    if (
        !simulation.initialMemory ||
        simulation.initialMemory.length === 0
    ) {

        showNotification(
            "Configure memory before running a comparison.",
            "error"
        );

        return;
    }


    if (
        !simulation.processes ||
        simulation.processes.length === 0
    ) {

        showNotification(
            "Create at least one process before running a comparison.",
            "error"
        );

        return;
    }


    /*
     * Only compare actual process requests.
     *
     * Terminated processes are excluded because they no longer
     * represent an active workload.
     */
    const workload =
        simulation.processes
            .filter(
                process =>
                    process.status !== "terminated"
            )
            .map(process => ({
                id: process.id,
                name: process.name,
                requestedMemory: process.requestedMemory
            }));


    if (workload.length === 0) {

        showNotification(
            "There are no active processes to compare.",
            "error"
        );

        return;
    }


    const algorithms = [
        {
            name: "First Fit",
            key: "first-fit",
            function: firstFit
        },

        {
            name: "Best Fit",
            key: "best-fit",
            function: bestFit
        },

        {
            name: "Worst Fit",
            key: "worst-fit",
            function: worstFit
        }
    ];


    const results = [];


    for (const algorithm of algorithms) {

        const result =
            simulateWorkload(
                simulation.initialMemory,
                workload,
                algorithm.function
            );


        results.push({
            name: algorithm.name,
            key: algorithm.key,
            ...result
        });
    }


    renderComparisonResults(results);


    showNotification(
        "Algorithm comparison completed.",
        "success"
    );
}


/* ============================================================
   INDEPENDENT WORKLOAD SIMULATION
   ============================================================ */

/**
 * Runs a complete workload on a fresh copy of memory.
 *
 * This function does not touch simulation.memory.
 */
function simulateWorkload(
    initialMemory,
    workload,
    algorithmFunction
) {

    /*
     * Create a completely independent memory layout.
     */
    let memory = initialMemory.map(block => ({
        id: block.id,
        size: block.size,
        free: true,
        processId: null,
        processName: null
    }));


    let nextBlockId =
        Math.max(
            ...memory.map(block => block.id),
            0
        ) + 1;


    let successfulAllocations = 0;
    let failedAllocations = 0;


    /*
     * Process each request in order.
     */
    for (const process of workload) {

        const result =
            algorithmFunction(
                memory,
                process.requestedMemory
            );


        /*
         * Allocation failed.
         */
        if (!result.success) {

            failedAllocations++;

            continue;
        }


        /*
         * Find selected block.
         */
        const blockIndex =
            memory.findIndex(
                block =>
                    block.id === result.selectedBlockId
            );


        if (blockIndex === -1) {

            failedAllocations++;

            continue;
        }


        const selectedBlock =
            memory[blockIndex];


        const requestedSize =
            process.requestedMemory;


        const leftoverSize =
            selectedBlock.size - requestedSize;


        /*
         * Allocate process partition.
         */
        const allocatedBlock = {

            id: selectedBlock.id,

            size: requestedSize,

            free: false,

            processId: process.id,

            processName: process.name
        };


        memory.splice(
            blockIndex,
            1,
            allocatedBlock
        );


        /*
         * Split leftover space.
         */
        if (leftoverSize > 0) {

            memory.splice(
                blockIndex + 1,
                0,
                {
                    id: nextBlockId++,
                    size: leftoverSize,
                    free: true,
                    processId: null,
                    processName: null
                }
            );
        }


        successfulAllocations++;
    }


    /*
     * Calculate comparison statistics.
     */
    const allocatedMemory =
        memory
            .filter(block => !block.free)
            .reduce(
                (total, block) =>
                    total + block.size,
                0
            );


    const freeBlocks =
        memory.filter(
            block => block.free
        );


    const freeMemory =
        freeBlocks.reduce(
            (total, block) =>
                total + block.size,
            0
        );


    const largestFreeBlock =
        freeBlocks.length > 0
            ? Math.max(
                ...freeBlocks.map(
                    block => block.size
                )
            )
            : 0;


    const totalMemory =
        initialMemory.reduce(
            (total, block) =>
                total + block.size,
            0
        );


    const utilization =
        totalMemory > 0
            ? (allocatedMemory / totalMemory) * 100
            : 0;


    return {

        successfulAllocations,

        failedAllocations,

        allocatedMemory,

        freeMemory,

        largestFreeBlock,

        freeBlockCount:
            freeBlocks.length,

        utilization,

        finalMemory: memory
    };
}


/* ============================================================
   RENDER COMPARISON
   ============================================================ */
function renderComparisonResults(results) {

    const tableBody =
        document.getElementById(
            "comparisonTableBody"
        );

    if (!tableBody) {
        return;
    }

    tableBody.innerHTML = "";


    /*
     * Find the highest number of successful allocations.
     */
    const bestAllocationCount =
        Math.max(
            ...results.map(
                result =>
                    result.successfulAllocations
            )
        );


    for (const result of results) {

        const row =
            document.createElement("tr");


        const allocationClass =
            result.successfulAllocations ===
            bestAllocationCount
                ? "comparison-best"
                : "";


        row.innerHTML = `

            <td class="${allocationClass}">
                ${escapeHtml(result.name)}
            </td>

            <td>
                ${result.successfulAllocations}
            </td>

            <td class="${
                result.failedAllocations > 0
                    ? "comparison-failed"
                    : ""
            }">
                ${result.failedAllocations}
            </td>

            <td>
                ${result.utilization.toFixed(1)}%
            </td>

            <td>
                ${result.freeMemory} MB
            </td>

            <td>
                ${result.largestFreeBlock} MB
            </td>

            <td>
                ${result.freeBlockCount}
            </td>

        `;


        tableBody.appendChild(row);
    }


    /*
     * Generate a simple conclusion.
     */
    renderComparisonSummary(results);
}


function renderComparisonSummary(results) {

    const container =
        document.getElementById(
            "comparisonSummary"
        );

    if (!container || results.length === 0) {
        return;
    }


    const best =
        Math.max(
            ...results.map(
                result =>
                    result.successfulAllocations
            )
        );


    const winners =
        results.filter(
            result =>
                result.successfulAllocations === best
        );


    const winnerNames =
        winners
            .map(result => result.name)
            .join(" and ");


    const highestUtilization =
        Math.max(
            ...results.map(
                result =>
                    result.utilization
            )
        );


    const utilizationWinners =
        results.filter(
            result =>
                result.utilization ===
                highestUtilization
        );


    const utilizationNames =
        utilizationWinners
            .map(result => result.name)
            .join(" and ");


    container.innerHTML = `

        <div class="comparison-summary-title">
            Comparison Summary
        </div>

        <div>
            <strong>${escapeHtml(winnerNames)}</strong>
            achieved the highest number of successful allocations
            in this workload.
        </div>

        <div>
            <strong>${escapeHtml(utilizationNames)}</strong>
            achieved the highest memory utilization
            (${highestUtilization.toFixed(1)}%).
        </div>

    `;
}


/* ============================================================
   STEP-BY-STEP MODE
   ============================================================ */

function handleStepModeToggle(event) {

    simulation.stepMode =
        event.target.checked;


    const controls =
        document.getElementById("stepControls");


    if (simulation.stepMode) {

        controls.classList.remove("hidden");

        showNotification(
            "Step-by-step mode enabled.",
            "success"
        );

    } else {

        controls.classList.add("hidden");

        resetStepSimulation();

        showNotification(
            "Step-by-step mode disabled.",
            "success"
        );
    }
}

function createStepSequence(
    process,
    algorithmResult
) {

    const steps = [];


    steps.push({
        type: "info",

        text:
            `${process.id} requests ${process.requestedMemory} MB.`
    });


    /*
     * Explain every block examined.
     */
    for (
        const block
        of algorithmResult.checkedBlocks
    ) {

        if (block.suitable) {

            steps.push({

                type: "check",

                text:
                    `Block ${block.blockId} — ${block.size} MB → Suitable`
            });

        } else {

            steps.push({

                type: "check",

                text:
                    `Block ${block.blockId} — ${block.size} MB → Too small`
            });
        }
    }


    if (algorithmResult.success) {

        steps.push({

            type: "selected",

            text:
                `Block ${algorithmResult.selectedBlockId} selected by ${formatAlgorithmName(simulation.algorithm)}.`
        });


        if (algorithmResult.leftover > 0) {

            steps.push({

                type: "split",

                text:
                    `Split block: ${process.requestedMemory} MB allocated + ${algorithmResult.leftover} MB free.`
            });
        }


        steps.push({

            type: "success",

            text:
                `${process.id} allocated successfully.`
        });

    } else {

        steps.push({

            type: "failure",

            text:
                `Allocation failed — no suitable contiguous block available.`
        });
    }


    return steps;
}

function startStepSimulation(processId) {

    const process =
        simulation.processes.find(
            p => p.id === processId
        );


    if (!process) {

        showNotification(
            "Process not found.",
            "error"
        );

        return;
    }


    if (process.status !== "waiting") {

        showNotification(
            "Only waiting processes can start allocation.",
            "error"
        );

        return;
    }


    let result;


    switch (simulation.algorithm) {

        case "first-fit":

            result =
                firstFit(
                    simulation.memory,
                    process.requestedMemory
                );

            break;


        case "best-fit":

            result =
                bestFit(
                    simulation.memory,
                    process.requestedMemory
                );

            break;


        case "worst-fit":

            result =
                worstFit(
                    simulation.memory,
                    process.requestedMemory
                );

            break;


        default:

            return;
    }


    simulation.stepSimulation = {

        steps:
            createStepSequence(
                process,
                result
            ),

        currentStep: 0,

        processId,

        algorithmResult: result
    };


    updateStepControls();


    renderStepProgress();


    renderStepExplanation();


    showNotification(
        "Step-by-step allocation started.",
        "success"
    );
}

function handleNextStep() {

    const stepSimulation =
        simulation.stepSimulation;


    if (
        stepSimulation.steps.length === 0
    ) {
        return;
    }


    if (
        stepSimulation.currentStep >=
        stepSimulation.steps.length
    ) {
        return;
    }


    stepSimulation.currentStep++;


    renderStepProgress();

    renderStepExplanation();

    updateStepControls();


    /*
     * The final step actually performs the allocation.
     */
    if (
        stepSimulation.currentStep ===
        stepSimulation.steps.length
    ) {

        completeStepAllocation();
    }
}

function handlePreviousStep() {

    const stepSimulation =
        simulation.stepSimulation;


    if (
        stepSimulation.currentStep <= 0
    ) {
        return;
    }


    /*
     * Don't undo an already completed allocation.
     */
    if (
        stepSimulation.currentStep >=
        stepSimulation.steps.length
    ) {
        return;
    }


    stepSimulation.currentStep--;


    renderStepProgress();

    renderStepExplanation();

    updateStepControls();
}

function handleRunAll() {

    const stepSimulation =
        simulation.stepSimulation;


    if (
        stepSimulation.steps.length === 0
    ) {
        return;
    }


    stepSimulation.currentStep =
        stepSimulation.steps.length;


    completeStepAllocation();


    renderStepProgress();

    renderStepExplanation();

    updateStepControls();
}

function completeStepAllocation() {

    const stepSimulation =
        simulation.stepSimulation;


    const processId =
        stepSimulation.processId;


    const result =
        stepSimulation.algorithmResult;


    /*
     * If allocation failed, don't modify memory.
     */
    if (!result.success) {

        const process =
            simulation.processes.find(
                p => p.id === processId
            );


        if (process) {
            process.status = "waiting";
        }


        addEvent(
            `${processId} allocation failed — no suitable contiguous block found.`
        );


        renderApplication();


        updateStepControls();


        return;
    }


    /*
     * Use the normal allocation engine.
     */
    const allocationResult =
        allocateProcess(processId);


    if (
        allocationResult.algorithmResult
    ) {

        renderAllocationSteps(
            allocationResult.algorithmResult,

            getProcessRequest(
                processId
            )
        );
    }


    renderApplication();


    updateStepControls();


    if (allocationResult.success) {

        showNotification(
            `${processId} allocated successfully.`,
            "success"
        );

    } else {

        showNotification(
            allocationResult.message,
            "error"
        );
    }
}

function renderStepProgress() {

    const progress =
        document.getElementById(
            "stepProgress"
        );


    if (!progress) {
        return;
    }


    const total =
        simulation
            .stepSimulation
            .steps
            .length;


    const current =
        simulation
            .stepSimulation
            .currentStep;


    progress.textContent =
        `Step ${Math.min(current, total)} / ${total}`;
}

function renderStepExplanation() {

    const container =
        document.getElementById(
            "allocationSteps"
        );


    if (!container) {
        return;
    }


    const stepSimulation =
        simulation.stepSimulation;


    if (
        stepSimulation.steps.length === 0
    ) {
        return;
    }


    container.innerHTML = "";


    const visibleSteps =
        stepSimulation.steps.slice(
            0,
            stepSimulation.currentStep
        );


    if (visibleSteps.length === 0) {

        container.innerHTML = `
            <div class="empty-state small">
                <span>
                    Click Next to begin.
                </span>
            </div>
        `;

        return;
    }


    visibleSteps.forEach(
        (step, index) => {

            addStep(
                container,
                index + 1,
                step.text
            );

        }
    );
}

function updateStepControls() {

    const previous =
        document.getElementById(
            "previousStepButton"
        );


    const next =
        document.getElementById(
            "nextStepButton"
        );


    const runAll =
        document.getElementById(
            "runAllButton"
        );


    if (
        !previous ||
        !next ||
        !runAll
    ) {
        return;
    }


    const stepSimulation =
        simulation.stepSimulation;


    const total =
        stepSimulation.steps.length;


    const current =
        stepSimulation.currentStep;


    previous.disabled =
        current <= 0 ||
        current >= total;


    next.disabled =
        total === 0 ||
        current >= total;


    runAll.disabled =
        total === 0 ||
        current >= total;
}

function resetStepSimulation() {

    simulation.stepSimulation = {

        steps: [],

        currentStep: 0,

        processId: null,

        algorithmResult: null

    };


    renderStepProgress();

    updateStepControls();
}