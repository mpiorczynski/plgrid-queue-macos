/**
 * extension.js
 *
 * GNOME Shell extension entry point for PLGrid Queue monitor.
 */

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { Indicator } from './indicator.js';

export default class PlgridQueueExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._indicator = new Indicator(this._settings, () => this.openPreferences());

        const panelBoxName = this._settings.get_string('panel-box');
        const boxes = {
            left: Main.panel._leftBox,
            center: Main.panel._centerBox,
            right: Main.panel._rightBox,
        };
        const targetBox = boxes[panelBoxName] ?? Main.panel._rightBox;
        const initialCount = targetBox.get_n_children();

        Main.panel.addToStatusArea(
            this.uuid,
            this._indicator,
            initialCount,
            panelBoxName
        );

        this._reposition();

        this._placementChangedId = this._settings.connect(
            'changed::panel-box',
            () => this._reposition()
        );
        this._placementIndexChangedId = this._settings.connect(
            'changed::panel-index',
            () => this._reposition()
        );
    }

    _reposition() {
        if (!this._indicator) return;

        const panelBoxName = this._settings.get_string('panel-box');
        const boxes = {
            left: Main.panel._leftBox,
            center: Main.panel._centerBox,
            right: Main.panel._rightBox,
        };

        const box = boxes[panelBoxName] ?? Main.panel._rightBox;
        const container = this._indicator.container;
        const parent = container.get_parent();
        if (parent) {
            parent.remove_child(container);
        }

        const count = box.get_n_children();
        const requestedIndex = this._settings.get_int('panel-index');

        if (panelBoxName === 'left') {
            // For left box, always place after existing widgets (workspace indicator / Activities)
            const targetIndex = requestedIndex <= 0 ? count : Math.max(1, Math.min(requestedIndex, count));
            box.insert_child_at_index(container, targetIndex);
        } else {
            const targetIndex = Math.min(requestedIndex, count);
            box.insert_child_at_index(container, targetIndex);
        }
    }

    disable() {
        if (this._placementChangedId) {
            this._settings.disconnect(this._placementChangedId);
            this._placementChangedId = null;
        }

        if (this._placementIndexChangedId) {
            this._settings.disconnect(this._placementIndexChangedId);
            this._placementIndexChangedId = null;
        }

        this._indicator?.destroy();
        this._indicator = null;
        this._settings = null;
    }
}
