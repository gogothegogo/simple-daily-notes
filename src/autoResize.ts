import { App, Menu, Modal, Setting, WorkspaceLeaf } from "obsidian";
import type DailyNoteViewPlugin from "./dailyNoteViewIndex";

const VIEW_TYPE = "daily-note-editor-view";

export interface AutoResizeSettings {
    lockedWide: boolean;
    autoResize: boolean;
    hoverDelayMs: number;
    /** Widths as a percentage of the Obsidian window width */
    fullWidthPct: number;
    smallWidthPct: number;
}

export const AUTO_RESIZE_DEFAULTS: AutoResizeSettings = {
    lockedWide: false,
    autoResize: true,
    hoverDelayMs: 500,
    fullWidthPct: 50,
    smallWidthPct: 21,
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
        for (const v of ["--sdn-full", "--sdn-small"]) {
            document.body.style.removeProperty(v);
        }
    }

    /** Push the width settings into CSS variables and re-evaluate the targets. */
    applyVars() {
        const s = this.plugin.settings;
        const st = document.body.style;
        st.setProperty("--sdn-full", String(s.fullWidthPct));
        st.setProperty("--sdn-small", String(s.smallWidthPct));
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
        contentEl.addClass("sdn-resize-modal");
        contentEl.createEl("h2", { text: "Auto-resize widths" });
        contentEl.createEl("p", {
            cls: "setting-item-description",
            text: "Drag the two edges to set how wide Simple Daily Notes gets. The same widths are used for the right sidebar and for a note shown next to another note.",
        });

        const mock = contentEl.createDiv({ cls: "sdn-mock" });
        mock.createDiv({ cls: "sdn-mock-other", text: "Other notes" });
        const fullBar = mock.createDiv({ cls: "sdn-mock-bar sdn-mock-full" });
        const smallBar = mock.createDiv({ cls: "sdn-mock-bar sdn-mock-small" });
        const fullLabel = fullBar.createDiv({ cls: "sdn-mock-label" });
        const smallLabel = smallBar.createDiv({ cls: "sdn-mock-label" });
        fullBar.createDiv({ cls: "sdn-mock-handle" });
        smallBar.createDiv({ cls: "sdn-mock-handle" });

        const MIN = 10;
        const MAX = 90;
        const GAP = 5;
        const draw = () => {
            fullBar.style.width = `${s.fullWidthPct}%`;
            smallBar.style.width = `${s.smallWidthPct}%`;
            fullLabel.setText(`Full ${s.fullWidthPct}%`);
            smallLabel.setText(`Small ${s.smallWidthPct}%`);
        };
        draw();

        const drag = (bar: HTMLElement, key: "fullWidthPct" | "smallWidthPct") => {
            const handle = bar.querySelector(".sdn-mock-handle") as HTMLElement;
            handle.addEventListener("pointerdown", (down) => {
                down.preventDefault();
                handle.setPointerCapture(down.pointerId);
                const rect = mock.getBoundingClientRect();
                const move = (e: PointerEvent) => {
                    let pct = Math.round(((rect.right - e.clientX) / rect.width) * 100);
                    pct =
                        key === "fullWidthPct"
                            ? Math.min(MAX, Math.max(s.smallWidthPct + GAP, pct))
                            : Math.min(s.fullWidthPct - GAP, Math.max(MIN, pct));
                    s[key] = pct;
                    draw();
                    this.plugin.autoResize.applyVars();
                };
                const up = async () => {
                    handle.removeEventListener("pointermove", move);
                    handle.removeEventListener("pointerup", up);
                    await this.plugin.saveSettings();
                };
                handle.addEventListener("pointermove", move);
                handle.addEventListener("pointerup", up);
            });
        };
        drag(fullBar, "fullWidthPct");
        drag(smallBar, "smallWidthPct");

        new Setting(contentEl)
            .setName("Delay before widening")
            .setDesc("Shrinking back is immediate.")
            .addSlider((sl) =>
                sl
                    .setLimits(0, 3000, 100)
                    .setValue(s.hoverDelayMs)
                    .setDynamicTooltip()
                    .onChange(async (v) => {
                        s.hoverDelayMs = v;
                        await this.plugin.saveSettings();
                    })
            );
    }

    onClose() {
        this.contentEl.empty();
    }
}
