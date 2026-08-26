/**
 * prefs.js
 *
 * Preferences window for PLGrid Queue extension using Libadwaita.
 * This integrates directly with the GNOME Extensions and Extension Manager apps.
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class PlgridQueuePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        // Main Page
        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-other-symbolic',
        });
        window.add(page);

        // SSH Hosts Group
        const hostsGroup = new Adw.PreferencesGroup({
            title: _('Cluster Configuration'),
            description: _('Configure PLGrid cluster host aliases matching your ~/.ssh/config.'),
        });
        page.add(hostsGroup);

        // Hosts Entry
        const currentHosts = settings.get_strv('hosts');
        const hostsEntryRow = new Adw.EntryRow({
            title: _('SSH Host Aliases'),
            text: currentHosts.join(', '),
            show_apply_button: true,
        });

        const saveHosts = () => {
            const raw = hostsEntryRow.get_text();
            const hostList = raw
                .split(',')
                .map((s) => s.trim())
                .filter((s) => s.length > 0);
            settings.set_strv('hosts', hostList.length > 0 ? hostList : ['athena', 'helios']);
        };

        hostsEntryRow.connect('apply', saveHosts);
        hostsEntryRow.connect('entry-activated', saveHosts);
        hostsGroup.add(hostsEntryRow);

        // Polling Group
        const pollingGroup = new Adw.PreferencesGroup({
            title: _('Polling and Connection'),
            description: _('Configure how often and how long SSH squeue commands run.'),
        });
        page.add(pollingGroup);

        // Refresh Interval SpinRow
        const refreshRow = new Adw.SpinRow({
            title: _('Refresh Interval (seconds)'),
            subtitle: _('Interval between squeue queries (default: 60s = 1 min)'),
            adjustment: new Gtk.Adjustment({
                lower: 30,
                upper: 3600,
                step_increment: 30,
                page_increment: 60,
                value: settings.get_int('refresh-interval'),
            }),
        });
        settings.bind('refresh-interval', refreshRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        pollingGroup.add(refreshRow);

        // Connect Timeout SpinRow
        const timeoutRow = new Adw.SpinRow({
            title: _('SSH Connection Timeout (seconds)'),
            subtitle: _('Timeout for each single SSH command attempt'),
            adjustment: new Gtk.Adjustment({
                lower: 2,
                upper: 30,
                step_increment: 1,
                page_increment: 5,
                value: settings.get_int('connect-timeout'),
            }),
        });
        settings.bind('connect-timeout', timeoutRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        pollingGroup.add(timeoutRow);

        // Appearance Group
        const appearanceGroup = new Adw.PreferencesGroup({
            title: _('Appearance'),
            description: _('Configure top bar display options.'),
        });
        page.add(appearanceGroup);

        // Show Icon Switch
        const showIconRow = new Adw.SwitchRow({
            title: _('Show Icon in Top Bar'),
            subtitle: _('Display the runner icon next to the queue counts'),
        });
        settings.bind('show-icon', showIconRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        appearanceGroup.add(showIconRow);

        // Panel Box combo
        const panelBoxModel = new Gtk.StringList();
        panelBoxModel.append(_('Left'));
        panelBoxModel.append(_('Center'));
        panelBoxModel.append(_('Right'));

        const panelBoxValues = ['left', 'center', 'right'];
        const currentBox = settings.get_string('panel-box');
        let selectedIdx = panelBoxValues.indexOf(currentBox);
        if (selectedIdx === -1) selectedIdx = 2; // Default 'right'

        const panelBoxRow = new Adw.ComboRow({
            title: _('Panel Position'),
            subtitle: _('Section of the top bar to place the indicator in'),
            model: panelBoxModel,
            selected: selectedIdx,
        });

        panelBoxRow.connect('notify::selected', () => {
            const val = panelBoxValues[panelBoxRow.selected] || 'right';
            settings.set_string('panel-box', val);
        });
        appearanceGroup.add(panelBoxRow);
    }
}
