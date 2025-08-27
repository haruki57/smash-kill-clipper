import { KillScreenTimestamp } from '../types';

interface KillScreenCluster {
  startTime: number;
  endTime: number;
  detections: KillScreenTimestamp[];
  averageConfidence: number;
  peakConfidence: number;
}

export function deduplicateKillScreens(
  killScreens: KillScreenTimestamp[],
  mergeWindowSeconds: number = 2,
  minConsecutiveDetections: number = 2
): KillScreenTimestamp[] {
  if (killScreens.length === 0) return [];

  // 時間順にソート
  const sortedKillScreens = [...killScreens].sort((a, b) => a.timeInSeconds - b.timeInSeconds);
  
  // クラスタリング（近い時間の検出をグループ化）
  const clusters: KillScreenCluster[] = [];
  let currentCluster: KillScreenCluster | null = null;

  for (const killScreen of sortedKillScreens) {
    if (currentCluster === null || 
        killScreen.timeInSeconds - currentCluster.endTime > mergeWindowSeconds) {
      
      // 新しいクラスタを開始
      if (currentCluster !== null) {
        clusters.push(currentCluster);
      }
      
      currentCluster = {
        startTime: killScreen.timeInSeconds,
        endTime: killScreen.timeInSeconds,
        detections: [killScreen],
        averageConfidence: killScreen.confidence,
        peakConfidence: killScreen.confidence
      };
    } else {
      // 既存のクラスタに追加
      currentCluster.endTime = killScreen.timeInSeconds;
      currentCluster.detections.push(killScreen);
      currentCluster.peakConfidence = Math.max(currentCluster.peakConfidence, killScreen.confidence);
      
      // 平均信頼度を更新
      const totalConfidence = currentCluster.detections.reduce((sum, d) => sum + d.confidence, 0);
      currentCluster.averageConfidence = totalConfidence / currentCluster.detections.length;
    }
  }
  
  // 最後のクラスタを追加
  if (currentCluster !== null) {
    clusters.push(currentCluster);
  }

  // 連続検出フィルタリングと代表点選択
  const filteredKillScreens: KillScreenTimestamp[] = [];
  
  for (const cluster of clusters) {
    // 最小連続検出数をチェック
    if (cluster.detections.length >= minConsecutiveDetections) {
      // クラスタから最も信頼度の高い検出を代表として選択
      const representative = cluster.detections.reduce((best, current) => 
        current.confidence > best.confidence ? current : best
      );
      
      // 信頼度を向上（連続検出のボーナス）
      const continuityBonus = Math.min(0.1, cluster.detections.length * 0.02);
      const enhancedConfidence = Math.min(1.0, representative.confidence + continuityBonus);
      
      filteredKillScreens.push({
        ...representative,
        confidence: enhancedConfidence
      });
    }
  }

  return filteredKillScreens;
}

export function analyzeDetectionClusters(killScreens: KillScreenTimestamp[]): {
  totalClusters: number;
  averageClusterSize: number;
  maxClusterSize: number;
  clusters: KillScreenCluster[];
} {
  if (killScreens.length === 0) {
    return { totalClusters: 0, averageClusterSize: 0, maxClusterSize: 0, clusters: [] };
  }

  const sortedKillScreens = [...killScreens].sort((a, b) => a.timeInSeconds - b.timeInSeconds);
  const clusters: KillScreenCluster[] = [];
  let currentCluster: KillScreenCluster | null = null;

  for (const killScreen of sortedKillScreens) {
    if (currentCluster === null || 
        killScreen.timeInSeconds - currentCluster.endTime > 2) {
      
      if (currentCluster !== null) {
        clusters.push(currentCluster);
      }
      
      currentCluster = {
        startTime: killScreen.timeInSeconds,
        endTime: killScreen.timeInSeconds,
        detections: [killScreen],
        averageConfidence: killScreen.confidence,
        peakConfidence: killScreen.confidence
      };
    } else {
      currentCluster.endTime = killScreen.timeInSeconds;
      currentCluster.detections.push(killScreen);
      currentCluster.peakConfidence = Math.max(currentCluster.peakConfidence, killScreen.confidence);
      
      const totalConfidence = currentCluster.detections.reduce((sum, d) => sum + d.confidence, 0);
      currentCluster.averageConfidence = totalConfidence / currentCluster.detections.length;
    }
  }
  
  if (currentCluster !== null) {
    clusters.push(currentCluster);
  }

  const clusterSizes = clusters.map(c => c.detections.length);
  
  return {
    totalClusters: clusters.length,
    averageClusterSize: clusterSizes.reduce((sum, size) => sum + size, 0) / clusters.length,
    maxClusterSize: Math.max(...clusterSizes),
    clusters
  };
}