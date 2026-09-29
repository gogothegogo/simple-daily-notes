<script lang="ts">
    import type DailyNoteViewPlugin from "../dailyNoteViewIndex";
    import type { WorkspaceLeaf } from "obsidian";

    import { TFile, moment, setIcon } from "obsidian";
    import { getDateFromFile } from "obsidian-daily-notes-interface";
    import DailyNote from "./DailyNote.svelte";
    import { TimeRange, SelectionMode, TimeField, LayoutMode } from "../types/time";
    import { onMount } from "svelte";
    import { FileManager, FileManagerOptions } from "../utils/fileManager";


    export let plugin: DailyNoteViewPlugin;
    export let leaf: WorkspaceLeaf;
    export let selectedRange: TimeRange = "all";
    export let customRange: { start: Date; end: Date } | null = null;
    export let selectionMode: SelectionMode = "daily";
    export let target: string = "";
    export let timeField: TimeField = "mtime";
    export let footerNotePath: string = "";
    export let layoutMode: LayoutMode = "list";

    let filteredFiles: TFile[] = [];
    let fileManager: FileManager;

    // Single note view: which note is shown, tracked by path so it survives
    // list refreshes. null means "pick the default" (today, or the first note).
    let currentPath: string | null = null;
    let lastIndex = -1;

    $: currentIndex = pickIndex(filteredFiles, currentPath);
    $: currentFile = currentIndex >= 0 ? filteredFiles[currentIndex] : null;
    $: lastIndex = currentIndex;

    function defaultIndex(files: TFile[]): number {
        if (files.length === 0) return -1;
        if (selectionMode !== "daily") return 0;

        // Today's note, otherwise the note closest to today.
        const today = moment().startOf("day");
        let best = 0;
        let bestDiff = Infinity;
        files.forEach((f, i) => {
            const date = getDateFromFile(f as any, "day");
            if (!date) return;
            const diff = Math.abs(date.diff(today, "days"));
            if (diff < bestDiff) {
                bestDiff = diff;
                best = i;
            }
        });
        return best;
    }

    function pickIndex(files: TFile[], path: string | null): number {
        if (files.length === 0) return -1;
        const found = path ? files.findIndex((f) => f.path === path) : -1;
        if (found >= 0) return found;
        // The shown note disappeared (deleted, renamed): stay near where we were.
        if (path && lastIndex >= 0) return Math.min(lastIndex, files.length - 1);
        return defaultIndex(files);
    }

    export function navigate(step: number): boolean {
        // Recompute rather than read currentIndex: it updates only after a tick,
        // so rapid repeated calls would all start from the same stale index.
        const index = pickIndex(filteredFiles, currentPath);
        if (layoutMode !== "single" || index < 0) return false;
        const next = index + step;
        if (next < 0 || next >= filteredFiles.length) return false;
        currentPath = filteredFiles[next].path;
        return true;
    }

    function goToDefault() {
        const i = defaultIndex(filteredFiles);
        currentPath = i >= 0 ? filteredFiles[i].path : null;
    }

    function icon(node: HTMLElement, name: string) {
        setIcon(node, name);
        return {
            update(newName: string) {
                node.empty();
                setIcon(node, newName);
            },
        };
    }

    function resolveFooterFile(path: string): TFile | null {
        const trimmed = (path || "").trim();
        if (!trimmed) return null;
        const direct = plugin.app.vault.getAbstractFileByPath(trimmed);
        if (direct instanceof TFile) return direct;
        const withMd = plugin.app.vault.getAbstractFileByPath(trimmed + ".md");
        if (withMd instanceof TFile) return withMd;
        return null;
    }

    $: footerFile = resolveFooterFile(footerNotePath);

    $: fileManagerOptions = {
        mode: selectionMode,
        target: target,
        timeRange: selectedRange,
        customRange: customRange,
        app: plugin.app,
        timeField: timeField
    } as FileManagerOptions;

    $: if (fileManager && (selectedRange !== fileManager.options.timeRange ||
                          customRange !== fileManager.options.customRange ||
                          selectionMode !== fileManager.options.mode ||
                          target !== fileManager.options.target ||
                          timeField !== fileManager.options.timeField)) {
        fileManager.updateOptions({
            timeRange: selectedRange,
            customRange: customRange,
            mode: selectionMode,
            target: target,
            timeField: timeField
        });
        filteredFiles = fileManager.getFilteredFiles();
        // Scope changed: start again from today / the first note.
        currentPath = null;
        lastIndex = -1;
        updateTitleElement();
    }

    onMount(() => {
        fileManager = new FileManager(fileManagerOptions);
        filteredFiles = fileManager.getFilteredFiles();
        updateTitleElement();
    });

    function updateTitleElement() {
        if (!leaf || !leaf.view || !leaf.view.titleEl) return;

        const titleEl = leaf.view.titleEl;
        titleEl.empty();

        let titleText = '';

        if (selectionMode === "daily" && selectedRange !== 'all') {
            if (selectedRange === 'custom' && customRange) {
                titleText = `Showing notes from: ${moment(customRange.start).format('YYYY-MM-DD')} to ${moment(customRange.end).format('YYYY-MM-DD')}`;
            } else {
                titleText = `Showing notes for: ${selectedRange}`;
            }
        } else if (selectionMode === "folder") {
            titleText = `Showing files from folder: ${target}`;
            if (selectedRange !== 'all') {
                titleText += ` (${timeField === 'ctime' ? 'created' : 'modified'} ${selectedRange})`;
            }
        } else if (selectionMode === "tag") {
            titleText = `Showing files with tag: ${target}`;
            if (selectedRange !== 'all') {
                titleText += ` (${timeField === 'ctime' ? 'created' : 'modified'} ${selectedRange})`;
            }
        }

        if (titleText) {
            titleEl.setText(titleText);
        } else {
            titleEl.setText("Daily Notes");
        }
    }

    async function createNewDailyNote() {
        const newNote = await fileManager.createNewDailyNote();
        if (newNote) {
            filteredFiles = [newNote, ...filteredFiles];
            currentPath = newNote.path;
        }
    }

    export function tick() {
        check();
        filteredFiles = filteredFiles;
    }

    export function check() {
        const hadDailyNote = fileManager.hasCurrentDayNote();
        fileManager.checkDailyNote();
        const hasDailyNote = fileManager.hasCurrentDayNote();

        if (hadDailyNote !== hasDailyNote ||
            (selectionMode === "daily" && selectedRange !== "all")) {
            filteredFiles = fileManager.getFilteredFiles();
        }
    }

    export function fileCreate(file: TFile) {
        fileManager.fileCreate(file);
        if (selectionMode === "daily") {
            const updated = fileManager.getFilteredFiles();
            if (updated.some(f => f.basename === file.basename) &&
                !filteredFiles.some(f => f.basename === file.basename)) {
                filteredFiles = [file, ...filteredFiles];
            }
        } else {
            filteredFiles = fileManager.getFilteredFiles();
        }
    }

    export function fileDelete(file: TFile) {
        fileManager.fileDelete(file);
        filteredFiles = filteredFiles.filter((dailyNote) => {
            return dailyNote.basename !== file.basename;
        });
    }
