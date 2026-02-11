import { startRecording, stopRecording } from "./utils/scripts";
import { getPreferenceValues, Action, ActionPanel, List, Icon, showToast, Toast } from "@raycast/api";
import { useCachedState } from "@raycast/utils";
import { format } from "date-fns";


export default function Command() {
  const preferences = getPreferenceValues<Preferences>();
  const [pId, setPid] = useCachedState<string | undefined>("recording-pid", undefined);
  // const [recordingPath, setRecordingPath] = useCachedState<string>("recording-path", "");
  const [isRecording, setIsRecording] = useCachedState<boolean>("is-recording", false);



  return (
    <List navigationTitle="Start Recording Session">
      <List.Item
        title={isRecording ? "Stop Recording" : "Start Recording"}
        icon={isRecording ? Icon.Stop : Icon.Play}
        actions={
          <ActionPanel>
            {isRecording ? (
              <Action
                title="Stop Recording"
                icon={Icon.Stop}
                onAction={async () => {
                  if (pId) {
                    await stopRecording(pId);
                  }

                  // const currentRecordingPath = recordingPath;

                  // Clear cached state
                  setIsRecording(false);
                  setPid(undefined);
                  // setRecordingPath("");

                  await showToast({
                    style: Toast.Style.Success,
                    title: "Recording session stopped",
                  });

                  // Start transcription in background
                  // if (currentRecordingPath) {
                  //   await showToast({
                  //     style: Toast.Style.Animated,
                  //     title: "Transcribing recording",
                  //     message: "This may take a few minutes",
                  //   });

                  //   try {
                  //     await transcribeAndSummarize(currentRecordingPath);
                  //     await showToast({
                  //       style: Toast.Style.Success,
                  //       title: "Transcription complete",
                  //       message: "Summary saved",
                  //     });
                  //   } catch (error) {
                  //     await showToast({
                  //       style: Toast.Style.Failure,
                  //       title: "Transcription failed",
                  //       message: String(error),
                  //     });
                  //   }
                  // }
                }}
              />
            ) : (
              <Action
                title="Start Recording"
                icon={Icon.Play}
                onAction={async () => {
                  const path = `${preferences.recordingsDirectory}/recording_${format(new Date(), "yyyy-MM-dd_HH-mm-ss")}.mp3`;
                  const pid = await startRecording(path);
                  setPid(pid);
                  // setRecordingPath(path);
                  setIsRecording(true);
                  await showToast({
                    style: Toast.Style.Success,
                    title: "Recording session started",
                  });
                }}
              />
            )}
          </ActionPanel>
        }
      />
    </List>
  );
}
