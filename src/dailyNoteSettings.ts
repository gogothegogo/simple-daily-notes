import DailyNoteViewPlugin from "./dailyNoteViewIndex";
import { App, debounce, PluginSettingTab, Setting, Modal } from "obsidian";
import { SelectionMode, TimeField, TimeRange } from "./types/time";

export interface DailyNoteSettings {
    hideFrontmatter: boolean;
    hideBacklinks: boolean;
    createAndOpenOnStartup: boolean;
    useArrowUpOrDownToNavigate: boolean;

    selectionMode: SelectionMode;
    target: string;
    timeField: TimeField;
    selectedRange: TimeRange;
    customRange: { start: string; end: string } | null;

    footerNotePath: string;

    preset: {
        type: "folder" | "tag";
        target: string;
    }[];
}

export const DEFAULT_SETTINGS: DailyNoteSettings = {
    hideFrontmatter: false,
    hideBacklinks: false,
    createAndOpenOnStartup: false,
    useArrowUpOrDownToNavigate: false,

    selectionMode: "daily",
    target: "",
    timeField: "mtime",
    selectedRange: "all",
    customRange: null,

    footerNotePath: "",

    preset: [],
};

export class DailyNoteSettingTab extends PluginSettingTab {
    plugin: DailyNoteViewPlugin;

