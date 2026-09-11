export const VIDEO_FRAME_FILTER =
  "select='eq(n,0)+gte(t-prev_selected_t,15)',scale='min(1280,iw)':-2";

export function videoFrameArgs(
  videoPath: string,
  outputPath: string,
  maxFrames: number,
) {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-n",
    "-i",
    videoPath,
    "-vf",
    VIDEO_FRAME_FILTER,
    "-fps_mode",
    "vfr",
    "-frames:v",
    String(maxFrames),
    outputPath,
  ];
}
