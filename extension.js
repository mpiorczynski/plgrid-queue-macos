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
        let initialIndex = this._settings.get_int('panel-index');
        if (panelBoxName === 'left' && initialIndex <= 0) {
            initialIndex = 1;
        }

        Main.panel.addToStatusArea(
            this.uuid,
            this._indicator,
            initialIndex,
            panelBoxName
        );

        // Ensure correct position relative to workspace switcher / activities
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

        const totalChildren = box.get_n_children();
        let targetIndex = this._settings.get_int('panel-index');

        if (panelBoxName === 'left') {
            // Keep workspace indicators / Activities on the far left.
            // Place indicator after them (at least index 1, or at the end of leftBox).
            targetIndex = targetIndex <= 0 ? totalChildren : Math.max(1, Math.min(targetIndex, totalChildren));
        } else {
            targetIndex = Math.min(targetIndex, totalChildren);
        }

        box.insert_child_at_index(container, targetIndex);
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
