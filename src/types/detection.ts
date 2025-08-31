export interface DetectionProject {
  version: string;
  inputVideo: string;
  createdAt: string;
  processingOptions: {
    confidenceThreshold: number;
    beforeSeconds: number;
    afterSeconds: number;
    frameRate: number;
    scaleWidth: number;
  };
  statistics: {
    totalFrames: number;
    rawDetections: number;
    clusteredDetections: number;
    finalDetections: number;
    averageClusterSize: number;
    maxClusterSize: number;
  };
  detections: DetectionEntry[];
}

export interface DetectionEntry {
  id: number;
  timeInSeconds: number;
  frameNumber: number;
  confidence: number;
  enabled: boolean;
  note?: string;
  clusterInfo?: {
    originalDetections: number;
    timeRange: {
      start: number;
      end: number;
    };
  };
}