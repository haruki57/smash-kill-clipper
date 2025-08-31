#!/usr/bin/env node

import { Command } from 'commander';
import { VideoProcessor } from './video/processor';
import { KillScreenDetector } from './detection/detector';
import { deduplicateKillScreens, analyzeDetectionClusters } from './utils/deduplication';
import { DetectionProject, DetectionEntry } from './types/detection';
import { promises as fs } from 'fs';
import path from 'path';

const program = new Command();

program
  .name('detect-only')
  .description('Kill-screen検出のみを実行し、結果をJSONファイルに保存')
  .version('1.0.0');

program
  .argument('<input>', 'Input video file path')
  .option('-o, --output <path>', 'Output JSON file path')
  .option('-t, --threshold <value>', 'Confidence threshold (0-1, default: 0.8)', '0.8')
  .option('-b, --before <seconds>', 'Seconds to include before kill-screen (default: 3)', '3')
  .option('-a, --after <seconds>', 'Seconds to include after kill-screen (default: 2)', '2')
  .option('--min-detections <value>', 'Minimum consecutive detections (default: 2)', '2')
  .option('--save-images', 'Save detected kill-screen images to output directory')
  .option('--scale-width <pixels>', 'Scale frame width for faster processing (default: 1280)', '1280')
  .action(async (input: string, options: any) => {
    try {
      await detectOnly(input, options);
    } catch (error) {
      console.error('❌ エラーが発生しました:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

async function detectOnly(inputPath: string, options: any): Promise<void> {
  console.log('🔍 Kill-Screen 検出を開始します...');
  console.log(`📂 入力動画: ${inputPath}`);
  
  const videoProcessor = new VideoProcessor();
  const detector = new KillScreenDetector();
  
  const confidenceThreshold = parseFloat(options.threshold);
  const beforeSeconds = parseFloat(options.before);
  const afterSeconds = parseFloat(options.after);
  const minDetections = parseInt(options.minDetections);
  const scaleWidth = parseInt(options.scaleWidth);
  
  const outputPath = options.output || inputPath.replace(/\.[^/.]+$/, '_detections.json');
  
  try {
    // フレーム抽出
    console.log(`📹 動画からフレームを抽出中... (${scaleWidth}px幅にスケーリング)`);
    const framePaths = await videoProcessor.extractFrames(inputPath, 'temp/frames', scaleWidth);
    console.log(`✅ ${framePaths.length} フレームを抽出しました`);

    // 検出実行
    console.log('🔍 kill-screen を検出中...');
    const detectionResults = await detector.batchDetect(framePaths);
    
    const rawKillScreens = detectionResults
      .filter(result => result.confidence >= confidenceThreshold)
      .map((result) => {
        const frameRate = 5;
        return {
          frameNumber: result.frameNumber,
          timeInSeconds: result.frameNumber * (1 / frameRate),
          confidence: result.confidence
        };
      });

    console.log(`🔍 初期検出: ${rawKillScreens.length} 個の kill-screen候補`);
    
    // クラスタ分析
    const clusterAnalysis = analyzeDetectionClusters(rawKillScreens);
    console.log(`📊 検出クラスタ分析:`);
    console.log(`   - 総クラスタ数: ${clusterAnalysis.totalClusters}`);
    console.log(`   - 平均クラスタサイズ: ${clusterAnalysis.averageClusterSize.toFixed(1)}`);
    console.log(`   - 最大クラスタサイズ: ${clusterAnalysis.maxClusterSize}`);
    
    // 重複除去（設定を緩和）
    const finalKillScreens = deduplicateKillScreens(rawKillScreens, 5, 1); // 5秒窓、最小1検出
    console.log(`🎯 重複除去後: ${finalKillScreens.length} 個のユニークな kill-screen を検出しました`);

    // 検出された画像を保存（オプション）
    if (options.saveImages && finalKillScreens.length > 0) {
      const imageOutputDir = path.join(path.dirname(outputPath), 'detected_kill_screens');
      await fs.mkdir(imageOutputDir, { recursive: true });
      
      console.log(`\n📸 検出された画像を保存中: ${imageOutputDir}`);
      
      for (const killScreen of finalKillScreens) {
        if (killScreen.frameNumber < framePaths.length) {
          const sourceFramePath = framePaths[killScreen.frameNumber];
          const minutes = Math.floor(killScreen.timeInSeconds / 60);
          const seconds = Math.floor(killScreen.timeInSeconds % 60);
          const confidence = Math.round(killScreen.confidence * 100);
          
          const imageFileName = `kill_screen_${minutes}m${seconds}s_conf${confidence}.png`;
          const destPath = path.join(imageOutputDir, imageFileName);
          
          try {
            await fs.copyFile(sourceFramePath, destPath);
            console.log(`  ✅ 保存: ${imageFileName}`);
          } catch (error) {
            console.error(`  ❌ エラー: ${imageFileName}`, error);
          }
        }
      }
    }

    // JSON形式で保存
    const detections: DetectionEntry[] = finalKillScreens.map((killScreen, index) => ({
      id: index + 1,
      timeInSeconds: killScreen.timeInSeconds,
      frameNumber: killScreen.frameNumber,
      confidence: killScreen.confidence,
      enabled: true,
      note: `自動検出 (信頼度: ${Math.round(killScreen.confidence * 100)}%)`
    }));

    const project: DetectionProject = {
      version: '1.0.0',
      inputVideo: path.resolve(inputPath),
      createdAt: new Date().toISOString(),
      processingOptions: {
        confidenceThreshold,
        beforeSeconds,
        afterSeconds,
        frameRate: 5,
        scaleWidth
      },
      statistics: {
        totalFrames: framePaths.length,
        rawDetections: rawKillScreens.length,
        clusteredDetections: clusterAnalysis.totalClusters,
        finalDetections: finalKillScreens.length,
        averageClusterSize: clusterAnalysis.averageClusterSize,
        maxClusterSize: clusterAnalysis.maxClusterSize
      },
      detections
    };

    await fs.writeFile(outputPath, JSON.stringify(project, null, 2), 'utf-8');
    
    console.log(`\n✅ 検出結果を保存しました: ${outputPath}`);
    console.log(`\n📋 検出されたタイムスタンプ:`);
    detections.forEach((detection) => {
      const minutes = Math.floor(detection.timeInSeconds / 60);
      const seconds = Math.floor(detection.timeInSeconds % 60);
      console.log(`  ${detection.id}. ${minutes}:${seconds.toString().padStart(2, '0')} (信頼度: ${Math.round(detection.confidence * 100)}%)`);
    });
    
    console.log(`\n💡 次のステップ:`);
    console.log(`   1. JSONファイルを確認・編集: ${outputPath}`);
    if (options.saveImages && finalKillScreens.length > 0) {
      console.log(`   2. 検出された画像を確認: ${path.join(path.dirname(outputPath), 'detected_kill_screens')}`);
      console.log(`   3. 動画を生成: npm run generate "${outputPath}"`);
    } else {
      console.log(`   2. 動画を生成: npm run generate "${outputPath}"`);
      console.log(`   ヒント: --save-images オプションで検出画像を保存できます`);
    }
    
  } finally {
    console.log('🧹 一時ファイルをクリーンアップ中...');
    await videoProcessor.cleanup();
  }
}

if (require.main === module) {
  program.parseAsync().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}