/*
 * Visualization Layer — renders simulation state only, no allocation logic here.
 */

// Renders the current memory map.
function renderMemoryMap() {
    const container = document.getElementById("memoryMap");
    if (!container) return;

    container.innerHTML = "";

    if (!simulation.memory || simulation.memory.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <strong>No memory configured</strong>
                <span>Load sample data to begin the simulation.</span>
            </div>`;
        return;
    }

    const totalMemory = simulation.memory.reduce((total, block) => total + block.size, 0);

    for (const block of simulation.memory) {
        const element = document.createElement("div");
        element.className = `memory-block ${block.free ? "free" : "allocated"}`;

        // Block height is proportional to its share of total memory (min height keeps small blocks visible).
        const percentage = totalMemory > 0 ? (block.size / totalMemory) * 100 : 0;
        element.style.minHeight = `${Math.max(48, percentage * 3.2)}px`;

        const title = block.free
            ? "FREE"
            : `${escapeHtml(block.processId)} — ${escapeHtml(block.processName)}`;

        element.innerHTML = `
            <div class="memory-block-content">
                <span class="memory-block-title">${title}</span>
                <span class="memory-block-size">${block.size} MB</span>
            </div>
            <span class="memory-block-address">${block.startAddress}–${block.endAddress}</span>`;

        container.appendChild(element);
    }

    setText("memoryMapTotal", `${totalMemory} MB`);
}

// Renders the process table.
function renderProcessTable() {
    const tableBody = document.getElementById("processTableBody");
    if (!tableBody) return;

    tableBody.innerHTML = "";

    if (!simulation.processes || simulation.processes.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" class="table-empty">No processes created yet.</td></tr>`;
        updateProcessSummary();
        return;
    }

    for (const process of simulation.processes) {
        const row = document.createElement("tr");

        const statusClass =
            process.status === "allocated" ? "status-allocated" :
            process.status === "waiting" ? "status-waiting" : "status-terminated";

        const statusText = process.status.charAt(0).toUpperCase() + process.status.slice(1);

        let actions = "";
        if (process.status === "waiting") {
            actions = `<button class="button button-primary button-small" onclick="allocateFromTable('${escapeAttribute(process.id)}')">Allocate</button>`;
        } else if (process.status === "allocated") {
            actions = `
                <button class="button button-secondary button-small" onclick="requestMoreFromTable('${escapeAttribute(process.id)}')">Request More</button>
                <button class="button button-danger button-small" onclick="terminateFromTable('${escapeAttribute(process.id)}')">Terminate</button>`;
        } else {
            actions = `<span class="panel-meta">Released</span>`;
        }

        row.innerHTML = `
            <td><strong>${escapeHtml(process.id)}</strong></td>
            <td>${escapeHtml(process.name)}</td>
            <td>${process.requestedMemory} MB</td>
            <td>${process.allocatedMemory} MB</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td><div class="action-buttons">${actions}</div></td>`;

        tableBody.appendChild(row);
    }

    updateProcessSummary();
}

// Updates the process dropdown used by the Allocate button.
function renderProcessSelect() {
    const select = document.getElementById("allocationProcessSelect");
    if (!select) return;

    select.innerHTML = `<option value="">Select process</option>`;

    for (const process of simulation.processes) {
        if (process.status !== "waiting") continue;

        const option = document.createElement("option");
        option.value = process.id;
        option.textContent = `${process.id} — ${process.name} (${process.requestedMemory} MB)`;
        select.appendChild(option);
    }
}

// Updates dashboard statistics.
function renderStatistics() {
    const stats = calculateStatistics();

    setText("totalMemory", `${stats.totalMemory} MB`);
    setText("allocatedMemory", `${stats.allocatedMemory} MB`);
    setText("freeMemory", `${stats.freeMemory} MB`);
    setText("utilization", `${stats.utilization.toFixed(1)}%`);
    setText("processCount", stats.totalProcesses);
    setText("freeBlockCount", stats.freeBlockCount);
    setText("internalFragmentation", `${stats.internalFragmentation} MB`);
    setText("externalFragmentation", `${stats.externalFragmentation} MB`);
    setText("largestFreeBlock", `${stats.largestFreeBlock} MB`);
}

// Displays recent simulation events.
function renderActivityLog() {
    const container = document.getElementById("activityLog");
    if (!container) return;

    container.innerHTML = "";

    if (!simulation.events || simulation.events.length === 0) {
        container.innerHTML = `<div class="empty-state small"><span>No simulation events yet.</span></div>`;
        return;
    }

    for (const event of simulation.events) {
        const element = document.createElement("div");
        element.className = "log-entry";
        element.innerHTML = `
            <span class="log-time">${escapeHtml(event.time)}</span>
            <span class="log-message">${escapeHtml(event.message)}</span>`;
        container.appendChild(element);
    }
}

// Displays the reasoning returned by the allocation algorithm.
function renderAllocationSteps(result, requestSize) {
    const container = document.getElementById("allocationSteps");
    if (!container) return;

    container.innerHTML = "";

    if (!result) {
        container.innerHTML = `<div class="empty-state small"><span>Allocation decisions will appear here.</span></div>`;
        return;
    }

    let stepNumber = 1;
    addStep(container, stepNumber++, `Request = <strong>${requestSize} MB</strong>`);

    for (const block of result.checkedBlocks) {
        const text = block.suitable
            ? `Block ${block.blockId} — ${block.size} MB → <strong>Suitable</strong>`
            : `Block ${block.blockId} — ${block.size} MB → Too small`;
        addStep(container, stepNumber++, text);
    }

    if (result.success) {
        addStep(container, stepNumber++, `Block <strong>${result.selectedBlockId}</strong> selected`);

        if (result.leftover > 0) {
            addStep(container, stepNumber++, `Leftover free space = <strong>${result.leftover} MB</strong>`);
        }

        addStep(container, stepNumber++, `<strong>Allocation successful</strong>`);
    } else {
        addStep(container, stepNumber++, `<strong>No suitable free block found</strong>`);
    }
}

// Adds one step to the allocation explanation panel.
function addStep(container, number, text) {
    const element = document.createElement("div");
    element.className = "step";
    element.innerHTML = `<span class="step-number">${number}</span><span class="step-text">${text}</span>`;
    container.appendChild(element);
}

/* ---------- Helpers ---------- */

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function updateProcessSummary() {
    const element = document.getElementById("processSummary");
    if (!element) return;
    const count = simulation.processes.length;
    element.textContent = `${count} process${count === 1 ? "" : "es"}`;
}

// Prevents HTML injection when rendering user-entered process data.
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
