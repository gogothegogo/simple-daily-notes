<script lang="ts">
    import type DailyNoteViewPlugin from "../dailyNoteViewIndex";
    import type { WorkspaceLeaf } from "obsidian";

    import { TFile, moment } from "obsidian";
    import DailyNote from "./DailyNote.svelte";
    import { TimeRange, SelectionMode, TimeField } from "../types/time";
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

    let filteredFiles: TFile[] = [];
    let fileManager: FileManager;

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
    {#each filteredFiles as file (file.path)}
        <div class="daily-note-wrapper">
            <DailyNote
                file={file}
                plugin={plugin}
                leaf={leaf}
            />
        </div>
    {/each}
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
</style>
