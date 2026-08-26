/**
 * test_reposition.js
 *
 * Unit test for the _reposition() logic extracted from extension.js.
 * Verifies that:
 *  - For the 'left' panel box, the indicator is NEVER placed at index 0
 *    (which would put it to the left of the workspace/activities indicator).
 *  - For 'center' and 'right', normal index placement works.
 *
 * This test runs in plain Node.js / GJS without GNOME Shell dependencies.
 */

// --- Mock Box: simulates Clutter container children operations ---
class MockBox {
    constructor(name, initialChildren = []) {
        this.name = name;
        this._children = [...initialChildren];
    }

    get_n_children() {
        return this._children.length;
    }

    remove_child(child) {
        const idx = this._children.indexOf(child);
        if (idx >= 0) this._children.splice(idx, 1);
    }

    insert_child_at_index(child, index) {
        this._children.splice(index, 0, child);
    }

    add_child(child) {
        this._children.push(child);
    }

    getChildren() {
        return [...this._children];
    }
}

// --- Extracted _reposition logic (mirrors extension.js) ---
function reposition(container, boxes, panelBoxName, requestedIndex) {
    const box = boxes[panelBoxName] ?? boxes['right'];
    const parent = container._parent;

    if (parent) {
        parent.remove_child(container);
        container._parent = null;
    }

    const count = box.get_n_children();

    if (panelBoxName === 'left') {
        // Always place after the workspace/activities indicator (index 0).
        // Math.max(1, ...) ensures we never insert at index 0.
        const targetIndex = Math.max(1, Math.min(requestedIndex || count, count));
        box.insert_child_at_index(container, targetIndex);
    } else {
        const targetIndex = Math.min(requestedIndex, count);
        box.insert_child_at_index(container, targetIndex);
    }

    container._parent = box;
}

// --- Test helpers ---
let passed = 0;
let failed = 0;

function assertEqual(actual, expected, message) {
    const toIds = arr => Array.isArray(arr) ? arr.map(x => x.id) : arr;
    const a = JSON.stringify(toIds(actual));
    const e = JSON.stringify(toIds(expected));
    if (a === e) {
        passed++;
    } else {
        failed++;
        console.error(`  FAIL: ${message}`);
        console.error(`    Expected: ${e}`);
        console.error(`    Actual:   ${a}`);
    }
}

// --- Tests ---

console.log('--- Test: Left box - default index 0 should place AFTER workspace indicator ---');
{
    const workspaceInd = { id: 'workspace-indicator' };
    const ourInd = { id: 'plgrid-indicator', _parent: null };
    const leftBox = new MockBox('left', [workspaceInd]);
    const boxes = { left: leftBox, center: new MockBox('center'), right: new MockBox('right') };

    reposition(ourInd, boxes, 'left', 0);

    assertEqual(leftBox.getChildren(), [workspaceInd, ourInd],
        'Indicator should be after workspace indicator when requestedIndex=0');
}

console.log('--- Test: Left box - requestedIndex=1 should place at index 1 ---');
{
    const workspaceInd = { id: 'workspace-indicator' };
    const ourInd = { id: 'plgrid-indicator', _parent: null };
    const leftBox = new MockBox('left', [workspaceInd]);
    const boxes = { left: leftBox, center: new MockBox('center'), right: new MockBox('right') };

    reposition(ourInd, boxes, 'left', 1);

    assertEqual(leftBox.getChildren(), [workspaceInd, ourInd],
        'Indicator should be after workspace indicator when requestedIndex=1');
}

