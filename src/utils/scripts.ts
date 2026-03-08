import { getPreferenceValues, LocalStorage } from "@raycast/api";
import { exec, spawn } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";

export interface RecordingTranscript {
  filename: string;
  transcript: string;
  createdAt: string;
}

export interface RecordingFile {
  title: string;
  size: number;
  createdAt: Date;
  path: string;
  hasTranscript: boolean;
  isPinned: boolean;
}

export interface RecordingMetadata {
  title: string;
  size: number;
  createdAt: string;
  path: string;
  hasTranscript: boolean;
  isPinned: boolean;
}
const preferences = getPreferenceValues<Preferences & { fastTranscript?: boolean }>();
const execAsync = promisify(exec);
const shellOptions = { shell: "/bin/zsh" };
const TRANSCRIPT_KEY_PREFIX = "recording_transcript_";
const METADATA_KEY_PREFIX = "recording_metadata_";

export async function checkCommand(command: string): Promise<string> {
  try {
    // if full path, check if file exists and is executable
    if (command.startsWith("/")) {
      await fs.promises.access(command, fs.constants.X_OK);
      return command;
    }
    // use which to find in PATH
    const { stdout } = await execAsync(`which ${command}`, shellOptions);
    return stdout.trim();
  } catch (error) {
    console.error(error);
    throw new Error(`Command ${command} not found`);
  }
}

export async function startRecording(path: string): Promise<string | undefined> {
  const soxPath = await checkCommand("/opt/homebrew/bin/sox");
  const args = [
    "-m",
    "-v",
    "1.5",
    "-t",
    "coreaudio",
    preferences.recordingInputVirtual,
    "-v",
    "1.5",
    "-t",
    "coreaudio",
    preferences.recordingInputMic,
    "-r",
    "16000",
    "-c",
    "2",
    path,
    "-q",
  ];

  try {
    const child = spawn(soxPath, args, {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    const pid = child.pid?.toString();
    return pid;
  } catch (error) {
    throw new Error(`${error}`);
  }
}

export async function listRecordings(): Promise<RecordingFile[]> {
  const directory = preferences.recordingsDirectory;

  if (!fs.existsSync(directory)) {
    throw new Error(`Directory not found: ${directory}`);
  }

  const dirFiles = await fs.promises.readdir(directory);
  const visibleFiles = dirFiles.filter((file) => !file.startsWith("."));
  const metadataItems = await LocalStorage.allItems();
  const metadataKeys = Object.keys(metadataItems);
  const existingFiles = new Set(visibleFiles);

  await Promise.all(
    metadataKeys
      .filter((key) => key.startsWith(METADATA_KEY_PREFIX))
      .map(async (key) => {
        const filename = key.replace(METADATA_KEY_PREFIX, "");
        if (!existingFiles.has(filename)) {
          await LocalStorage.removeItem(key);
        }
      }),
  );

  const filesWithDetails = await Promise.all(
    visibleFiles.map(async (file) => {
      const filePath = path.join(directory, file);
      const stats = await fs.promises.stat(filePath);
      const transcript = await getTranscript(file);
      const storedMetadata = await getRecordingMetadata(file);
      const hasTranscript = transcript !== null;
      const isPinned = storedMetadata?.isPinned ?? false;

      if (!storedMetadata) {
        await saveRecordingMetadata({
          title: file,
          size: stats.size,
          createdAt: stats.birthtime.toISOString(),
          path: filePath,
          hasTranscript,
          isPinned,
        });
      }

      return {
        title: file,
        size: stats.size,
        createdAt: stats.birthtime,
        path: filePath,
        hasTranscript,
        isPinned,
      };
    }),
  );

  return filesWithDetails;
}

export async function stopRecording(pid: string): Promise<void> {
  try {
    await execAsync(`kill ${pid}`, shellOptions);
  } catch (error) {
    throw new Error(`${error}`);
  }
}

export async function transcribeRecording(recordingPath: string): Promise<RecordingTranscript> {
  const whisperPath = await checkCommand("/opt/homebrew/bin/whisper-cli");

  const modelPath = path.join(
    process.env.HOME || "~",
    "models",
    preferences.fastTranscript ? "ggml-small.bin" : "ggml-medium.en.bin",
  );
  const filename = path.basename(recordingPath);

  const command = `"${whisperPath}" -m "${modelPath}" -f "${recordingPath}" -l en -np -nt`;

  try {
    const { stdout } = await execAsync(command, {
      ...shellOptions,
    });
    const transcript = stdout.trim();
    const transcriptData: RecordingTranscript = {
      filename,
      transcript,
      createdAt: new Date().toISOString(),
    };

    await LocalStorage.setItem(`${TRANSCRIPT_KEY_PREFIX}${filename}`, JSON.stringify(transcriptData));

    return transcriptData;
  } catch (error) {
    throw new Error(`Failed to transcribe recording: ${error}`);
  }
}

export async function getTranscript(filename: string): Promise<RecordingTranscript | null> {
  try {
    const data = await LocalStorage.getItem<string>(`${TRANSCRIPT_KEY_PREFIX}${filename}`);
    if (data) {
      return JSON.parse(data) as RecordingTranscript;
    }
    return null;
  } catch {
    return null;
  }
}

export async function getRecordingMetadata(filename: string): Promise<RecordingMetadata | null> {
  try {
    const data = await LocalStorage.getItem<string>(`${METADATA_KEY_PREFIX}${filename}`);
    if (!data) return null;
    return JSON.parse(data) as RecordingMetadata;
  } catch {
    return null;
  }
}

export async function saveRecordingMetadata(metadata: RecordingMetadata): Promise<void> {
  await LocalStorage.setItem(`${METADATA_KEY_PREFIX}${metadata.title}`, JSON.stringify(metadata));
}

export async function updateRecordingPin(file: RecordingFile, isPinned: boolean): Promise<void> {
  const metadata: RecordingMetadata = {
    title: file.title,
    size: file.size,
    createdAt: file.createdAt.toISOString(),
    path: file.path,
    hasTranscript: file.hasTranscript,
    isPinned,
  };

  await saveRecordingMetadata(metadata);
}

function escapeForSingleQuotes(value: string): string {
  return value.replace(/'/g, `'\"'\"'`);
}

export async function openTranscriptInTextEdit(filename: string): Promise<void> {
  const transcriptData = await getTranscript(filename);
  if (!transcriptData) {
    throw new Error("Transcript not found");
  }

  const escapedTranscript = escapeForSingleQuotes(transcriptData.transcript);
  const command = `echo '${escapedTranscript}' | open -f -a TextEdit`;

  try {
    await execAsync(command, shellOptions);
  } catch (error) {
    throw new Error(`Failed to open transcript in TextEdit: ${error}`);
  }
}

export async function copyTranscriptToClipboard(filename: string): Promise<void> {
  const transcriptData = await getTranscript(filename);
  if (!transcriptData) throw new Error("Transcript not found");
  const command = `echo '${escapeForSingleQuotes(transcriptData.transcript)}' | pbcopy`;
  try {
    await execAsync(command, shellOptions);
  } catch (error) {
    throw new Error(`Failed to copy transcript to clipboard: ${error}`);
  }
}

export async function deleteTranscript(filename: string): Promise<void> {
  await LocalStorage.removeItem(`${TRANSCRIPT_KEY_PREFIX}${filename}`);
}

export async function deleteRecordingMetadata(filename: string): Promise<void> {
  await LocalStorage.removeItem(`${METADATA_KEY_PREFIX}${filename}`);
}
