import { DetectionResult } from '../types';
import { detectGlobalRed } from '../analysis/global-red-detection';

export class KillScreenDetector {
  constructor() {}

  async detectKillScreen(imagePath: string, frameNumber: number): Promise<DetectionResult> {
    try {
      const detection = await detectGlobalRed(imagePath);
      
      return {
        isKillScreen: detection.isKillScreen,
        confidence: detection.killScore,
        frameNumber
      };
    } catch (error) {
      console.error(`Error analyzing frame ${frameNumber}:`, error);
      return {
        isKillScreen: false,
        confidence: 0,
        frameNumber
      };
    }
  }

  async batchDetect(imagePaths: string[]): Promise<DetectionResult[]> {
    const results: DetectionResult[] = [];
    
    console.log(`🔍 ${imagePaths.length} フレームを分析中...`);
    
    for (let i = 0; i < imagePaths.length; i++) {
      const imagePath = imagePaths[i];
      const frameNumber = i;
      
      const result = await this.detectKillScreen(imagePath, frameNumber);
      results.push(result);
      
      // 進捗表示
      if ((i + 1) % 50 === 0 || i === imagePaths.length - 1) {
        console.log(`   処理済み: ${i + 1}/${imagePaths.length} フレーム`);
      }
    }
    
    return results;
  }
}