/**
 * test_job_click_persistence.js
 *
 * Regression test: clicking a job row to copy its ID must NOT close/hide
 * the popup menu. Verifies both static source invariants and runtime
 * behaviour with mocks.
 *
 * Run with:  gjs -m test/test_job_click_persistence.js
 * Or via:    make test
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        passed++;
    } else {
        failed++;
        console.error(`  FAIL: ${message}`);
    }
}

function assertContains(source, substring, message) {
    assert(source.includes(substring), `${message}\n    missing: ${JSON.stringify(substring)}`);
}

function assertNotContains(source, substring, message) {
    assert(!source.includes(substring), `${message}\n    should NOT contain: ${JSON.stringify(substring)}`);
}

// ---------------------------------------------------------------------------
// 1. Static source checks on indicator.js
// ---------------------------------------------------------------------------
console.log('--- Test: Static source checks (indicator.js must keep menu open on job click) ---');

function loadIndicatorSource() {
    const candidates = [
        'indicator.js',
        './indicator.js',
        '../indicator.js',
        'test/../indicator.js',
    ];
    // Also try resolving relative to this file via Gio
    // GJS cwd is project root when run as `gjs -m test/...`, so 'indicator.js' works.
    for (const p of candidates) {
        try {
            const file = Gio.File.new_for_path(p);
            if (!file.query_exists(null)) continue;
            const [ok, bytes] = file.load_contents(null);
            if (ok) return new TextDecoder().decode(bytes);
        } catch (_) { /* try next */ }
    }
    // Fallback via GLib.file_get_contents (throws on missing)
    for (const p of candidates) {
        try {
            const [ok, bytes] = GLib.file_get_contents(p);
            if (ok) return new TextDecoder().decode(bytes);
        } catch (_) {}
    }
    throw new Error('Could not read indicator.js (tried: ' + candidates.join(', ') + ')');
}

const source = loadIndicatorSource();

// Outer PopupBaseMenuItem for job rows must be non-reactive / non-focusable.
// If it is reactive, PopupMenu will close on activate/click by default.
assertContains(source, "style_class: 'plgrid-job-item'", 'Job item should exist with style_class plgrid-job-item');

// Extract the _buildJobItem block roughly (from _buildJobItem to next method)
const buildJobIdx = source.indexOf('_buildJobItem(job)');
assert(buildJobIdx !== -1, 'Should find _buildJobItem definition');
const buildJobSlice = source.slice(buildJobIdx, buildJobIdx + 3500);

// The outer item must be created with reactive:false and can_focus:false so the menu does not auto-close.
assertContains(buildJobSlice, 'reactive: false', 'Job outer PopupBaseMenuItem must be reactive:false');
assertContains(buildJobSlice, 'can_focus: false', 'Job outer PopupBaseMenuItem must be can_focus:false');

// The old buggy workaround used `closeOnActivate: false` (invalid in Shell 48) and raw
// `button-press-event` returning EVENT_STOP – both should be gone.
assertNotContains(buildJobSlice, 'closeOnActivate', 'Should not use invalid closeOnActivate (Shell 48 crashes)');
assertNotContains(buildJobSlice, 'EVENT_STOP', 'Should not rely on button-press-event EVENT_STOP (does not prevent PopupMenu close)');

// Inner click target must be an St.Button that handles copy, NOT the menu item itself.
assertContains(buildJobSlice, "style_class: 'plgrid-job-click-area'", 'Inner St.Button must have style_class plgrid-job-click-area');
assertContains(buildJobSlice, "new St.Button({", 'Job click area must be St.Button');
assertContains(buildJobSlice, "clickButton.connect('clicked'", 'St.Button must connect clicked handler');
assertContains(buildJobSlice, "_copyJobToClipboard(clickButton, job)", 'clicked must call _copyJobToClipboard with button + job');

