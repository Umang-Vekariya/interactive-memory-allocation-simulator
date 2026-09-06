/*
 * ============================================================
 * MEMORY ALLOCATION SIMULATOR
 * Visualization Layer
 * ============================================================
 *
 * This file is responsible only for displaying the current
 * simulation state.
 *
 * It does NOT perform allocation decisions.
 * ============================================================
 */


/* ============================================================
   MEMORY MAP
   ============================================================ */

/**
 * Renders the current memory state.
 */
function renderMemoryMap() {

    const container = document.getElementById("memoryMap");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    if (
        !simulation.memory ||
        simulation.memory.length === 0
    ) {

        container.innerHTML = `
            <div class="empty-state">
                <strong>No memory configured</strong>
                <span>
                    Load sample data to begin the simulation.
                </span>
            </div>
        `;

        return;
    }


    /*
     * Calculate total memory represented by the map.
     */
    const totalMemory = simulation.memory.reduce(
        (total, block) => total + block.size,
        0
    );


    for (const block of simulation.memory) {

        const element = document.createElement("div");

        element.className =
            `memory-block ${block.free ? "free" : "allocated"}`;


        /*
         * The height represents the proportion of memory
         * occupied by this partition.
         */
        const percentage =
            totalMemory > 0
                ? (block.size / totalMemory) * 100
                : 0;


        /*
         * Keep very small blocks visible.
         */
        const height =
            Math.max(48, percentage * 3.2);


        element.style.minHeight = `${height}px`;


        if (block.free) {

            element.innerHTML = `
                <div class="memory-block-content">
                    <span class="memory-block-title">
                        FREE
                    </span>

                    <span class="memory-block-size">
                        ${block.size} MB
                    </span>
                </div>

                <span class="memory-block-address">
                    ${block.startAddress}–${block.endAddress}
                </span>
            `;

        } else {

            element.innerHTML = `
                <div class="memory-block-content">
                    <span class="memory-block-title">
                        ${escapeHtml(block.processId)}
                        —
                        ${escapeHtml(block.processName)}
                    </span>

                    <span class="memory-block-size">
                        ${block.size} MB
                    </span>
                </div>

                <span class="memory-block-address">
                    ${block.startAddress}–${block.endAddress}
                </span>
            `;
        }


        container.appendChild(element);
    }


    /*
     * Update total memory shown in memory-map header.
     */
    const totalLabel =
        document.getElementById("memoryMapTotal");

    if (totalLabel) {
        totalLabel.textContent =
            `${totalMemory} MB`;
    }
}


/* ============================================================
   PROCESS TABLE
   ============================================================ */

/**
 * Renders the simulated process table.
 */
function renderProcessTable() {

    const tableBody =
        document.getElementById("processTableBody");

    if (!tableBody) {
        return;
    }

    tableBody.innerHTML = "";


    if (
        !simulation.processes ||
        simulation.processes.length === 0
    ) {

        tableBody.innerHTML = `
            <tr>
                <td
                    colspan="6"
                    class="table-empty"
                >
                    No processes created yet.
                </td>
            </tr>
        `;

        updateProcessSummary();

        return;
    }


    for (const process of simulation.processes) {

        const row = document.createElement("tr");


        const statusClass =
            process.status === "allocated"
                ? "status-allocated"
                : process.status === "waiting"
                    ? "status-waiting"
                    : "status-terminated";


        const statusText =
            process.status.charAt(0).toUpperCase() +
            process.status.slice(1);


        let actions = "";


        if (process.status === "waiting") {

            actions = `
                <button
                    class="button button-primary button-small"
                    onclick="allocateFromTable('${escapeAttribute(process.id)}')"
                >
                    Allocate
                </button>
            `;

        } else if (process.status === "allocated") {

            actions = `
                <button
                    class="button button-secondary button-small"
                    onclick="requestMoreFromTable('${escapeAttribute(process.id)}')"
                >
                    Request More
                </button>

                <button
                    class="button button-danger button-small"
                    onclick="terminateFromTable('${escapeAttribute(process.id)}')"
                >
                    Terminate
                </button>
            `;

        } else {

            actions = `
                <span class="panel-meta">
                    Released
                </span>
            `;
        }


        row.innerHTML = `

            <td>
                <strong>${escapeHtml(process.id)}</strong>
            </td>

            <td>
                ${escapeHtml(process.name)}
            </td>

            <td>
                ${process.requestedMemory} MB
            </td>

            <td>
                ${process.allocatedMemory} MB
            </td>

            <td>
                <span class="status-badge ${statusClass}">
                    ${statusText}
                </span>
            </td>

            <td>
                <div class="action-buttons">
                    ${actions}
                </div>
            </td>
        `;


        tableBody.appendChild(row);
    }


    updateProcessSummary();
}


/* ============================================================
   PROCESS SELECT
   ============================================================ */

/**
 * Updates the process dropdown used by the Allocate button.
 */
