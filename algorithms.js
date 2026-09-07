/*
 * Memory Allocation Algorithms — First Fit, Best Fit, Worst Fit.
 * Each function returns the blocks checked so the UI can explain the decision.
 */

/**
 * First Fit
 *
 * Searches from the beginning and selects the
 * first free block large enough for the request.
 */
// First Fit: allocate to the first free block big enough for the request.
function firstFit(memory, requestSize) {
    const checkedBlocks = [];
    const suitableBlocks = [];

    for (const block of memory) {
        if (!block.free) continue;

        const suitable = block.size >= requestSize;
        checkedBlocks.push({ blockId: block.id, size: block.size, suitable });

        if (suitable) {
            suitableBlocks.push(block.id);
            return {
                success: true,
                selectedBlockId: block.id,
                checkedBlocks,
                suitableBlocks,
                leftover: block.size - requestSize
            };
        }
    }

    return { success: false, selectedBlockId: null, checkedBlocks, suitableBlocks, leftover: 0 };
}

/**
 * Best Fit
 *
 * Searches all free blocks and selects the
 * smallest block that can satisfy the request.
 */
// Best Fit: allocate to the smallest free block that still satisfies the request.
function bestFit(memory, requestSize) {
    const checkedBlocks = [];
    const suitableBlocks = [];
    let selectedBlock = null;

    for (const block of memory) {
        if (!block.free) continue;

        const suitable = block.size >= requestSize;
        checkedBlocks.push({ blockId: block.id, size: block.size, suitable });

        if (suitable) {
            suitableBlocks.push(block.id);
            if (selectedBlock === null || block.size < selectedBlock.size) {
                selectedBlock = block;
            }
        }
    }

    if (selectedBlock === null) {
        return { success: false, selectedBlockId: null, checkedBlocks, suitableBlocks, leftover: 0 };
    }

    return {
        success: true,
        selectedBlockId: selectedBlock.id,
        checkedBlocks,
        suitableBlocks,
        leftover: selectedBlock.size - requestSize
    };
}

/**
 * Worst Fit: allocate to the largest available free block.
 * Worst Fit
 *
 * Searches all free blocks and selects the
 * largest block available.
 */

function worstFit(memory, requestSize) {
    const checkedBlocks = [];
    const suitableBlocks = [];
    let selectedBlock = null;

    for (const block of memory) {
        if (!block.free) continue;

        const suitable = block.size >= requestSize;
        checkedBlocks.push({ blockId: block.id, size: block.size, suitable });

        if (suitable) {
            suitableBlocks.push(block.id);
            if (selectedBlock === null || block.size > selectedBlock.size) {
                selectedBlock = block;
            }
        }
    }

    if (selectedBlock === null) {
        return { success: false, selectedBlockId: null, checkedBlocks, suitableBlocks, leftover: 0 };
    }

    return {
        success: true,
        selectedBlockId: selectedBlock.id,
        checkedBlocks,
        suitableBlocks,
        leftover: selectedBlock.size - requestSize
    };
}