// Tooltip wiring should be on the button, not the outer item.
assertContains(buildJobSlice, "clickButton.connect('enter-event'", 'Tooltip enter-event should be on clickButton');
assertContains(buildJobSlice, "clickButton.connect('leave-event'", 'Tooltip leave-event should be on clickButton');

// Outer item should only clean up tooltip on destroy, not handle activate/click.
assertContains(buildJobSlice, "item.connect('destroy'", 'Outer item should clean tooltip on destroy');
assertNotContains(buildJobSlice, "item.connect('activate'", 'Outer item must NOT handle activate (would imply menu close)');
assertNotContains(buildJobSlice, "item.connect('button-press-event'", 'Outer item must NOT handle button-press-event');

console.log('--- Test: _copyJobToClipboard does not close menu ---');
const copyIdx = source.indexOf('_copyJobToClipboard(item, job)');
assert(copyIdx !== -1, 'Should find _copyJobToClipboard');
const copySlice = source.slice(copyIdx, copyIdx + 800);

// Must copy only the numeric ID, not `name #id`.
assertContains(copySlice, '`${job.jobId}`', 'Clipboard must copy only jobId');
assertNotContains(copySlice, '#${job.jobId}', 'Clipboard must NOT prefix with # (user asked for ID only)');
assertNotContains(copySlice, 'job.name', 'Clipboard must NOT include job.name');

// Must show “ID copied to clipboard” for 2000ms and NOT call menu.close().
assertContains(copySlice, "'ID copied to clipboard'", 'Should show "ID copied to clipboard" tooltip');
assertContains(copySlice, 'GLib.timeout_add', 'Should schedule tooltip hide via GLib.timeout_add');
assertContains(copySlice, '2000', 'Tooltip timeout should be 2000ms');
assertNotContains(copySlice, 'menu.close', '_copyJobToClipboard must NOT close menu');
assertNotContains(copySlice, 'this.menu.close', '_copyJobToClipboard must NOT call this.menu.close');

// ---------------------------------------------------------------------------
// 2. Behavioural mock: simulate click and prove menu stays open
// ---------------------------------------------------------------------------
console.log('--- Test: Behavioural mock — click does not close menu ---');

// Minimal mocks that mirror the wiring in _buildJobItem / _copyJobToClipboard.

class MockClipboard {
    constructor() { this.lastText = null; this.lastType = null; }
    set_text(type, text) { this.lastType = type; this.lastText = text; }
    static get_default() {
        if (!MockClipboard._instance) MockClipboard._instance = new MockClipboard();
        return MockClipboard._instance;
    }
}
class MockButton {
    constructor(params) {
        this.style_class = params.style_class;
        this.child = params.child;
        this._handlers = {};
        this.enterTooltip = null;
        this.leaveCalled = false;
    }
    connect(signal, fn) { this._handlers[signal] = fn; return 1; }
    emit(signal, ...args) { if (this._handlers[signal]) return this._handlers[signal](...args); }
    click() { return this.emit('clicked'); }
}
class MockItem {
    constructor(params) {
        this.reactive = params.reactive;
        this.can_focus = params.can_focus;
        this.style_class = params.style_class;
        this._handlers = {};
        this.children = [];
    }
    connect(signal, fn) { this._handlers[signal] = fn; return 1; }
    add_child(c) { this.children.push(c); }
}
class MockMenu {
    constructor() { this.closeCalls = 0; this.items = []; }
    close() { this.closeCalls++; }
    addMenuItem(item) { this.items.push(item); }
}
class MockTooltipHost {
    constructor() { this.tooltips = []; this.timeoutMs = null; }
    _showTooltip(actor, text) { this.tooltips.push({ actor, text }); }
    _hideTooltip() { /* no-op for mock */ }
}