function renderProcessSelect() {

    const select =
        document.getElementById(
            "allocationProcessSelect"
        );

    if (!select) {
        return;
    }

    select.innerHTML = `
        <option value="">
            Select process
        </option>
    `;


    for (const process of simulation.processes) {

        if (process.status !== "waiting") {
            continue;
        }


        const option =
            document.createElement("option");

        option.value = process.id;

        option.textContent =
            `${process.id} — ${process.name} (${process.requestedMemory} MB)`;


        select.appendChild(option);
    }
}


/* ============================================================
   DASHBOARD
   ============================================================ */

/**
 * Updates dashboard statistics.
 */
function renderStatistics() {

    const stats = calculateStatistics();


    setText(
        "totalMemory",
        `${stats.totalMemory} MB`
    );

    setText(
        "allocatedMemory",
        `${stats.allocatedMemory} MB`
    );

    setText(
        "freeMemory",
        `${stats.freeMemory} MB`
    );

    setText(
        "utilization",
        `${stats.utilization.toFixed(1)}%`
    );

    setText(
        "processCount",
        stats.totalProcesses
    );

    setText(
        "freeBlockCount",
        stats.freeBlockCount
    );


    setText(
        "internalFragmentation",
        `${stats.internalFragmentation} MB`
    );

    setText(
        "externalFragmentation",
        `${stats.externalFragmentation} MB`
    );

    setText(
        "largestFreeBlock",
        `${stats.largestFreeBlock} MB`
    );
}


/* ============================================================
   ACTIVITY LOG
   ============================================================ */

/**
 * Displays recent simulation events.
 */
function renderActivityLog() {

    const container =
        document.getElementById("activityLog");

    if (!container) {
        return;
    }

    container.innerHTML = "";


    if (
        !simulation.events ||
        simulation.events.length === 0
    ) {

        container.innerHTML = `
            <div class="empty-state small">
                <span>
                    No simulation events yet.
                </span>
            </div>
        `;

        return;
    }


    for (const event of simulation.events) {

        const element =
            document.createElement("div");

        element.className = "log-entry";


        element.innerHTML = `
            <span class="log-time">
                ${escapeHtml(event.time)}
            </span>

            <span class="log-message">
                ${escapeHtml(event.message)}
            </span>
        `;


        container.appendChild(element);
    }
}


/* ============================================================
   ALLOCATION STEPS
   ============================================================ */

/**
 * Displays the reasoning returned by the allocation algorithm.
 */
function renderAllocationSteps(result, requestSize) {

    const container =
        document.getElementById("allocationSteps");

    if (!container) {
        return;
    }

    container.innerHTML = "";


    if (!result) {

        container.innerHTML = `
            <div class="empty-state small">
                <span>
                    Allocation decisions will appear here.
                </span>
            </div>
        `;

        return;
    }


    let stepNumber = 1;


    /*
     * Step 1 — Request
     */
    addStep(
        container,
        stepNumber++,
        `Request = <strong>${requestSize} MB</strong>`
    );


    /*
     * Display blocks checked by the algorithm.
     */
    for (const block of result.checkedBlocks) {

        if (block.suitable) {

            addStep(
                container,
                stepNumber++,
                `Block ${block.blockId} — ${block.size} MB → <strong>Suitable</strong>`
            );

        } else {

            addStep(
                container,
                stepNumber++,
                `Block ${block.blockId} — ${block.size} MB → Too small`
            );
        }
    }


    if (result.success) {

        addStep(
            container,
            stepNumber++,
            `Block <strong>${result.selectedBlockId}</strong> selected`
        );


        if (result.leftover > 0) {

            addStep(
                container,
                stepNumber++,
                `Leftover free space = <strong>${result.leftover} MB</strong>`
            );
        }


        addStep(
            container,
            stepNumber++,
            `<strong>Allocation successful</strong>`
        );

    } else {

        addStep(
            container,
            stepNumber++,
            `<strong>No suitable free block found</strong>`
        );
    }
}


/**
 * Adds one step to the allocation explanation.
 */
function addStep(container, number, text) {

    const element =
        document.createElement("div");

    element.className = "step";


    element.innerHTML = `
        <span class="step-number">
            ${number}
        </span>

        <span class="step-text">
            ${text}
        </span>
    `;


    container.appendChild(element);
}


/* ============================================================
   HELPERS
   ============================================================ */

function setText(id, value) {

    const element =
        document.getElementById(id);

    if (element) {
        element.textContent = value;
    }
}


function updateProcessSummary() {

    const element =
        document.getElementById("processSummary");

    if (!element) {
        return;
    }


    const count =
        simulation.processes.length;


    element.textContent =
        `${count} process${count === 1 ? "" : "es"}`;
}


/**
 * Prevent HTML injection when displaying process data.
 */
function escapeHtml(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function escapeAttribute(value) {
    return String(value)
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'");
}