console.log('--- Test: Left box - empty box should still clamp to index 1 ---');
{
    const ourInd = { id: 'plgrid-indicator', _parent: null };
    const leftBox = new MockBox('left', []);
    const boxes = { left: leftBox, center: new MockBox('center'), right: new MockBox('right') };

    // Even when the box is empty (edge case during early startup before workspace
    // indicator is added), Math.max(1, ...) clamps to 1, but Math.min with count=0
    // results in 0, and Math.max(1, 0) = 1, so insert_child_at_index(container, 1)
    // is called. Clutter allows inserting at index > count, it just appends.
    // But to be safe, let's verify the index calculation:
    // count=0, requestedIndex=0, requestedIndex || count = 0 || 0 = 0,
    // Math.min(0, 0) = 0, Math.max(1, 0) = 1
    // insert_child_at_index(container, 1) on empty box → appended
    reposition(ourInd, boxes, 'left', 0);

    assertEqual(leftBox.getChildren(), [ourInd],
        'Indicator should be appended even when box is empty');
}

console.log('--- Test: Left box - multiple existing children, index 0 goes to end ---');
{
    const workspaceInd = { id: 'workspace-indicator' };
    const otherExt = { id: 'other-extension' };
    const ourInd = { id: 'plgrid-indicator', _parent: null };
    const leftBox = new MockBox('left', [workspaceInd, otherExt]);
    const boxes = { left: leftBox, center: new MockBox('center'), right: new MockBox('right') };

    reposition(ourInd, boxes, 'left', 0);

    assertEqual(leftBox.getChildren(), [workspaceInd, otherExt, ourInd],
        'With requestedIndex=0 and multiple children, indicator goes to end');
}

console.log('--- Test: Left box - requestedIndex=2 with 3 existing children ---');
{
    const workspaceInd = { id: 'workspace-indicator' };
    const ext1 = { id: 'ext1' };
    const ext2 = { id: 'ext2' };
    const ourInd = { id: 'plgrid-indicator', _parent: null };
    const leftBox = new MockBox('left', [workspaceInd, ext1, ext2]);
    const boxes = { left: leftBox, center: new MockBox('center'), right: new MockBox('right') };

    reposition(ourInd, boxes, 'left', 2);

    assertEqual(leftBox.getChildren(), [workspaceInd, ext1, ourInd, ext2],
        'With requestedIndex=2, indicator inserted at position 2');
}

console.log('--- Test: Left box - re-reposition from right to left ---');
{
    const workspaceInd = { id: 'workspace-indicator' };
    const ourInd = { id: 'plgrid-indicator', _parent: null };
    const leftBox = new MockBox('left', [workspaceInd]);
    const rightBox = new MockBox('right', [ourInd]);
    ourInd._parent = rightBox;
    const boxes = { left: leftBox, center: new MockBox('center'), right: rightBox };

    reposition(ourInd, boxes, 'left', 0);

    assertEqual(leftBox.getChildren(), [workspaceInd, ourInd],
        'Moving from right to left should place after workspace indicator');
    assertEqual(rightBox.getChildren(), [],
        'Indicator should be removed from right box');
}

console.log('--- Test: Right box - requestedIndex=0 places at start ---');
{
    const sysMenu = { id: 'system-menu' };
    const ourInd = { id: 'plgrid-indicator', _parent: null };
    const rightBox = new MockBox('right', [sysMenu]);
    const boxes = { left: new MockBox('left'), center: new MockBox('center'), right: rightBox };

    reposition(ourInd, boxes, 'right', 0);

    assertEqual(rightBox.getChildren(), [ourInd, sysMenu],
        'Right box requestedIndex=0 places at start');
}

console.log('--- Test: Center box - requestedIndex=0 places at start ---');
{
    const clock = { id: 'clock' };
    const ourInd = { id: 'plgrid-indicator', _parent: null };
    const centerBox = new MockBox('center', [clock]);
    const boxes = { left: new MockBox('left'), center: centerBox, right: new MockBox('right') };

    reposition(ourInd, boxes, 'center', 0);

    assertEqual(centerBox.getChildren(), [ourInd, clock],
        'Center box requestedIndex=0 places at start');
}

// --- Summary ---
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
    throw new Error(`${failed} test(s) failed!`);
}
console.log('✓ ALL REPOSITION TESTS PASSED!');
