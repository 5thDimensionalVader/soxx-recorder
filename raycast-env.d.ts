/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Recordings Directory - Directory where recordings are stored */
  "recordingsDirectory": string,
  /** Recording Input (BlackHole) - Input device to record from */
  "recordingInputVirtual": string,
  /** Recording Input (Mic) - Input device to record from */
  "recordingInputMic": string,
  /** Transcript Prompt - Prompt to use for transcribing and summarizing */
  "transcriptPrompt": string,
  /** Fast Transcript - Use a faster, smaller model for transcription */
  "fastTranscript"?: boolean
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `list-recordings` command */
  export type ListRecordings = ExtensionPreferences & {}
  /** Preferences accessible in the `start-recording` command */
  export type StartRecording = ExtensionPreferences & {}
  /** Preferences accessible in the `menu-bar-recording` command */
  export type MenuBarRecording = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `list-recordings` command */
  export type ListRecordings = {}
  /** Arguments passed to the `start-recording` command */
  export type StartRecording = {}
  /** Arguments passed to the `menu-bar-recording` command */
  export type MenuBarRecording = {}
}

