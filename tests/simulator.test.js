// Dependency-free regression suite: node tests/simulator.test.js
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

class Element {
    constructor() {
        this.innerHTML = ''; this.textContent = ''; this.value = ''; this.children = [];
        this.style = { setProperty() {} }; this.dataset = {}; this.disabled = false; this.checked = false;
        const classes = new Set();
        this.classList = { add: v => classes.add(v), remove: v => classes.delete(v), contains: v => classes.has(v) };
    }
    setAttribute(name,value) { this[name]=value; }
    appendChild(child) { this.children.push(child); this.lastElementChild = child; }
    querySelector() { return null; }
    addEventListener() {}
    reset() { this.value = ''; }
}
const elements = new Map();
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
for (const [, id] of html.matchAll(/id="([^"]+)"/g)) elements.set(id, new Element());
elements.get('scenarioSelect').value = 'normal';
const scheduledTimers=new Map(); let nextTimerId=1;
const savedStorage=new Map();
const context = vm.createContext({
    assert, console, setTimeout: fn => { const id=nextTimerId++; scheduledTimers.set(id,fn); return id; }, clearTimeout: id => scheduledTimers.delete(id),
    runTimer: id => { const fn=scheduledTimers.get(id); if(!fn) return false; scheduledTimers.delete(id); fn(); return true; },
    localStorage: { getItem:key=>savedStorage.get(key)||null, setItem:(key,value)=>savedStorage.set(key,value) }, confirm: () => true, prompt: () => '10',
    document: {
        readyState: 'loading',
        addEventListener() {}, createElement: () => new Element(),
        getElementById: id => elements.get(id) || null, querySelector: () => new Element()
    }
});
for (const [, file] of html.matchAll(/<script src="([^?"]+)(?:[^"]*)"/g)) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
}
vm.runInContext(`
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS ' + name); }
function fresh(sizes, mode = 'variable', algorithm = 'first-fit') {
    const state = MemoryEngine.state(mode); state.algorithm = algorithm;
    MemoryEngine.initialize(state, sizes); return state;
}
function process(state, id, size) { assert.equal(MemoryEngine.create(state, id, id, size).success, true); }
function invariant(state) {
    assert.equal(state.memory.reduce((sum, b) => sum + b.size, 0), state.totalMemory);
    assert.equal(new Set(state.memory.map(b => b.id)).size, state.memory.length);
    let address = 0;
    for (const block of state.memory) {
        assert.ok(Number.isSafeInteger(block.size) && block.size > 0);
        assert.equal(block.startAddress, address); assert.equal(block.endAddress, address + block.size - 1);
        address += block.size;
    }
    for (const p of state.processes) {
        const blocks = state.memory.filter(b => b.processId === p.id);
        assert.equal(blocks.length, p.status === 'allocated' ? 1 : 0);
        if (blocks.length) { assert.equal(blocks[0].id, p.blockId); assert.equal(blocks[0].size, p.allocatedMemory); assert.ok(p.allocatedMemory >= p.requestedMemory); }
    }
    const stats = MemoryEngine.statistics(state);
    assert.equal(stats.allocatedMemory + stats.freeMemory, state.totalMemory);
    assert.ok(stats.internalFragmentation >= 0 && stats.externalFragmentation >= 0);
}

test('First Fit stops at the first suitable free block and splits it', () => {
    const s = fresh([100, 500, 200, 300, 600]); process(s, 'P1', 212);
    const r = MemoryEngine.allocate(s, 'P1'); assert.equal(r.block.id, 2); assert.equal(r.block.size, 212);
    assert.equal(r.algorithmResult.checkedBlocks.length, 2); assert.equal(s.memory[2].size, 288); invariant(s);
});
test('Best Fit examines every free block and selects the smallest suitable block', () => {
    const s = fresh([100, 500, 200, 300, 600], 'variable', 'best-fit'); process(s, 'P1', 212);
    const r = MemoryEngine.allocate(s, 'P1'); assert.equal(r.block.id, 4); assert.equal(r.algorithmResult.checkedBlocks.length, 5); invariant(s);
});
test('Worst Fit selects the largest suitable block', () => {
    const s = fresh([100, 500, 200, 300, 600], 'variable', 'worst-fit'); process(s, 'P1', 212);
    assert.equal(MemoryEngine.allocate(s, 'P1').block.id, 5); invariant(s);
});
test('Termination merges both adjacent holes and preserves lifecycle', () => {
    const s = fresh([1000]); for (let i=1; i<=3; i++) { process(s, 'P'+i, 200); MemoryEngine.allocate(s, 'P'+i); }
    MemoryEngine.terminate(s, 'P1'); MemoryEngine.terminate(s, 'P3'); MemoryEngine.terminate(s, 'P2');
    assert.equal(s.memory.length, 1); assert.equal(s.memory[0].size, 1000);
    assert.ok(s.processes.every(p => p.terminationStep > p.allocationStep));
    assert.equal(MemoryEngine.allocate(s, 'P1').success, false); invariant(s);
});
test('Insufficient total memory diagnostic (including oversized processes)', () => {
    const s = fresh([100]); process(s, 'P1', 150); const r = MemoryEngine.allocate(s, 'P1');
    assert.equal(r.diagnostic.kind, 'insufficient-memory'); assert.equal(r.diagnostic.externalFragmentation, 0);
    assert.equal(s.processes[0].allocationFailures, 1); assert.equal(s.metrics.failures, 1); invariant(s);
});
function stressState() {
    const s = fresh(SCENARIOS.fragmentation.memory);
    for (const p of SCENARIOS.fragmentation.processes) process(s, p.id, p.size);
    for (const action of SCENARIOS.fragmentation.actions) MemoryEngine.apply(s, action, true);
    return s;
}
test('550 MB free / 250 MB largest / 400 MB request identifies external fragmentation', () => {
    const s = stressState(); assert.equal(s.lastFailure.kind, 'external-fragmentation');
    assert.equal(s.lastFailure.freeMemory, 550); assert.equal(s.lastFailure.largestFreeBlock, 250);
    assert.equal(s.lastFailure.externalFragmentation, 300); assert.equal(s.processes[5].status, 'waiting'); invariant(s);
});
test('Compaction conserves free memory, moves addresses, then retry succeeds', () => {
    const s = stressState(); const allocated = s.processes.filter(p => p.status === 'allocated').map(p => [p.id, p.name, p.requestedMemory, p.blockId]);
    const r = MemoryEngine.compact(s); assert.equal(r.before.freeMemory, r.after.freeMemory);
    assert.equal(r.after.largestFreeBlock, 550); assert.equal(r.after.externalFragmentation, 0); assert.equal(s.compactionCount, 1);
    assert.deepEqual(s.processes.filter(p => p.status === 'allocated').map(p => [p.id, p.name, p.requestedMemory, p.blockId]), allocated);
    assert.equal(s.memory[0].startAddress, 0); assert.equal(MemoryEngine.allocate(s, 'P6').success, true);
    assert.equal(s.processes[5].allocationAttempts, 2); assert.equal(s.processes[5].allocationFailures, 1); invariant(s);
});
test('Independent identical-workload comparison has real search metrics and Best Fit wins classic workload', () => {
    createMemory([100,500,200,300,600]); [212,417,112,426].forEach((size,i) => createProcess('P'+i, 'Process '+i, size));
    const before = JSON.stringify(simulation.memory); const results = runAlgorithmComparison();
    assert.equal(JSON.stringify(simulation.memory), before);
    assert.deepEqual(results.map(r => r.successfulAllocations), [3,4,3,3]);
    assert.ok(results.every(r => r.searchOperations > 0 && r.averageSearchLength > 0));
    assert.equal(recommendAlgorithm(results)[0].key, 'best-fit');
    results[0].finalMemory[0].size = 999; assert.equal(results[1].finalMemory[0].size, 100);
});
test('Fixed partitions reserve full size, track internal waste, and cannot merge or compact', () => {
    const s = fresh([300,500], 'fixed'); process(s,'P1',200); MemoryEngine.allocate(s,'P1');
    let stats = MemoryEngine.statistics(s); assert.equal(s.memory.length,2); assert.equal(stats.internalFragmentation,100);
    assert.equal(stats.internalFragmentationPercent,100/300*100); assert.equal(stats.externalFragmentation,0);
    const before = JSON.stringify(s.memory); assert.equal(MemoryEngine.compact(s).success,false); assert.equal(JSON.stringify(s.memory),before);
    assert.equal(MemoryEngine.grow(s,'P1',50).success,true); assert.equal(MemoryEngine.statistics(s).internalFragmentation,50);
    assert.equal(MemoryEngine.grow(s,'P1',100).success,false); assert.equal(s.lastFailure.kind,'partition-limit');
    MemoryEngine.terminate(s,'P1'); assert.equal(s.memory.length,2); invariant(s);
});
test('Variable additional requests grow only the adjacent allocation and update requested size', () => {
    const s = fresh([500]); process(s,'P1',100); MemoryEngine.allocate(s,'P1');
    assert.equal(MemoryEngine.grow(s,'P1',50).success,true); assert.equal(s.processes[0].requestedMemory,150);
    process(s,'P2',100); MemoryEngine.allocate(s,'P2');
    assert.equal(MemoryEngine.grow(s,'P1',50).success,false); assert.equal(s.lastFailure.kind,'adjacency'); invariant(s);
});
test('Lifecycle replay includes release, growth, compaction, and retries', () => {
    const s = stressState(); MemoryEngine.compact(s); MemoryEngine.allocate(s,'P6'); MemoryEngine.grow(s,'P6',10);
    const replay = simulateWorkload(s.initialMemory, s.workload, firstFit);
    assert.equal(replay.successfulAllocations,s.metrics.successes); assert.equal(replay.failedAllocations,s.metrics.failures);
    assert.equal(replay.freeMemory,MemoryEngine.statistics(s).freeMemory); assert.equal(replay.compactionCount,1);
});
test('Analytics records failed requests, release, growth, and compaction at matching steps', () => {
    const s = stressState(); const n=s.analytics.length;
    MemoryEngine.compact(s); assert.equal(s.analytics.length,n+1);
    assert.equal(s.analytics.at(-1).externalFragmentation,0); assert.equal(s.analytics.at(-1).freeMemory,550);
    assert.equal(s.analytics.length,s.events.length); assert.equal(s.analytics.at(-1).step,s.step);
});
test('Reset clears memory, processes, metrics, history, charts, diagnostics, comparison, and step mode', () => {
    simulation.lastFailure={}; simulation.compactionCount=9; simulation.scenario='mixed'; simulation.stepMode=true;
    resetSimulation(); renderApplication();
    assert.equal(simulation.memory.length,0); assert.equal(simulation.processes.length,0); assert.equal(simulation.events.length,0);
    assert.equal(simulation.analytics.length,0); assert.equal(simulation.metrics.attempts,0); assert.equal(simulation.compactionCount,0);
    assert.equal(simulation.comparisonResults.length,0); assert.equal(simulation.lastFailure,null); assert.equal(simulation.lastCompaction,null);
    assert.equal(simulation.stepMode,false); assert.equal(simulation.stepSimulation.steps.length,0);
    assert.ok(document.getElementById('utilizationChart').innerHTML.includes('Configure memory'));
    assert.equal(document.getElementById('memoryMapTotal').textContent,'0 MB');
});
test('Step Next / Previous / Run All commits exactly once, even after reviewing completion', () => {
    createMemory([100,500,200]); createProcess('P1','Demo',212); simulation.stepMode=true; startStepSimulation('P1');
    assert.equal(simulation.stepSimulation.steps.filter(s => s.type==='check').length,2);
    handleNextStep(); handleNextStep(); const cursor=simulation.stepSimulation.currentStep;
    handlePreviousStep(); assert.equal(simulation.stepSimulation.currentStep,cursor-1); assert.equal(simulation.metrics.attempts,0);
    handleRunAll(); assert.equal(simulation.metrics.attempts,1); handlePreviousStep(); handleNextStep(); handleRunAll();
    assert.equal(simulation.metrics.attempts,1); assert.equal(simulation.processes[0].status,'allocated'); invariant(simulation);
});
test('Step failure commits one failed attempt and shows diagnostics', () => {
    createMemory([200,200]); createProcess('P1','Demo',300); startStepSimulation('P1'); handleRunAll(); handleRunAll();
    assert.equal(simulation.metrics.attempts,1); assert.equal(simulation.metrics.failures,1); assert.equal(simulation.lastFailure.kind,'external-fragmentation');
});
test('Changing algorithm or layout cancels stale step previews', () => {
    createMemory([500]); createProcess('P1','Demo',100); startStepSimulation('P1'); setAlgorithm('best-fit');
    assert.equal(simulation.stepSimulation.steps.length,0); handleRunAll(); assert.equal(simulation.metrics.attempts,0);
    startStepSimulation('P1'); compactMemory(); assert.equal(simulation.stepSimulation.steps.length,0); invariant(simulation);
});
test('Scenario step mode pauses and advances its cursor after a single commit', () => {
    resetSimulation(); document.getElementById('scenarioSelect').value='comparison'; loadScenario(); simulation.stepMode=true;
    runScenario(); assert.equal(simulation.scenarioPending,true); assert.equal(simulation.scenarioCursor,0);
    handleRunAll(); assert.equal(simulation.scenarioCursor,1); assert.equal(simulation.scenarioPending,false);
    handlePreviousStep(); handleRunAll(); assert.equal(simulation.scenarioCursor,1);
    simulation.stepMode=false; runScenario(); assert.equal(simulation.scenarioCursor,4); invariant(simulation);
});
test('Invalid inputs and duplicate IDs do not mutate memory or allocate twice', () => {
    const s = fresh([100]); const before=JSON.stringify(s.memory);
    for (const n of [0,-1,NaN,Infinity,0.5]) assert.equal(MemoryEngine.create(s,'P','Demo',n).success,false);
    assert.equal(JSON.stringify(s.memory),before); process(s,'P1',100);
    assert.equal(MemoryEngine.create(s,'p1','Duplicate',1).success,false);
    MemoryEngine.allocate(s,'P1'); assert.equal(MemoryEngine.allocate(s,'P1').success,false); invariant(s);
    assert.throws(() => MemoryEngine.initialize(s,[100,-1])); invariant(s);
});
test('Zero-free-memory ratios and all-full compaction remain finite', () => {
    const s=fresh([100]); process(s,'P1',100); MemoryEngine.allocate(s,'P1'); MemoryEngine.compact(s);
    const stats=MemoryEngine.statistics(s); assert.equal(stats.freeMemory,0); assert.equal(stats.externalFragmentationPercent,0);
    assert.equal(stats.internalFragmentationPercent,0); assert.equal(s.memory.length,1); invariant(s);
});
test('All five scenarios run under every algorithm and both partition modes', () => {
    for (const scenario of Object.values(SCENARIOS)) for (const mode of ['variable','fixed']) for (const algorithm of Object.keys(MemoryEngine.algorithms)) {
        const s=fresh(scenario.memory,mode,algorithm);
        for (const p of scenario.processes) process(s,p.id,p.size);
        for (const action of scenario.actions) { MemoryEngine.apply(s,action); invariant(s); }
    }
});
test('Overview summary stays synchronized across allocation, release, and reset', () => {
    createMemory([1000]); createProcess('P1', 'Editor', 150); allocateProcess('P1'); renderApplication();
    assert.equal(document.getElementById('utilization').textContent,'15.0%');
    assert.equal(document.getElementById('overviewAllocated').textContent,'150 MB');
    assert.equal(document.getElementById('overviewFree').textContent,'850 MB');
    assert.equal(document.getElementById('overviewProcessCount').textContent,1);
    terminateProcess('P1'); renderApplication();
    assert.equal(document.getElementById('overviewFree').textContent,'1000 MB');
    resetSimulation(); renderApplication();
    assert.equal(document.getElementById('overviewFree').textContent,'0 MB');
    assert.equal(document.getElementById('utilization').textContent,'0.0%');
});
test('Request preview matches actual algorithm placement without mutating simulation state', () => {
    for (const mode of ['variable','fixed']) {
        const s = fresh([100,500,200,300,600], mode);
        const snapshot = JSON.stringify(s);
        const preview = inspectRequest(s,212);
        assert.equal(preview.kind,'fits'); assert.equal(preview.suitableCount,3);
        assert.deepEqual(preview.choices.map(c=>c.blockId),[2,4,5,2]);
        assert.equal(JSON.stringify(s),snapshot);
        for (const choice of preview.choices) {
            const actual = fresh([100,500,200,300,600],mode,choice.algorithm);
            process(actual,'P',212); const result = MemoryEngine.allocate(actual,'P');
            assert.equal(result.block.id,choice.blockId);
            assert.equal(result.algorithmResult.checkedBlocks.length,choice.searches);
            assert.equal(choice.remaining,choice.size-212);
        }
    }
});
test('Request preview distinguishes fragmentation, capacity limits, invalid sizes and compaction recovery', () => {
    const s = stressState(); const snapshot=JSON.stringify(s);
    assert.equal(inspectRequest(s,400).kind,'external-fragmentation');
    assert.equal(JSON.stringify(s),snapshot);
    MemoryEngine.compact(s); assert.equal(inspectRequest(s,400).kind,'fits');
    assert.equal(inspectRequest(s,1001).kind,'insufficient-memory');
    assert.equal(inspectRequest(fresh([300,300],'fixed'),400).kind,'partition-limit');
    assert.equal(inspectRequest(MemoryEngine.state(),100).kind,'unconfigured');
    for (const size of [0,-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]) assert.equal(inspectRequest(s,size).kind,'invalid');
});
test('Waiting queue and selected request preview stay synchronized after allocation', () => {
    createMemory([500]); createProcess('Q1','Queued',200); createProcess('Q2','Next',100);
    document.getElementById('allocationProcessSelect').value='Q1';
    renderApplication(); assert.equal(document.getElementById('waitingCount').textContent,'2 waiting');
    assert.equal(document.getElementById('previewRequest').value,200);
    assert.equal(document.getElementById('previewRequest').disabled,true);
    assert.equal(document.getElementById('allocationProcessSelect').value,'Q1');
    allocateProcess('Q1'); renderApplication();
    assert.equal(document.getElementById('waitingCount').textContent,'1 waiting');
    assert.equal(document.getElementById('allocationProcessSelect').value,'');
    assert.equal(document.getElementById('previewRequest').disabled,false);
});
test('Guided demo reaches each explained state and preserves the failed attempt on retry', () => {
    beginGuidedDemo(); assert.equal(simulation.guide.stage,0);
    advanceGuidedDemo(); assert.equal(calculateStatistics().freeMemory,0);
    advanceGuidedDemo(); assert.equal(calculateStatistics().freeMemory,550); assert.equal(calculateStatistics().largestFreeBlock,250);
    advanceGuidedDemo(); assert.equal(simulation.lastFailure.kind,'external-fragmentation');
    advanceGuidedDemo(); assert.equal(calculateStatistics().freeMemory,550); assert.equal(calculateStatistics().largestFreeBlock,550);
    advanceGuidedDemo(); assert.equal(calculateStatistics().allocatedMemory,850); assert.equal(calculateStatistics().freeMemory,150);
    assert.equal(simulation.processes.find(p=>p.id==='P6').allocationFailures,1);
    const snapshot=JSON.stringify(simulation); assert.equal(advanceGuidedDemo(),false); assert.equal(JSON.stringify(simulation),snapshot);
});
test('Guided lesson stops after an outside mutation', () => {
    beginGuidedDemo(); allocateProcess('P1'); renderApplication();
    const snapshot=JSON.stringify(simulation); assert.equal(advanceGuidedDemo(),false); assert.equal(JSON.stringify(simulation),snapshot);
    assert.match(document.getElementById('guidedTitle').textContent,/Workload changed/);
});
test('Playback pauses, changes speed, commits once, and cancels when layout changes', () => {
    createMemory([500]); createProcess('A','Animated',200); simulation.stepMode=true; startStepSimulation('A');
    document.getElementById('playbackSpeed').value='500'; playWalkthrough();
    assert.equal(labPlayback.playing,true); runTimer(labPlayback.timer); assert.equal(simulation.stepSimulation.currentStep,1);
    const oldTimer=labPlayback.timer; pauseWalkthrough(); assert.equal(runTimer(oldTimer),false); assert.equal(simulation.metrics.attempts,0);
    playWalkthrough(); for(let i=0;i<20 && labPlayback.playing;i++) runTimer(labPlayback.timer);
    assert.equal(simulation.metrics.attempts,1); assert.equal(labPlayback.playing,false); playWalkthrough(); assert.equal(labPlayback.playing,false);
    createProcess('B','Cancelled',100); startStepSimulation('B'); playWalkthrough(); const cancelled=labPlayback.timer;
    createMemory([600]); assert.equal(labPlayback.playing,false); assert.equal(runTimer(cancelled),false); assert.equal(simulation.metrics.attempts,0);
});
test('Portable workload restores algorithm changes, failures, compaction and process lifecycle by replay', () => {
    beginGuidedDemo(); while(advanceGuidedDemo()) {}
    setAlgorithm('best-fit'); createProcess('P7','Extra',200); allocateProcess('P7');
    const restored=restoreWorkload(JSON.parse(JSON.stringify(serializeWorkload(simulation))));
    for(const key of ['memory','processes','metrics','analytics','events','workload']) assert.deepEqual(restored[key],simulation[key]);
    assert.equal(restored.algorithm,'best-fit'); assert.equal(restored.compactionCount,1);
    const empty=MemoryEngine.state(); assert.equal(restoreWorkload(serializeWorkload(empty)).totalMemory,0);
    simulation.mode='fixed'; createMemory(SCENARIOS.fragmentation.memory); simulation.scenario='fragmentation';
    for(const p of SCENARIOS.fragmentation.processes) createProcess(p.id,p.name,p.size); runScenario();
    const fixedReplay=restoreWorkload(serializeWorkload(simulation));
    assert.deepEqual(fixedReplay.events,simulation.events); assert.deepEqual(fixedReplay.analytics,simulation.analytics);
    assert.equal(fixedReplay.scenarioCursor,simulation.scenarioCursor);
});
test('Workload validation rejects malformed data and impossible actions without mutating the live state', () => {
    const saved=serializeWorkload(simulation), before=JSON.stringify(simulation);
    for(const bad of [{...saved,version:99},{...saved,memory:[-1]},{...saved,initialAlgorithm:'toString'},
        {...saved,actions:[{type:'terminate',id:'missing'}]}, {...saved,actions:[{type:'grow',id:'P1',size:0}]},
        {...saved,actions:[{type:'algorithm',algorithm:'__proto__'}]}, {...saved,scenario:'unknown'}]) assert.throws(()=>restoreWorkload(bad));
    assert.equal(JSON.stringify(simulation),before);
});
test('Browser autosave restores workload after refresh and reset saves an empty session', () => {
    simulation.mode='variable'; createMemory([500]); createProcess('S','Saved',123); allocateProcess('S'); labStorageReady=true; persistSession();
    resetSimulation(); restoreLocalSession(); assert.equal(simulation.processes[0].allocatedMemory,123); assert.equal(calculateStatistics().freeMemory,377);
    resetSimulation(); persistSession(); restoreLocalSession(); assert.equal(simulation.processes.length,0); assert.equal(simulation.totalMemory,0); labStorageReady=false;
});
test('Algorithm changes in a saved session do not override independent comparison strategies', () => {
    createMemory([100,500,200,300,600]); createProcess('X','First',212); allocateProcess('X'); setAlgorithm('worst-fit'); createProcess('Y','Next',417);
    const results=runAlgorithmComparison(); assert.deepEqual(results.map(r=>r.finalProcesses.find(p=>p.id==='X').blockId),[2,4,5,2]);
    assert.match(document.getElementById('comparisonCharts').innerHTML,/Free blocks examined/);
});
test('Decision cost distinguishes leftover holes from fixed waste and report safely escapes user text', () => {
    simulation.mode='fixed'; createMemory([300]); createProcess('F','<script>alert(1)<\/script>',200); allocateProcess('F'); renderApplication();
    assert.match(document.getElementById('decisionCost').textContent,/100 MB internal waste/);
    assert.match(document.getElementById('studioCapacity').innerHTML,/internal-waste-overlay/);
    const report=buildSimulationReport(simulation); assert.ok(!report.includes('<script>')); assert.match(report,/&lt;script&gt;/);
    assert.match(report,/Memory layout/); assert.match(report,/Event history/);
    simulation.mode='variable'; createMemory([500]); createProcess('V','Variable',200); allocateProcess('V'); renderApplication();
    assert.match(document.getElementById('decisionCost').textContent,/300 MB left over/);
});
test('Block inspector distinguishes reserved payload, fixed waste and actual in-place growth capacity', () => {
    const fixed=fresh([300,500],'fixed'); process(fixed,'F',200); MemoryEngine.allocate(fixed,'F');
    let details=describeMemoryBlock(fixed,fixed.processes[0].blockId);
    assert.equal(details.size,300); assert.equal(details.payload,200); assert.equal(details.waste,100); assert.equal(details.growthCapacity,100);
    const before=JSON.stringify(fixed); describeMemoryBlock(fixed,2); assert.equal(JSON.stringify(fixed),before);
    MemoryEngine.grow(fixed,'F',50); details=describeMemoryBlock(fixed,fixed.processes[0].blockId); assert.equal(details.growthCapacity,50);
    const variable=fresh([200,100,150,100]); process(variable,'V',150); MemoryEngine.allocate(variable,'V');
    details=describeMemoryBlock(variable,variable.processes[0].blockId); assert.equal(details.growthCapacity,400); assert.equal(details.waste,0);
    assert.equal(MemoryEngine.grow(variable,'V',details.growthCapacity).success,true);
    assert.equal(describeMemoryBlock(variable,999),null); invariant(variable);
});
test('Compaction address snapshots and movements remain unchanged after later allocations', () => {
    const state=stressState(); const result=MemoryEngine.compact(state);
    assert.equal(result.beforeLayout.filter(b=>b.free).reduce((sum,b)=>sum+b.size,0),550);
    assert.equal(result.afterLayout.filter(b=>b.free).reduce((sum,b)=>sum+b.size,0),550);
    assert.deepEqual(compactionMovements(state.lastCompaction).map(m=>[m.processId,m.beforeStart,m.afterStart,m.movedBy]),[['P2',250,0,250],['P4',700,200,500]]);
    const snapshot=JSON.stringify(state.lastCompaction); MemoryEngine.allocate(state,'P6');
    assert.equal(JSON.stringify(state.lastCompaction),snapshot); assert.equal(MemoryEngine.statistics(state).freeMemory,150);
    const html=compactionSnapshotHtml(state.lastCompaction); assert.match(html,/Before compaction/); assert.match(html,/After compaction/);
    assert.match(buildSimulationReport(state),/250–449/); assert.match(buildSimulationReport(state),/200–449/); invariant(state);
});
test('Block inspection follows compaction addresses and clears removed free blocks', () => {
    beginGuidedDemo(); advanceGuidedDemo(); advanceGuidedDemo();
    const oldFree=simulation.memory.find(b=>b.free).id, allocated=simulation.memory.find(b=>b.processId==='P2').id;
    compactMemory(); assert.equal(describeMemoryBlock(simulation,allocated).startAddress,0);
    inspectedBlockId=oldFree; renderMemoryInspector(); assert.equal(inspectedBlockId,null);
    assert.match(document.getElementById('memoryInspector').innerHTML,/Select a segment/);
});
test('Next Fit wraps once and never examines a free region twice on failure', () => {
    const memory=[{id:1,size:300,free:true},{id:2,size:100,free:false},{id:3,size:150,free:true}];
    const before=JSON.stringify(memory);
    const result=nextFit(memory,200,400);
    assert.equal(result.selectedBlockId,1);
    assert.deepEqual(result.checkedBlocks.map(b=>b.blockId),[3,1]);
    assert.equal(result.checkedBlocks[1].wrapped,true);
    const failed=nextFit(memory,400,400);
    assert.equal(failed.success,false); assert.equal(failed.checkedBlocks.length,2);
    assert.equal(new Set(failed.checkedBlocks.map(b=>b.blockId)).size,2);
    assert.equal(JSON.stringify(memory),before);
    assert.equal(nextFit([],100,0).success,false);
});
test('Fixed Next Fit resumes after the last partition instead of reusing an earlier hole', () => {
    const s=fresh([300,300,300],'fixed','next-fit');
    for(const id of ['A','B','C','D']) process(s,id,200);
    MemoryEngine.allocate(s,'A'); MemoryEngine.allocate(s,'B');
    assert.equal(s.nextFitAddress,600);
    MemoryEngine.terminate(s,'A');
    const c=MemoryEngine.allocate(s,'C'); assert.equal(c.block.startAddress,600);
    assert.equal(s.nextFitAddress,0);
    const d=MemoryEngine.allocate(s,'D'); assert.equal(d.block.startAddress,0);
    assert.equal(MemoryEngine.statistics(s).internalFragmentation,300); invariant(s);
});
test('Variable Next Fit uses the leftover hole and failed searches preserve its address', () => {
    const s=fresh([300,220,500],'variable','next-fit'); process(s,'A',200);
    MemoryEngine.allocate(s,'A'); assert.equal(s.nextFitAddress,200);
    process(s,'B',50); const b=MemoryEngine.allocate(s,'B');
    assert.equal(b.block.startAddress,200); assert.equal(s.nextFitAddress,250);
    process(s,'TooBig',2000); assert.equal(MemoryEngine.allocate(s,'TooBig').success,false);
    assert.equal(s.nextFitAddress,250); invariant(s);
});
test('Next Fit address remains valid after merging and resets on compaction and configuration', () => {
    const s=fresh([300,220,500],'variable','next-fit'); process(s,'A',200); MemoryEngine.allocate(s,'A');
    MemoryEngine.terminate(s,'A'); assert.equal(s.memory.length,1); assert.equal(s.nextFitAddress,200);
    process(s,'B',100); assert.equal(MemoryEngine.allocate(s,'B').block.startAddress,0);
    assert.equal(s.nextFitAddress,100);
    MemoryEngine.compact(s); assert.equal(s.nextFitAddress,0); invariant(s);
    MemoryEngine.initialize(s,[500]); assert.equal(s.nextFitAddress,0);
});
test('Next Fit preview and step review are pure and commit advances the address exactly once', () => {
    resetSimulation(); createMemory([300,220,500]); setAlgorithm('next-fit');
    createProcess('A','A',200); allocateProcess('A'); createProcess('B','B',150);
    const before=JSON.stringify(simulation);
    const preview=inspectRequest(simulation,150).choices.find(c=>c.algorithm==='next-fit');
    assert.equal(preview.startAddress,300); assert.equal(preview.resumeAddress,200);
    assert.equal(JSON.stringify(simulation),before);
    simulation.stepMode=true; startStepSimulation('B');
    assert.equal(simulation.nextFitAddress,200);
    assert.equal(simulation.stepSimulation.algorithmResult.selectedBlockId,preview.blockId);
    assert.ok(simulation.stepSimulation.steps.some(step=>step.text.includes('Resume at address 200')));
    handleRunAll(); assert.equal(simulation.nextFitAddress,450);
    const attempts=simulation.metrics.attempts;
    handlePreviousStep(); handleRunAll(); assert.equal(simulation.nextFitAddress,450);
    assert.equal(simulation.metrics.attempts,attempts); invariant(simulation);
});
test('Next Fit saved workloads reconstruct their cursor and comparison has independent cursors', () => {
    const s=fresh([300,300,300],'fixed','next-fit');
    for(const id of ['A','B','C']) process(s,id,200);
    MemoryEngine.allocate(s,'A'); MemoryEngine.allocate(s,'B'); MemoryEngine.terminate(s,'A');
    const saved=serializeWorkload(s); const restored=restoreWorkload(JSON.parse(JSON.stringify(saved)));
    assert.equal(restored.nextFitAddress,600);
    assert.equal(MemoryEngine.allocate(restored,'C').block.startAddress,600);
    const nf=simulateWorkload(s.initialMemory,[...s.workload,{type:'allocate',id:'C'}],nextFit,'fixed');
    const ff=simulateWorkload(s.initialMemory,[...s.workload,{type:'allocate',id:'C'}],firstFit,'fixed');
    assert.equal(nf.finalMemory.find(b=>b.processId==='C').startAddress,600);
    assert.equal(ff.finalMemory.find(b=>b.processId==='C').startAddress,0);
    assert.equal(s.nextFitAddress,600); invariant(restored);
});
test('In-place growth and algorithm switches do not advance the Next Fit search position', () => {
    for(const mode of ['variable','fixed']) {
        const s=fresh([300,500],mode,'next-fit'); process(s,'A',100); MemoryEngine.allocate(s,'A');
        const cursor=s.nextFitAddress;
        assert.equal(MemoryEngine.grow(s,'A',50).success,true); assert.equal(s.nextFitAddress,cursor);
        MemoryEngine.apply(s,{type:'algorithm',algorithm:'first-fit'});
        process(s,'B',100); MemoryEngine.allocate(s,'B');
        MemoryEngine.apply(s,{type:'algorithm',algorithm:'next-fit'});
        assert.equal(s.nextFitAddress,cursor); invariant(s);
    }
});
test('Next Fit pointer follows the saved address without changing state and disappears for other algorithms', () => {
    const s=fresh([300,500],'variable','next-fit'); process(s,'A',100); MemoryEngine.allocate(s,'A');
    const before=JSON.stringify(s), html=nextFitPointerHtml(s);
    assert.ok(html.includes('--pointer-position:12.5%')); assert.ok(html.includes('Next Fit · 100 MB'));
    assert.ok(html.includes('Search starts in block'));
    assert.equal(JSON.stringify(s),before);
    s.algorithm='first-fit'; assert.equal(nextFitPointerHtml(s),'');
    assert.equal(nextFitPointerHtml(MemoryEngine.state()),'');
    MemoryEngine.compact(s); s.algorithm='next-fit'; assert.ok(nextFitPointerHtml(s).includes('Next Fit · 0 MB'));
});
test('Metric explanations use live fixed waste, useful memory and fragmentation values', () => {
    const fixed=fresh([300,500],'fixed'); process(fixed,'A',200); MemoryEngine.allocate(fixed,'A');
    const words=explainMemoryMetrics(fixed);
    assert.ok(words.useful.includes('200 MB actually requested ÷ 800 MB total = 25%'));
    assert.ok(words.useful.includes('37.5%')); assert.ok(words.internal.includes('100 MB internal waste'));
    assert.ok(words.external.includes('0 in fixed mode'));
    const fragmented=explainMemoryMetrics(stressState());
    assert.ok(fragmented.external.includes('550 MB free − 250 MB largest hole = 300 MB'));
    assert.ok(fragmented.external.includes('smaller requests'));
    const empty=memoryMetricsHtml(MemoryEngine.state());
    assert.ok(empty.includes('Configure memory')); assert.ok(!empty.includes('NaN')); assert.ok(!empty.includes('Infinity'));
});
test('Comparison maps show all four independent layouts, consistent process colors and Next Fit pointer', () => {
    createMemory([100,500,200,300,600]); [212,417,112,426].forEach((size,i)=>createProcess('P'+i,'Process '+i,size));
    const before=JSON.stringify(simulation.memory), results=runAlgorithmComparison();
    const html=document.getElementById('comparisonLayouts').innerHTML;
    assert.equal((html.match(/class="comparison-layout-card"/g)||[]).length,4);
    assert.ok(html.includes('First Fit')); assert.ok(html.includes('Next Fit'));
    assert.ok(html.includes('Next Fit · '+results[3].nextFitAddress+' MB'));
    assert.ok(html.includes('addresses 0 to 99')); assert.ok(html.includes(getProcessColorVar('P0')));
    assert.ok(results.every(result=>result.totalMemory===1700));
    assert.equal(JSON.stringify(simulation.memory),before);
    assert.equal(document.getElementById('comparisonLayoutSection').hidden,false);
});
test('Comparison map snapshots stay unchanged after live allocation and are cleared on reset', () => {
    const before=document.getElementById('comparisonLayouts').innerHTML;
    const step=simulation.comparisonStep;
    allocateProcess('P0'); renderApplication();
    assert.equal(document.getElementById('comparisonLayouts').innerHTML,before);
    assert.ok(document.getElementById('comparisonLayoutNote').textContent.includes('Live memory has changed'));
    assert.equal(simulation.comparisonStep,step);
    resetSimulation(); renderApplication();
    assert.equal(document.getElementById('comparisonLayouts').innerHTML,'');
    assert.equal(document.getElementById('comparisonLayoutSection').hidden,true);
    assert.equal(document.getElementById('studioPointer').innerHTML,'');
    assert.ok(document.getElementById('overviewMetricHelp').innerHTML.includes('Configure memory'));
});
test('Comparison layouts preserve fixed internal waste and escape user-provided text', () => {
    const actions=[{type:'create',id:'<P>',name:'<script>bad</script>',size:200},{type:'allocate',id:'<P>'}];
    const result={key:'first-fit',name:'<First>',...simulateWorkload([{size:300},{size:500}],actions,firstFit,'fixed')};
    const html=comparisonLayoutsHtml([result]);
    assert.ok(html.includes('comparison-waste')); assert.ok(html.includes('width:33.33333333333333%'));
    assert.ok(html.includes('100 MB')); assert.ok(html.includes('&lt;P&gt;')); assert.ok(html.includes('&lt;First&gt;'));
    assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<P>'));
});
test('Deterministic mixed-action stress: memory and partition invariants after 4,000 actions', () => {
    let seed=12345; const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for (const mode of ['variable','fixed']) for (const algorithm of Object.keys(MemoryEngine.algorithms)) {
        const s=fresh([200,400,300,500],mode,algorithm);
        for (let i=0;i<500;i++) {
            const action=Math.floor(random()*5), p=s.processes[Math.floor(random()*s.processes.length)];
            if (action===0 || !p) MemoryEngine.create(s,'P'+i,'Process '+i,1+Math.floor(random()*700));
            else if(action===1) MemoryEngine.allocate(s,p.id);
            else if(action===2) MemoryEngine.terminate(s,p.id);
            else if(action===3) MemoryEngine.grow(s,p.id,1+Math.floor(random()*100));
            else MemoryEngine.compact(s);
            invariant(s);
            if(mode==='fixed') assert.deepEqual(s.memory.map(b=>b.size),[200,400,300,500]);
        }
    }
});
console.log('\\n' + passed + ' regression tests passed.');
`, context);