</script>

<div class="daily-note-view">
    {#if filteredFiles.length === 0}
        <div class="dn-stock">
            <div class="dn-stock-text">
                No files found
            </div>
        </div>
    {/if}
    {#if selectionMode === "daily" && !fileManager?.hasCurrentDayNote() && (selectedRange === 'all' || selectedRange === 'week' || selectedRange === 'month' || selectedRange === 'year' || selectedRange === 'quarter')}
        <div class="dn-blank-day" on:click={createNewDailyNote} aria-hidden="true">
            <div class="dn-blank-day-text">
                Create a daily note for today ✍
            </div>
        </div>
    {/if}
    {#if layoutMode === "single"}
        {#if currentFile}
            <div class="dn-single-nav">
                <button
                    class="clickable-icon dn-nav-btn"
                    aria-label="Previous note"
                    disabled={currentIndex <= 0}
                    on:click={() => navigate(-1)}
                    use:icon={"chevron-left"}
                ></button>
                <div class="dn-nav-center">
                    <span class="dn-nav-title">{currentFile.basename}</span>
                    <span class="dn-nav-count">{currentIndex + 1} / {filteredFiles.length}</span>
                </div>
                {#if selectionMode === "daily"}
                    <button class="dn-nav-today" aria-label="Go to today's note" on:click={goToDefault}>Today</button>
                {/if}
                <button
                    class="clickable-icon dn-nav-btn"
                    aria-label="Next note"
                    disabled={currentIndex >= filteredFiles.length - 1}
                    on:click={() => navigate(1)}
                    use:icon={"chevron-right"}
                ></button>
            </div>
            {#key currentFile.path}
                <div class="daily-note-wrapper">
                    <DailyNote
                        file={currentFile}
                        plugin={plugin}
                        leaf={leaf}
                    />
                </div>
            {/key}
        {/if}
    {:else}
        {#each filteredFiles as file (file.path)}
            <div class="daily-note-wrapper">
                <DailyNote
                    file={file}
                    plugin={plugin}
                    leaf={leaf}
                />
            </div>
        {/each}
    {/if}
    {#if footerFile}
        <div class="daily-note-wrapper daily-note-footer" data-footer-path={footerFile.path}>
            {#key footerFile.path}
                <DailyNote
                    file={footerFile}
                    plugin={plugin}
                    leaf={leaf}
                />
            {/key}
        </div>
    {/if}
</div>


<style>
    .dn-stock {
        height: 200px;
        width: 100%;

        display: flex;
        justify-content: center;
        align-items: center;
    }

    .dn-stock-text {
        text-align: center;
    }

    .dn-blank-day {
        display: flex;
        margin-left: auto;
        margin-right: auto;
        max-width: var(--file-line-width);
        color: var(--color-base-40);
        padding-top: 12px;
        padding-bottom: 12px;
        transition: all 200ms;
    }

    .dn-blank-day:hover {
        padding-top: 20px;
        padding-bottom: 20px;
        transition: padding 200ms;
    }

    .dn-blank-day-text {
        margin-left: auto;
        margin-right: auto;
        text-align: center;
    }

    .daily-note-wrapper {
        width: 100%;
    }

    .dn-single-nav {
        position: sticky;
        top: 0;
        z-index: 2;
        display: flex;
        align-items: center;
        gap: var(--size-4-2);
        max-width: var(--file-line-width);
        margin: 0 auto var(--size-4-2);
        padding: var(--size-4-2) 0;
        background-color: var(--background-primary);
        border-bottom: 1px solid var(--background-modifier-border);
    }

    .dn-nav-center {
        flex: 1;
        display: flex;
        align-items: baseline;
        justify-content: center;
        gap: var(--size-4-2);
        min-width: 0;
    }

    .dn-nav-title {
        font-weight: var(--font-semibold);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .dn-nav-count {
        color: var(--text-muted);
        font-size: var(--font-ui-small);
        font-variant-numeric: tabular-nums;
    }

    .dn-nav-btn[disabled] {
        opacity: 0.3;
        cursor: default;
    }

    .dn-nav-today {
        font-size: var(--font-ui-small);
    }
</style>