    constructor(app: App, plugin: DailyNoteViewPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    debounceApplySettingsUpdate = debounce(
        async () => {
            await this.plugin.saveSettings();
        },
        200,
        true
    );

    debounceDisplay = debounce(
        async () => {
            await this.display();
        },
        400,
        true
    );

    applySettingsUpdate() {
        this.debounceApplySettingsUpdate();
    }

    async display() {
        await this.plugin.loadSettings();

        const { containerEl } = this;
        const settings = this.plugin.settings;

        containerEl.toggleClass("daily-note-settings-container", true);

        containerEl.empty();

        new Setting(containerEl)
            .setName("Hide frontmatter")
            .setDesc("Hide frontmatter in daily notes")
            .addToggle((toggle) =>
                toggle
                    .setValue(settings.hideFrontmatter)
                    .onChange(async (value) => {
                        this.plugin.settings.hideFrontmatter = value;

                        document.body.classList.toggle(
                            "daily-notes-hide-frontmatter",
                            value
                        );
                        this.applySettingsUpdate();
                    })
            );

        new Setting(containerEl)
            .setName("Hide backlinks")
            .setDesc("Hide backlinks in daily notes")
            .addToggle((toggle) =>
                toggle
                    .setValue(settings.hideBacklinks)
                    .onChange(async (value) => {
                        this.plugin.settings.hideBacklinks = value;

                        document.body.classList.toggle(
                            "daily-notes-hide-backlinks",
                            value
                        );
                        this.applySettingsUpdate();
                    })
            );

        new Setting(containerEl)
            .setName("Create and open Simple Daily Notes on startup")
            .setDesc(
                "Automatically create today's daily note and open the Simple Daily Notes on Obsidian starts"
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(settings.createAndOpenOnStartup)
                    .onChange(async (value) => {
                        this.plugin.settings.createAndOpenOnStartup = value;
                        this.applySettingsUpdate();
                    })
            );

        new Setting(containerEl)
            .setName("Use arrow up/down key to navigate between notes")
            .addToggle((toggle) =>
                toggle
                    .setValue(settings.useArrowUpOrDownToNavigate)
                    .onChange(async (value) => {
                        this.plugin.settings.useArrowUpOrDownToNavigate = value;
                        this.applySettingsUpdate();
                    })
            );

        new Setting(containerEl).setName("View defaults").setHeading();

        const persistAndApply = () => {
            this.applySettingsUpdate();
            this.plugin.applySettingsToOpenViews();
        };

        new Setting(containerEl)
            .setName("View mode")
            .setDesc(
                "What the view shows when opened. Folder/Tag require a target below."
            )
            .addDropdown((dd) =>
                dd
                    .addOption("daily", "Daily Notes")
                    .addOption("folder", "Folder")
                    .addOption("tag", "Tag")
                    .setValue(settings.selectionMode)
                    .onChange((value) => {
                        this.plugin.settings.selectionMode =
                            value as SelectionMode;
                        persistAndApply();
                        this.debounceDisplay();
                    })
            );

        if (settings.selectionMode !== "daily") {
            new Setting(containerEl)
                .setName(
                    settings.selectionMode === "folder"
                        ? "Folder path"
                        : "Tag name"
                )
                .setDesc(
                    settings.selectionMode === "folder"
                        ? "Folder to display (e.g., '00_CAPTURE' or 'parent/child')"
                        : "Tag name without the '#' (e.g., 'project')"
                )
                .addText((text) =>
                    text
                        .setPlaceholder(
                            settings.selectionMode === "folder"
                                ? "folder/subfolder"
                                : "tag"
                        )
                        .setValue(settings.target)
                        .onChange((value) => {
                            this.plugin.settings.target = value.trim();
                            persistAndApply();
                        })
                );
        }

        new Setting(containerEl)
            .setName("Date range")
            .setDesc("Which time window of files to show.")
            .addDropdown((dd) =>
                dd
                    .addOption("all", "All Notes")
                    .addOption("week", "This Week")
                    .addOption("month", "This Month")
                    .addOption("year", "This Year")
                    .addOption("last-week", "Last Week")
                    .addOption("last-month", "Last Month")
                    .addOption("last-year", "Last Year")
                    .addOption("quarter", "This Quarter")
                    .addOption("last-quarter", "Last Quarter")
                    .addOption("custom", "Custom Date Range")
                    .setValue(settings.selectedRange)
                    .onChange((value) => {
                        this.plugin.settings.selectedRange =
                            value as TimeRange;
                        persistAndApply();
                        this.debounceDisplay();
                    })
            );

        if (settings.selectedRange === "custom") {
            const today = new Date().toISOString().slice(0, 10);
            const current = settings.customRange ?? {
                start: today,
                end: today,
            };
            if (!settings.customRange) {
                this.plugin.settings.customRange = current;
                this.applySettingsUpdate();
            }

            new Setting(containerEl)
                .setName("Custom range — start date")
                .addText((text) => {
                    (text.inputEl as HTMLInputElement).type = "date";
                    text.setValue(current.start).onChange((value) => {
                        const next = {
                            start: value,
                            end:
                                this.plugin.settings.customRange?.end ??
                                current.end,
                        };
                        this.plugin.settings.customRange = next;
                        persistAndApply();
                    });
                });

            new Setting(containerEl)
                .setName("Custom range — end date")
                .addText((text) => {
                    (text.inputEl as HTMLInputElement).type = "date";
                    text.setValue(current.end).onChange((value) => {
                        const next = {
                            start:
                                this.plugin.settings.customRange?.start ??
                                current.start,
                            end: value,
                        };
                        this.plugin.settings.customRange = next;
                        persistAndApply();
                    });
                });
        }

        new Setting(containerEl)
            .setName("Sort by")
            .setDesc("Time field used for sorting and time-range filtering.")
            .addDropdown((dd) =>
                dd
                    .addOption("mtime", "Modification Time")
                    .addOption("ctime", "Creation Time")
                    .addOption("mtimeReverse", "Modification Time (Reverse)")
                    .addOption("ctimeReverse", "Creation Time (Reverse)")
                    .addOption("name", "Name (A-Z)")
                    .addOption("nameReverse", "Name (Z-A)")
                    .setValue(settings.timeField)
                    .onChange((value) => {
                        this.plugin.settings.timeField = value as TimeField;
                        persistAndApply();
                    })
            );

        new Setting(containerEl).setName("Footer note").setHeading();

        new Setting(containerEl)
            .setName("Footer note path")
            .setDesc(
                "Vault path to a note rendered after all listed notes (e.g., 'Templates/Weekly Tasks.md'). Leave empty to disable. The same note is shown regardless of the active view mode."
            )
            .addText((text) =>
                text
                    .setPlaceholder("Templates/Weekly Tasks.md")
                    .setValue(settings.footerNotePath)
                    .onChange((value) => {
                        this.plugin.settings.footerNotePath = value.trim();
                        persistAndApply();
                    })
            );

        new Setting(containerEl).setName("Saved presets").setHeading();

        const presetContainer = containerEl.createDiv("preset-container");

        // Display existing presets
        if (settings.preset.length === 0) {
            presetContainer.createEl("p", {
                text: "No presets saved yet. Select a folder or tag in Simple Daily Notes to create a preset.",
                cls: "no-presets-message",
            });
        } else {
            settings.preset.forEach((preset, index) => {
                new Setting(containerEl)
                    .setName(
                        preset.type === "folder"
                            ? "Focus on Folder: "
                            : "Focus on Tag: "
                    )
                    .setDesc(preset.target)
                    .addButton((button) => {
                        button.setIcon("trash");
                        button.onClick(() => {
                            settings.preset.splice(index, 1);
                            this.applySettingsUpdate();
                            this.debounceDisplay();
                        });
                    });
            });
        }

        // Add button to add a new preset
        new Setting(containerEl)
            .setName("Add new preset")
            .setDesc("Add a new folder or tag preset")
            .addButton((button) => {
                button
                    .setButtonText("Add Preset")
                    .setCta()
                    .onClick(() => {
                        const modal = new AddPresetModal(
                            this.app,
                            (type, target) => {
                                // Check if this preset already exists
                                const existingPresetIndex =
                                    settings.preset.findIndex(
                                        (p) =>
                                            p.type === type &&
                                            p.target === target
                                    );

                                // If it doesn't exist, add it
                                if (existingPresetIndex === -1) {
                                    settings.preset.push({
                                        type,
                                        target,
                                    });
                                    this.applySettingsUpdate();
                                    this.debounceDisplay();
                                }
                            }
                        );
                        modal.open();
                    });
            });
    }
}

// Add a new modal for adding presets
class AddPresetModal extends Modal {
    saveCallback: (type: "folder" | "tag", target: string) => void;
    type: "folder" | "tag" = "folder";
    targetInput: HTMLInputElement;

