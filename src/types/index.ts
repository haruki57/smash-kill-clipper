export interface KillScreenTimestamp {
  frameNumber: number;
  timeInSeconds: number;
  confidence: number;
}

export interface VideoSegment {
  startTime: number;
  endTime: number;
  duration: number;
}

export interface ProcessingOptions {
  inputPath: string;
  outputPath: string;
  beforeSeconds: number;
  afterSeconds: number;
  confidenceThreshold: number;
}

export interface DetectionResult {
  isKillScreen: boolean;
  confidence: number;
  frameNumber: number;
}