import {
  Action,
  ActionPanel,
  Alert,
  Color,
  confirmAlert,
  Icon,
  List,
  showToast,
  Toast,
} from "@raycast/api";
import { useState, useEffect, useCallback } from "react";
import fs from "fs";
import {
  deleteTranscript,
  deleteRecordingMetadata,
  listRecordings,
  openTranscriptInTextEdit,
  transcribeRecording,
  updateRecordingPin,
  RecordingFile,
} from "./utils/scripts";
import { isToday, isYesterday, format } from "date-fns";

type DateGroup = "Today" | "Yesterday" | "Older";

function getDateGroup(date: Date): DateGroup {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return "Older";
}

function groupAndSortRecordings(files: RecordingFile[]): Record<DateGroup, RecordingFile[]> {
  // Sort by date descending (most recent first)
  const sorted = [...files].sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const groups: Record<DateGroup, RecordingFile[]> = {
    Today: [],
    Yesterday: [],
    Older: [],
  };

  for (const file of sorted) {
    const group = getDateGroup(file.createdAt);
    groups[group].push(file);
  }

  return groups;
}

export default function Command() {
  const [files, setFiles] = useState<RecordingFile[]>([]);

  const loadFiles = useCallback(async () => {
    try {
      const filesWithDetails = await listRecordings();
      setFiles(filesWithDetails);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("Directory not found:")) {
        const directory = message.replace("Directory not found: ", "");
        await showToast({
          style: Toast.Style.Failure,
          title: "Directory not found",
          message: `The directory ${directory} does not exist.`,
        });
        return;
      }
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to load recordings",
        message,
      });
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  async function handleDelete(file: RecordingFile) {
    const confirmed = await confirmAlert({
      title: "Delete Recording",
      message: `Are you sure you want to delete "${file.title}"?`,
      primaryAction: {
        title: "Delete",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (confirmed) {
      try {
        await fs.promises.unlink(file.path);
        // Delete transcript from LocalStorage if it exists
        await deleteTranscript(file.title);
        await deleteRecordingMetadata(file.title);
        await showToast({
          style: Toast.Style.Success,
          title: "Recording deleted",
        });
        await loadFiles(); // Refresh the list
      } catch (error) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to delete recording",
          message: String(error),
        });
      }
    }
  }

  async function handleRetranscribe(file: RecordingFile) {
    // Delete any existing transcript first
    await deleteTranscript(file.title);

    await showToast({
      style: Toast.Style.Animated,
      title: "Transcribing recording",
      message: "This may take a few minutes",
    });

    try {
      await transcribeRecording(file.path);
      await showToast({
        style: Toast.Style.Success,
        title: "Transcription complete",
      });
      await loadFiles(); // Refresh the list
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to transcribe recording",
        message: String(error),
      });
    }
  }

  async function handleDeleteTranscript(file: RecordingFile) {
    try {
      await deleteTranscript(file.title);
      await showToast({
        style: Toast.Style.Success,
        title: "Transcription deleted",
      });
      await loadFiles(); // Refresh the list
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to delete transcription",
        message: String(error),
      });
    }
  }

  async function handleOpenTranscript(file: RecordingFile) {
    try {
      await openTranscriptInTextEdit(file.title);
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to open transcription",
        message: String(error),
      });
    }
  }

  async function handleTogglePin(file: RecordingFile) {
    const nextPinned = !file.isPinned;
    try {
      await updateRecordingPin(file, nextPinned);
      await showToast({
        style: Toast.Style.Success,
        title: nextPinned ? "Recording pinned" : "Recording unpinned",
      });
      await loadFiles();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to update pin",
        message: String(error),
      });
    }
  }

  const groupedFiles = groupAndSortRecordings(files);
  const dateGroups: DateGroup[] = ["Today", "Yesterday", "Older"];

  return (
    <List navigationTitle="Saved Recordings">
      {dateGroups.map((group) => {
        const groupFiles = groupedFiles[group];
        if (groupFiles.length === 0) return null;

        return (
          <List.Section key={group} title={group}>
            {groupFiles.map((file) => (
              <List.Item
                key={file.title}
                title={file.title}
                icon={{ fileIcon: file.path }}
                accessories={[
                  ...(file.isPinned
                    ? [{ icon: { source: Icon.Pin, tintColor: Color.Orange }, tooltip: "Pinned" }]
                    : []),
                  ...(file.hasTranscript
                    ? [{ icon: { source: Icon.QuoteBlock, tintColor: Color.Blue }, tooltip: "Transcript available" }]
                    : []),
                  { text: format(file.createdAt, "MMM d, yyyy") },
                ]}
                quickLook={{ name: file.title, path: file.path }}
                actions={
                  <ActionPanel>
                    <ActionPanel.Section>
                      <Action.Open title="Open Recording" target={file.path} />
                      <Action.ToggleQuickLook />
                      <Action
                        title={file.isPinned ? "Unpin Recording" : "Pin Recording"}
                        icon={Icon.Pin}
                        shortcut={{ modifiers: ["ctrl"], key: "p" }}
                        onAction={() => handleTogglePin(file)}
                      />
                    </ActionPanel.Section>
                    <ActionPanel.Section>
                      {file.hasTranscript ? (
                        <Action
                          title="Open Transcription in TextEdit"
                          icon={Icon.Text}
                          shortcut={{ modifiers: ["cmd"], key: "o" }}
                          onAction={() => handleOpenTranscript(file)}
                        />
                      ) : null}
                      {file.hasTranscript ? (
                        <Action
                          title="Retranscribe Recording"
                          icon={Icon.Wand}
                          shortcut={{ modifiers: ["cmd"], key: "t" }}
                          onAction={() => handleRetranscribe(file)}
                        />
                      ) : (
                        <Action
                          title="Transcribe Recording"
                          icon={Icon.Wand}
                          shortcut={{ modifiers: ["cmd"], key: "t" }}
                          onAction={() => handleRetranscribe(file)}
                        />
                      )}
                      {file.hasTranscript ? (
                        <Action
                          title="Delete Transcription"
                          icon={Icon.QuoteBlock}
                          shortcut={{ modifiers: ["ctrl"], key: "t" }}
                          onAction={() => handleDeleteTranscript(file)}
                        />
                      ) : null}
                      <Action
                        title="Delete Recording"
                        icon={Icon.Trash}
                        style={Action.Style.Destructive}
                        shortcut={{ modifiers: ["ctrl"], key: "x" }}
                        onAction={() => handleDelete(file)}
                      />
                    </ActionPanel.Section>
                  </ActionPanel>
                }
              />
            ))}
          </List.Section>
        );
      })}
    </List>
  );
}
