import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import PlgridQueuePreferences from '../prefs.js';

// Test preferences instantiation
console.log('Testing Preferences class...');
const prefs = new PlgridQueuePreferences({
    metadata: {
        uuid: 'plgrid-queue@jpniewski',
        path: '.',
    },
    dir: Gio.File.new_for_path('.'),
});

console.log('✓ Preferences class instantiated successfully.');
