import { MenuBarExtra, Icon, getPreferenceValues, showToast, Toast, confirmAlert, Alert, open } from "@raycast/api";
import { useCachedState } from "@raycast/utils";
import { useCallback, useEffect, useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import fs from "node:fs";
import {
  startRecording,
  stopRecording,
  listRecordings,
  RecordingFile,
  transcribeRecording,
  deleteTranscript,
  deleteRecordingMetadata,
  openTranscriptInTextEdit,
  copyTranscriptToClipboard,
  updateRecordingPin,
} from "./utils/scripts";

export default function Command() {
  const preferences = getPreferenceValues<Preferences>();
  const [pId, setPid] = useCachedState<string | undefined>("recording-pid", undefined);
  const [isRecording, setIsRecording] = useCachedState<boolean>("is-recording", false);
  const [files, setFiles] = useState<RecordingFile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const recordings = await listRecordings();
      setFiles(recordings);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("Directory not found:")) {
        const directory = message.replace("Directory not found: ", "");
        await showToast({
          style: Toast.Style.Failure,
          title: "Directory not found",
          message: `The directory ${directory} does not exist.`,
        });
      } else {
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to load recordings",
          message,
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const { pinnedFiles, unpinnedFiles } = useMemo(() => {
    const cutoffDate = subDays(new Date(), 7);
    const pinned = files.filter((file) => file.isPinned);
    const unpinned = files.filter((file) => !file.isPinned && file.createdAt >= cutoffDate);
    const sortByDate = (a: RecordingFile, b: RecordingFile) => b.createdAt.getTime() - a.createdAt.getTime();
    return {
      pinnedFiles: [...pinned].sort(sortByDate),
      unpinnedFiles: [...unpinned].sort(sortByDate),
    };
  }, [files]);

  async function handleStart() {
    const path = `${preferences.recordingsDirectory}/recording_${format(new Date(), "yyyy-MM-dd")}.mp3`;
    const pid = await startRecording(path);
    setPid(pid);
    setIsRecording(true);
    await showToast({
      style: Toast.Style.Success,
      title: "Recording session started",
    });
  }

  async function handleStop() {
    if (pId) {
      await stopRecording(pId);
    }

    setIsRecording(false);
    setPid(undefined);
    await showToast({
      style: Toast.Style.Success,
      title: "Recording session stopped",
    });
  }

  async function handleDelete(file: RecordingFile) {
    const confirmed = await confirmAlert({
      title: "Delete Recording",
      message: `Are you sure you want to delete \"${file.title}\"?`,
      primaryAction: {
        title: "Delete",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (confirmed) {
      try {
        await fs.promises.unlink(file.path);
        await deleteTranscript(file.title);
        await deleteRecordingMetadata(file.title);
        await showToast({
          style: Toast.Style.Success,
          title: "Recording deleted",
        });
        await loadFiles();
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
      await loadFiles();
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
      await loadFiles();
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

  async function handleCopyTranscript(file: RecordingFile) {
    try {
      await copyTranscriptToClipboard(file.title);
      await showToast({
        style: Toast.Style.Success,
        title: "Transcription copied to clipboard",
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to copy transcription",
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

  return (
    <MenuBarExtra icon={isRecording ? Icon.Stop : Icon.Play} tooltip="Sox Recorder" isLoading={isLoading}>
      <MenuBarExtra.Section>
        <MenuBarExtra.Item
          title={isRecording ? "Stop Recording" : "Start Recording"}
          icon={isRecording ? Icon.Stop : Icon.Play}
          onAction={isRecording ? handleStop : handleStart}
        />
      </MenuBarExtra.Section>
      {pinnedFiles.length === 0 && unpinnedFiles.length === 0 ? (
        <MenuBarExtra.Section title="Recordings">
          <MenuBarExtra.Item title="No recordings found" />
        </MenuBarExtra.Section>
      ) : (
        <>
          {pinnedFiles.length > 0 ? (
            <MenuBarExtra.Section title="Pinned">
              {pinnedFiles.map((file) => (
                <MenuBarExtra.Submenu key={file.path} title={file.title} icon={{ fileIcon: file.path }}>
                  <MenuBarExtra.Item title="Open Recording" icon={Icon.Finder} onAction={() => open(file.path)} />
                  <MenuBarExtra.Item title="Unpin Recording" icon={Icon.Pin} onAction={() => handleTogglePin(file)} />
                  {file.hasTranscript ? (
                    <MenuBarExtra.Item
                      title="Open Transcription in TextEdit"
                      icon={Icon.Text}
                      onAction={() => handleOpenTranscript(file)}
                    />
                  ) : null}
                  {file.hasTranscript ? (
                    <MenuBarExtra.Item
                      title="Retranscribe Recording"
                      icon={Icon.Wand}
                      onAction={() => handleRetranscribe(file)}
                    />
                  ) : (
                    <MenuBarExtra.Item
                      title="Transcribe Recording"
                      icon={Icon.Wand}
                      onAction={() => handleRetranscribe(file)}
                    />
                  )}
                  {file.hasTranscript ? (
                    <MenuBarExtra.Item
                      title="Delete Transcription"
                      icon={Icon.QuoteBlock}
                      onAction={() => handleDeleteTranscript(file)}
                    />
                  ) : null}
                  {file.hasTranscript ? (
                    <MenuBarExtra.Item
                      title="Copy Transcription to Clipboard"
                      icon={Icon.Clipboard}
                      onAction={() => handleCopyTranscript(file)}
                    />
                  ) : null}
                  <MenuBarExtra.Item title="Delete Recording" icon={Icon.Trash} onAction={() => handleDelete(file)} />
                </MenuBarExtra.Submenu>
              ))}
            </MenuBarExtra.Section>
          ) : null}
          {unpinnedFiles.length > 0 ? (
            <MenuBarExtra.Section title="Recordings">
              {unpinnedFiles.map((file) => (
                <MenuBarExtra.Submenu key={file.path} title={file.title} icon={{ fileIcon: file.path }}>
                  <MenuBarExtra.Item title="Open Recording" icon={Icon.Finder} onAction={() => open(file.path)} />
                  <MenuBarExtra.Item title="Pin Recording" icon={Icon.Pin} onAction={() => handleTogglePin(file)} />
                  {file.hasTranscript ? (
                    <MenuBarExtra.Item
                      title="Open Transcription in TextEdit"
                      icon={Icon.Text}
                      onAction={() => handleOpenTranscript(file)}
                    />
                  ) : null}
                  {file.hasTranscript ? (
                    <MenuBarExtra.Item
                      title="Retranscribe Recording"
                      icon={Icon.Wand}
                      onAction={() => handleRetranscribe(file)}
                    />
                  ) : (
                    <MenuBarExtra.Item
                      title="Transcribe Recording"
                      icon={Icon.Wand}
                      onAction={() => handleRetranscribe(file)}
                    />
                  )}
                  {file.hasTranscript ? (
                    <MenuBarExtra.Item
                      title="Delete Transcription"
                      icon={Icon.QuoteBlock}
                      onAction={() => handleDeleteTranscript(file)}
                    />
                  ) : null}
                  {file.hasTranscript ? (
                    <MenuBarExtra.Item
                      title="Copy Transcription to Clipboard"
                      icon={Icon.Clipboard}
                      onAction={() => handleCopyTranscript(file)}
                    />
                  ) : null}
                  <MenuBarExtra.Item title="Delete Recording" icon={Icon.Trash} onAction={() => handleDelete(file)} />
                </MenuBarExtra.Submenu>
              ))}
            </MenuBarExtra.Section>
          ) : null}
        </>
      )}
    </MenuBarExtra>
  );
}
