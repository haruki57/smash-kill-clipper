#!/usr/bin/env node

import { createCLI } from './cli';
import { VideoProcessor } from './video/processor';
import { KillScreenDetector } from './detection/detector';
import { ProcessingOptions, KillScreenTimestamp } from './types';
import { deduplicateKillScreens, analyzeDetectionClusters } from './utils/deduplication';

async function main(): Promise<void> {
  const program = createCLI();
  
  program.action(async (input: string, options: any) => {
    try {
      console.log('🎮 Smash Kill Clipper を開始します...');
      
      const processingOptions: ProcessingOptions = {
        inputPath: input,
        outputPath: options.output || input.replace(/\.[^/.]+$/, '_kill_clips.mp4'),
        beforeSeconds: parseFloat(options.before || '3'),
        afterSeconds: parseFloat(options.after || '2'),
        confidenceThreshold: parseFloat(options.threshold || '0.7')
      };

      await processVideo(processingOptions, options.dryRun || false);
      
    } catch (error) {
      console.error('❌ エラーが発生しました:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

  await program.parseAsync();
}

async function processVideo(options: ProcessingOptions, dryRun: boolean): Promise<void> {
  const videoProcessor = new VideoProcessor();
  const detector = new KillScreenDetector();

  try {
    console.log('📹 動画を分析中...');
    const framePaths = await videoProcessor.extractFrames(options.inputPath, 'temp/frames');
    console.log(`✅ ${framePaths.length} フレームを抽出しました`);

    console.log('🔍 kill-screen を検出中...');
    const detectionResults = await detector.batchDetect(framePaths);
    
    const rawKillScreens = detectionResults
      .filter(result => result.isKillScreen && result.confidence >= options.confidenceThreshold)
      .map((result, index) => {
        const frameRate = 5;
        return {
          frameNumber: result.frameNumber,
          timeInSeconds: result.frameNumber * (1 / frameRate),
          confidence: result.confidence
        } as KillScreenTimestamp;
      });

    console.log(`🔍 初期検出: ${rawKillScreens.length} 個の kill-screen候補`);
    
    // 重複除去分析
    const clusterAnalysis = analyzeDetectionClusters(rawKillScreens);
    console.log(`📊 検出クラスタ分析:`);
    console.log(`   - 総クラスタ数: ${clusterAnalysis.totalClusters}`);
    console.log(`   - 平均クラスタサイズ: ${clusterAnalysis.averageClusterSize.toFixed(1)}`);
    console.log(`   - 最大クラスタサイズ: ${clusterAnalysis.maxClusterSize}`);
    
    // 重複除去と精度向上
    const killScreens = deduplicateKillScreens(rawKillScreens, 2, 2);

    console.log(`🎯 重複除去後: ${killScreens.length} 個のユニークな kill-screen を検出しました:`);
    killScreens.forEach((killScreen, index) => {
      console.log(`  ${index + 1}. 時刻: ${Math.floor(killScreen.timeInSeconds / 60)}:${String(Math.floor(killScreen.timeInSeconds % 60)).padStart(2, '0')} (信頼度: ${Math.round(killScreen.confidence * 100)}%)`);
    });

    if (killScreens.length === 0) {
      console.log('⚠️  kill-screen が検出されませんでした。閾値を下げて再試行してください。');
      return;
    }

    if (dryRun) {
      console.log('🔍 ドライランモードのため、ここで終了します。');
      return;
    }

    console.log('✂️  動画セグメントを作成中...');
    const segments = videoProcessor.createVideoSegments(
      killScreens,
      options.beforeSeconds,
      options.afterSeconds
    );

    console.log('🎬 動画を結合中...');
    await videoProcessor.extractAndConcatenateSegments(
      options.inputPath,
      segments,
      options.outputPath
    );

    console.log(`✅ 完了！ 出力ファイル: ${options.outputPath}`);
    
  } finally {
    console.log('🧹 一時ファイルをクリーンアップ中...');
    await videoProcessor.cleanup();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}