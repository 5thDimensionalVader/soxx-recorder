import { getTranscript } from "../utils/scripts";

type Input = {
  /**
   * The path to the audio recording to get the transcription
   */
  filename: string;
};

/**
 * Get the transcription of the specified audio recording
 */
export default async function tool(input: Input) {
  return await getTranscript(input.filename);
}