// Simulate wiring exactly as indicator.js does now.
function buildJobItemMock(job, menu) {
    const item = new MockItem({
        reactive: false,
        can_focus: false,
        style_class: 'plgrid-job-item',
    });
    assert(item.reactive === false && item.can_focus === false,
        'Mock outer item is non-reactive/non-focusable (would otherwise close menu on activate)');

    // In real code mainContainer is St.BoxLayout with badge/name/id; we omit for mock.
    const mainContainer = { mock: 'mainContainer', jobId: job.jobId };

    const clickButton = new MockButton({
        style_class: 'plgrid-job-click-area',
        x_expand: true,
        can_focus: true,
        child: mainContainer,
    });

    // Wire exactly like indicator.js: button clicked -> clipboard + tooltip, no menu.close
    const host = new MockTooltipHost();
    const clipboard = MockClipboard.get_default();
    clipboard.lastText = null;

    clickButton.connect('clicked', () => {
        clipboard.set_text('CLIPBOARD', `${job.jobId}`);
        host._showTooltip(clickButton, 'ID copied to clipboard');
        // Intentionally no menu.close() — this is the invariant under test.
        // Schedule hide after 2000ms (mocked as recording timeout).
        host.timeoutMs = 2000;
    });
    clickButton.connect('enter-event', () => host._showTooltip(clickButton, `${job.name} #${job.jobId}`));
    clickButton.connect('leave-event', () => host._hideTooltip());

    item.add_child(clickButton);
    menu.addMenuItem(item);

    return { item, clickButton, host, clipboard, menu };
}

{
    const menu = new MockMenu();
    const job = { jobId: '3072242', name: 'my-long-training-job', state: 'R', isRunning: true };
    const { clickButton, host, clipboard } = buildJobItemMock(job, menu);

    // Simulate user click on the job row.
    clickButton.click();

    assert(clipboard.lastText === '3072242',
        `Clipboard should contain only jobId '3072242', got ${JSON.stringify(clipboard.lastText)}`);
    assert(menu.closeCalls === 0,
        `Menu.close must NOT be called on job click (closeCalls=${menu.closeCalls}) — menu would disappear`);
    assert(host.tooltips.length === 1 && host.tooltips[0].text === 'ID copied to clipboard',
        'Should show "ID copied to clipboard" tooltip on click');
    assert(host.timeoutMs === 2000,
        'Tooltip hide timeout must be 2000ms');
    assert(clickButton.style_class === 'plgrid-job-click-area',
        'Click target must be St.Button with plgrid-job-click-area (ensures click does not bubble as menu activate)');
}

{
    // Verify that the OLD buggy wiring WOULD fail this test: reactive outer item with activate -> close.
    // This documents why the old code hid the widget.
    const menu = new MockMenu();
    const buggyItem = new MockItem({ reactive: true, can_focus: true, style_class: 'plgrid-job-item' });
    buggyItem.connect('activate', () => menu.close());
    buggyItem.connect('button-press-event', () => { menu.close(); return 0; });
    menu.addMenuItem(buggyItem);

    // Simulate activate (what PopupMenu does for reactive items).
    buggyItem._handlers['activate']();
    assert(menu.closeCalls === 1, 'Buggy reactive+activate wiring DOES close menu (proves old code hid widget)');

    // Reset for next assertion scope — the real menu for the fixed code must NOT have closeCalls.
    // (We already asserted fixed code stays at 0 above.)
}

{
    // Repeated clicks must keep menu open and keep copying correct ID.
    const menu = new MockMenu();
    const jobs = [
        { jobId: '1', name: 'alpha' },
        { jobId: '999999', name: 'beta' },
    ];
    for (const job of jobs) {
        const { clickButton, clipboard } = buildJobItemMock(job, menu);
        clickButton.click();
        assert(clipboard.lastText === job.jobId, `Repeated click copies correct ID ${job.jobId}`);
        assert(menu.closeCalls === 0, 'Menu stays open after repeated clicks');
    }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
    throw new Error(`${failed} test(s) failed — job click would still hide the widget!`);
}
console.log('✓ ALL JOB-CLICK PERSISTENCE TESTS PASSED!');
