import { App, Menu, Modal, Setting, WorkspaceLeaf } from "obsidian";
import type DailyNoteViewPlugin from "./dailyNoteViewIndex";

const VIEW_TYPE = "daily-note-editor-view";

export interface AutoResizeSettings {
    lockedWide: boolean;
    autoResize: boolean;
    hoverDelayMs: number;
    sidebarFullWidth: number;
    sidebarSmallWidth: number;
    paneFullGrow: number;
    paneSmallGrow: number;
}

export const AUTO_RESIZE_DEFAULTS: AutoResizeSettings = {
    lockedWide: false,
    autoResize: true,
    hoverDelayMs: 500,
    sidebarFullWidth: 980,
    sidebarSmallWidth: 400,
    paneFullGrow: 3,
    paneSmallGrow: 1,
};

/**
 * Resizes the area that shows Simple Daily Notes: the right sidebar, or the
 * pane next to another note. Hovering widens it after a delay, leaving shrinks
 * it back, and the lock keeps it wide.
 */
export class AutoResize {
    private plugin: DailyNoteViewPlugin;
    private managed = new Set<HTMLElement>();
    private hoverEl: HTMLElement | null = null;
    private wideEl: HTMLElement | null = null;
    private timer: number | null = null;

    constructor(plugin: DailyNoteViewPlugin) {
        this.plugin = plugin;
    }

    start() {
        const p = this.plugin;
        p.registerEvent(p.app.workspace.on("layout-change", () => this.refresh()));
        p.registerEvent(p.app.workspace.on("active-leaf-change", () => this.refresh()));
        p.registerDomEvent(document, "mouseover", (e: MouseEvent) => this.onOver(e.target as Element));
        p.registerDomEvent(document.documentElement, "mouseleave", () => this.onOver(null));
        this.applyVars();
        p.app.workspace.onLayoutReady(() => this.refresh());
    }

    stop() {
        this.clearTimer();
        this.setManaged(new Set());
        for (const v of [
            "--sdn-sidebar-full",
            "--sdn-sidebar-small",
            "--sdn-pane-full",
            "--sdn-pane-small",
        ]) {
            document.body.style.removeProperty(v);
        }
    }

    /** Push the width settings into CSS variables and re-evaluate the targets. */
    applyVars() {
        const s = this.plugin.settings;
        const st = document.body.style;
        st.setProperty("--sdn-sidebar-full", `${s.sidebarFullWidth}px`);
        st.setProperty("--sdn-sidebar-small", `${s.sidebarSmallWidth}px`);
        st.setProperty("--sdn-pane-full", String(s.paneFullGrow));
        st.setProperty("--sdn-pane-small", String(s.paneSmallGrow));
        this.refresh();
    }

    refresh() {
        const s = this.plugin.settings;
        const targets = new Set<HTMLElement>();
        if (s.autoResize || s.lockedWide) {
            const ws = this.plugin.app.workspace;
            for (const leaf of ws.getLeavesOfType(VIEW_TYPE)) {
                const el = this.targetFor(leaf);
                if (el) targets.add(el);
            }
        }
        this.setManaged(targets);
        if (this.hoverEl && !targets.has(this.hoverEl)) this.hoverEl = null;
        if (this.wideEl && !targets.has(this.wideEl)) this.wideEl = null;
        this.syncWide();
    }

    private targetFor(leaf: WorkspaceLeaf): HTMLElement | null {
        const ws = this.plugin.app.workspace as any;
        const view = leaf.view as any;
        if (!view?.containerEl?.isShown()) return null;
        const root = leaf.getRoot() as any;
        if (root === ws.rightSplit) {
            return ws.rightSplit.containerEl as HTMLElement;
        }
        if (root === ws.rootSplit) {
            const tabs = (leaf as any).parent?.containerEl as HTMLElement | undefined;
            const split = tabs?.parentElement;
            // Only a pane that sits next to another pane is resized
            if (tabs && split && split.querySelectorAll(":scope > .workspace-tabs").length > 1) {
                return tabs;
            }
        }
        return null;
    }

    private setManaged(next: Set<HTMLElement>) {
        for (const el of this.managed) {
            if (!next.has(el)) el.classList.remove("sdn-auto", "sdn-wide");
        }
        for (const el of next) el.classList.add("sdn-auto");
        this.managed = next;
    }

    private syncWide() {
        const locked = this.plugin.settings.lockedWide;
        for (const el of this.managed) {
            el.classList.toggle("sdn-wide", locked || el === this.wideEl);
        }
    }

    private clearTimer() {
        if (this.timer !== null) {
            window.clearTimeout(this.timer);
            this.timer = null;
        }
    }

    private onOver(target: Element | null) {
        const el = (target?.closest?.(".sdn-auto") as HTMLElement | null) ?? null;
        if (el === this.hoverEl) return;
        this.clearTimer();
        this.hoverEl = el;
        this.wideEl = null;
        this.syncWide();
        if (el && this.plugin.settings.autoResize) {
            this.timer = window.setTimeout(() => {
                this.timer = null;
                this.wideEl = el;
                this.syncWide();
            }, this.plugin.settings.hoverDelayMs);
        }
    }
}

export function showLockMenu(plugin: DailyNoteViewPlugin, e: MouseEvent) {
    const menu = new Menu();
    menu.addItem((item) => {
        item.setTitle("Auto-resize on hover");
        item.setChecked(plugin.settings.autoResize);
        item.onClick(() => {
            plugin.settings.autoResize = !plugin.settings.autoResize;
            plugin.afterResizeSettingsChanged();
        });
    });
    menu.addItem((item) => {
        item.setTitle("Full and small width settings...");
        item.setIcon("settings");
        item.onClick(() => new ResizeSettingsModal(plugin.app, plugin).open());
    });
    menu.showAtMouseEvent(e);
}

class ResizeSettingsModal extends Modal {
    plugin: DailyNoteViewPlugin;

    constructor(app: App, plugin: DailyNoteViewPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        const s = this.plugin.settings;
        contentEl.empty();
        contentEl.createEl("h2", { text: "Auto-resize widths" });

        const number = (
            name: string,
            desc: string,
            key: keyof AutoResizeSettings,
            min: number
        ) => {
            new Setting(contentEl)
                .setName(name)
                .setDesc(desc)
                .addText((t) => {
                    t.inputEl.type = "number";
                    t.setValue(String(s[key]));
                    t.onChange(async (v) => {
                        const n = Number(v);
                        if (!isFinite(n) || n < min) return;
                        (s[key] as number) = n;
                        await this.plugin.saveSettings();
                        this.plugin.afterResizeSettingsChanged(false);
                    });
                });
        };

        contentEl.createEl("h4", { text: "Right sidebar" });
        number("Full width", "Width in pixels when widened or locked.", "sidebarFullWidth", 200);
        number("Small width", "Width in pixels when not hovered.", "sidebarSmallWidth", 150);

        contentEl.createEl("h4", { text: "Note shown next to another note" });
        number("Full width", "Share of the space compared to the other pane (3 means three times as wide).", "paneFullGrow", 0.1);
        number("Small width", "Share of the space when not hovered.", "paneSmallGrow", 0.1);

        contentEl.createEl("h4", { text: "Hover" });
        number("Delay before widening", "In milliseconds. Shrinking back is immediate.", "hoverDelayMs", 0);
    }

    onClose() {
        this.contentEl.empty();
    }
}