    constructor(
        app: App,
        saveCallback: (type: "folder" | "tag", target: string) => void
    ) {
        super(app);
        this.saveCallback = saveCallback;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl("h2", { text: "Add New Preset" });

        const form = contentEl.createEl("form");
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            this.save();
        });

        // Type selection
        const typeSetting = form.createDiv();
        typeSetting.addClass("setting-item");

        const typeSettingInfo = typeSetting.createDiv();
        typeSettingInfo.addClass("setting-item-info");
        typeSettingInfo.createEl("div", {
            text: "Preset Type",
            cls: "setting-item-name",
        });

        const typeSettingControl = typeSetting.createDiv();
        typeSettingControl.addClass("setting-item-control");

        // Radio buttons for type selection
        const folderRadio = typeSettingControl.createEl("input", {
            type: "radio",
            attr: {
                name: "preset-type",
                id: "preset-type-folder",
                value: "folder",
                checked: true,
            },
        });
        typeSettingControl.createEl("label", {
            text: "Folder",
            attr: {
                for: "preset-type-folder",
            },
        });

        const tagRadio = typeSettingControl.createEl("input", {
            type: "radio",
            attr: {
                name: "preset-type",
                id: "preset-type-tag",
                value: "tag",
            },
        });
        typeSettingControl.createEl("label", {
            text: "Tag",
            attr: {
                for: "preset-type-tag",
            },
        });

        folderRadio.addEventListener("change", () => {
            if (folderRadio.checked) {
                this.type = "folder";
            }
        });

        tagRadio.addEventListener("change", () => {
            if (tagRadio.checked) {
                this.type = "tag";
            }
        });

        // Target input
        const targetSetting = form.createDiv();
        targetSetting.addClass("setting-item");

        const targetSettingInfo = targetSetting.createDiv();
        targetSettingInfo.addClass("setting-item-info");

        targetSettingInfo.createEl("div", {
            text: "Target",
            cls: "setting-item-name",
        });

        targetSettingInfo.createEl("div", {
            text: "Enter the folder path or tag name",
            cls: "setting-item-description",
        });

        const targetSettingControl = targetSetting.createDiv();
        targetSettingControl.addClass("setting-item-control");

        this.targetInput = targetSettingControl.createEl("input", {
            type: "text",
            value: "",
            placeholder: "Enter folder path or tag name",
        });
        this.targetInput.addClass("target-input");

        const footerEl = contentEl.createDiv();
        footerEl.addClass("modal-button-container");

        footerEl
            .createEl("button", {
                text: "Cancel",
                cls: "mod-warning",
                attr: {
                    type: "button",
                },
            })
            .addEventListener("click", () => {
                this.close();
            });

        footerEl
            .createEl("button", {
                text: "Save",
                cls: "mod-cta",
                attr: {
                    type: "submit",
                },
            })
            .addEventListener("click", (e) => {
                e.preventDefault();
                this.save();
            });
    }

    save() {
        const target = this.targetInput.value.trim();
        if (target) {
            this.saveCallback(this.type, target);
            this.close();
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
