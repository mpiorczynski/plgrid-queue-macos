/**
 * indicator.js
 *
 * Top bar button and popup menu for PLGrid Slurm queue.
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import { SlurmService } from './slurmService.js';

const SPIN_DURATION_MS = 1000;

export const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init(settings, openPreferences) {
        super._init(0.0, _('PLGrid Queue'), false);

        this._settings = settings;
        this._openPreferences = openPreferences;
        this._slurmService = new SlurmService();
        this._timeoutId = null;
        this._isRefreshing = false;
        this._lastData = null;

        // Top bar layout
        this._box = new St.BoxLayout({
            style_class: 'plgrid-panel-box',
            track_hover: true,
        });

        this._icon = new St.Icon({
            icon_name: 'system-run-symbolic',
            style_class: 'plgrid-panel-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._label = new St.Label({
            text: 'R: -; Q: -',
            style_class: 'plgrid-panel-label',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._box.add_child(this._icon);
        this._box.add_child(this._label);
        this.add_child(this._box);

        this._applyIconVisibility();

        // Connect settings signals
        this._settingsSignals = [
            this._settings.connect('changed::show-icon', () => this._applyIconVisibility()),
            this._settings.connect('changed::refresh-interval', () => this._restartTimer()),
            this._settings.connect('changed::hosts', () => this.refresh()),
            this._settings.connect('changed::connect-timeout', () => this.refresh()),
        ];

        // Initial menu structure
        this._buildMenu();

        // Start polling
        this.refresh();
        this._restartTimer();
    }

    _applyIconVisibility() {
        const showIcon = this._settings.get_boolean('show-icon');
        this._icon.visible = showIcon;
    }

    _restartTimer() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }

        const interval = Math.max(10, this._settings.get_int('refresh-interval'));
        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, () => {
            this.refresh();
            return GLib.SOURCE_CONTINUE;
        });
    }

    async refresh() {
        if (this._isRefreshing) return;
        this._isRefreshing = true;
        this._setSpinning(true);

        try {
            const hosts = this._settings.get_strv('hosts');
            const timeout = this._settings.get_int('connect-timeout');

            const activeHosts = hosts.length > 0 ? hosts : ['athena', 'helios'];
            const data = await this._slurmService.queryAll(activeHosts, timeout);
            this._lastData = data;
            this._updateUI(data);
        } catch (e) {
            console.error(`[PLGrid Queue] Refresh error: ${e.message}`);
        } finally {
            this._isRefreshing = false;
            this._setSpinning(false);
        }
    }

    _setSpinning(spinning) {
        if (!this._refreshIcon) return;
        this._refreshIcon.remove_all_transitions();
        if (this._refreshButton) {
            this._refreshButton.reactive = !spinning;
        }
        if (!spinning) {
            this._refreshIcon.rotation_angle_z = 0;
            return;
        }
        this._refreshIcon.set_pivot_point(0.5, 0.5);
        this._refreshIcon.ease({
            rotation_angle_z: 360,
            duration: SPIN_DURATION_MS,
            mode: Clutter.AnimationMode.LINEAR,
            repeatCount: -1,
        });
    }

    _updateUI(data) {
        // Update top bar text: "R: {running}; Q: {queued}"
        if (data.hasErrors && data.runningTotal === 0 && data.queuedTotal === 0 && data.hosts.every(h => !h.ok)) {
            this._label.set_text('R: ?; Q: ?');
        } else {
            this._label.set_text(`R: ${data.runningTotal}; Q: ${data.queuedTotal}`);
        }

        // Rebuild popup menu contents
        this._rebuildMenuContents(data);
    }

    _formatTime(date) {
        if (!date) return '';
        const pad = (n) => (n < 10 ? '0' + n : n);
        return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }

    _buildMenu() {
        this.menu.removeAll();

        // Header Section
        this._headerSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._headerSection);

        // Content Section (Jobs list)
        this._contentSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._contentSection);

        // Bottom Actions Section
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const actionsItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'plgrid-actions-row',
        });

        const actionsBox = new St.BoxLayout({
            x_expand: true,
            vertical: false,
            y_align: Clutter.ActorAlign.CENTER,
        });

        const statusLabel = new St.Label({
            text: _('Slurm Monitor'),
            style_class: 'plgrid-actions-status',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        actionsBox.add_child(statusLabel);

        const buttonsBox = new St.BoxLayout({
            vertical: false,
            style_class: 'plgrid-actions-buttons',
        });

        this._refreshIcon = new St.Icon({
            icon_name: 'view-refresh-symbolic',
            style_class: 'popup-menu-icon',
        });
        this._refreshIcon.set_pivot_point(0.5, 0.5);

        this._refreshButton = new St.Button({
            child: this._refreshIcon,
            style_class: 'button plgrid-action-btn',
            can_focus: true,
            accessible_name: _('Refresh now'),
        });
        this._refreshButton.connect('clicked', () => {
            this.refresh();
        });
        buttonsBox.add_child(this._refreshButton);

        if (this._openPreferences) {
            const settingsIcon = new St.Icon({
                icon_name: 'emblem-system-symbolic',
                style_class: 'popup-menu-icon',
            });
            const settingsButton = new St.Button({
                child: settingsIcon,
                style_class: 'button plgrid-action-btn',
                can_focus: true,
                accessible_name: _('Settings'),
            });
            settingsButton.connect('clicked', () => {
                this.menu.close();
                this._openPreferences();
            });
            buttonsBox.add_child(settingsButton);
        }

        actionsBox.add_child(buttonsBox);
        actionsItem.add_child(actionsBox);
        this.menu.addMenuItem(actionsItem);

        if (this._lastData) {
            this._rebuildMenuContents(this._lastData);
        } else {
            const loadingItem = new PopupMenu.PopupMenuItem(_('Fetching queue data...'), {
                reactive: false,
                can_focus: false,
            });
            this._contentSection.addMenuItem(loadingItem);
        }
    }

    _rebuildMenuContents(data) {
        this._headerSection.removeAll();
        this._contentSection.removeAll();

        // Header Item
        const headerItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'plgrid-menu-header',
        });
        const headerBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
        });

        const titleLabel = new St.Label({
            text: _('PLGrid Slurm Queue'),
            style_class: 'plgrid-menu-title',
        });

        const timeStr = this._formatTime(data.timestamp);
        const hostNames = data.hosts.map(h => h.host).join(', ');
        const subtitleLabel = new St.Label({
            text: `${hostNames} • Updated at ${timeStr}`,
            style_class: 'plgrid-menu-subtitle',
        });

        headerBox.add_child(titleLabel);
        headerBox.add_child(subtitleLabel);
        headerItem.add_child(headerBox);
        this._headerSection.addMenuItem(headerItem);
        this._headerSection.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // For each host, create a section
        for (const hostResult of data.hosts) {
            this._buildHostSection(hostResult);
        }
    }

    _buildHostSection(hostResult) {
        const hostHeader = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'plgrid-host-header-item',
        });

        const hostBox = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        const hostIcon = new St.Icon({
            icon_name: hostResult.ok ? 'computer-symbolic' : 'dialog-warning-symbolic',
            icon_size: 14,
            style_class: 'plgrid-panel-icon',
        });

        const hostCapitalized = hostResult.host.charAt(0).toUpperCase() + hostResult.host.slice(1);
        const hostTitle = new St.Label({
            text: hostCapitalized,
            style_class: 'plgrid-host-title',
            y_align: Clutter.ActorAlign.CENTER,
        });

        let statusText = '';
        if (hostResult.ok) {
            statusText = `(${hostResult.runningCount} R, ${hostResult.queuedCount} Q)`;
        } else {
            statusText = _('(Connection Error)');
        }

        const countsLabel = new St.Label({
            text: statusText,
            style_class: 'plgrid-host-counts',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        hostBox.add_child(hostIcon);
        hostBox.add_child(hostTitle);
        hostBox.add_child(countsLabel);
        hostHeader.add_child(hostBox);
        this._contentSection.addMenuItem(hostHeader);

        // Host content: Error, Empty, or Job rows
        if (!hostResult.ok) {
            const errorItem = new PopupMenu.PopupBaseMenuItem({
                reactive: false,
                can_focus: false,
            });
            const errorBox = new St.BoxLayout({
                style_class: 'plgrid-error-box',
                vertical: false,
            });
            const errorLabel = new St.Label({
                text: hostResult.error || _('Could not connect to host via SSH.'),
                style_class: 'plgrid-error-label',
            });
            errorBox.add_child(errorLabel);
            errorItem.add_child(errorBox);
            this._contentSection.addMenuItem(errorItem);
        } else if (hostResult.jobs.length === 0) {
            const emptyItem = new PopupMenu.PopupBaseMenuItem({
                reactive: false,
                can_focus: false,
            });
            const emptyLabel = new St.Label({
                text: _('No active jobs'),
                style_class: 'plgrid-empty-label',
            });
            emptyItem.add_child(emptyLabel);
            this._contentSection.addMenuItem(emptyItem);
        } else {
            for (const job of hostResult.jobs) {
                this._buildJobItem(job);
            }
        }
    }

    _buildJobItem(job) {
        const item = new PopupMenu.PopupBaseMenuItem({
            reactive: true,
            can_focus: true,
            style_class: 'plgrid-job-item',
        });

        const mainContainer = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style_class: 'plgrid-job-box',
        });

        // Top line: [STATE] JobName (JobID)
        const topRow = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            style_class: 'plgrid-job-main-row',
        });

        let badgeClass = 'plgrid-badge plgrid-badge-other';
        if (job.isRunning) {
            badgeClass = 'plgrid-badge plgrid-badge-running';
        } else if (job.isQueued) {
            badgeClass = 'plgrid-badge plgrid-badge-queued';
        }

        const badge = new St.Label({
            text: `[${job.state}]`,
            style_class: badgeClass,
            y_align: Clutter.ActorAlign.CENTER,
        });

        const nameLabel = new St.Label({
            text: job.name,
            style_class: 'plgrid-job-name',
            y_align: Clutter.ActorAlign.CENTER,
        });

        const idLabel = new St.Label({
            text: `#${job.jobId}`,
            style_class: 'plgrid-job-id',
            y_align: Clutter.ActorAlign.CENTER,
        });

        topRow.add_child(badge);
        topRow.add_child(nameLabel);
        topRow.add_child(idLabel);

        // Sub line: Partition • Time • Reason / Nodes
        const subRow = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            style_class: 'plgrid-job-sub-row',
        });

        const partitionLabel = new St.Label({
            text: job.partition,
            style_class: 'plgrid-job-detail-chip',
            y_align: Clutter.ActorAlign.CENTER,
        });

        const timeLabel = new St.Label({
            text: `⏱ ${job.time}`,
            style_class: 'plgrid-job-detail-chip',
            y_align: Clutter.ActorAlign.CENTER,
        });

        subRow.add_child(partitionLabel);
        subRow.add_child(timeLabel);

        if (job.reasonOrNode) {
            const extraLabel = new St.Label({
                text: job.isRunning ? `📍 ${job.reasonOrNode}` : `⏳ ${job.reasonOrNode}`,
                style_class: 'plgrid-job-detail-chip',
                y_align: Clutter.ActorAlign.CENTER,
            });
            subRow.add_child(extraLabel);
        }

        mainContainer.add_child(topRow);
        mainContainer.add_child(subRow);
        item.add_child(mainContainer);

        this._contentSection.addMenuItem(item);
    }

    destroy() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }

        if (this._settingsSignals) {
            for (const id of this._settingsSignals) {
                this._settings.disconnect(id);
            }
            this._settingsSignals = [];
        }

        if (this._slurmService) {
            this._slurmService.cancelInFlight();
            this._slurmService = null;
        }

        if (this._refreshIcon) {
            this._refreshIcon.remove_all_transitions();
        }

        super.destroy();
    }
});
