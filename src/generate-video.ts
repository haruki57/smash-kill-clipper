#!/usr/bin/env node

import { Command } from 'commander';
import { VideoProcessor } from './video/processor';
import { DetectionProject } from './types/detection';
import { VideoSegment } from './types';
import { promises as fs } from 'fs';
import path from 'path';

const program = new Command();

program
  .name('generate-video')
  .description('検出結果JSONファイルから動画を生成')
  .version('1.0.0');

program
  .argument('<detection-file>', 'Detection JSON file path')
  .option('-i, --input <path>', 'Override input video path')
  .option('-o, --output <path>', 'Output video file path')
  .option('-b, --before <seconds>', 'Override seconds to include before kill-screen')
  .option('-a, --after <seconds>', 'Override seconds to include after kill-screen')
  .option('--preview', 'Show what will be generated without creating video', false)
  .action(async (detectionFile: string, options: any) => {
    try {
      await generateVideo(detectionFile, options);
    } catch (error) {
      console.error('❌ エラーが発生しました:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

async function generateVideo(detectionFile: string, options: any): Promise<void> {
  console.log('🎬 JSONファイルから動画を生成します...');
  console.log(`📂 検出ファイル: ${detectionFile}`);
  
  // JSONファイルを読み込み
  const projectData = await fs.readFile(detectionFile, 'utf-8');
  const project: DetectionProject = JSON.parse(projectData);
  
  console.log(`\n📊 プロジェクト情報:`);
  console.log(`   作成日時: ${new Date(project.createdAt).toLocaleString('ja-JP')}`);
  console.log(`   入力動画: ${path.basename(project.inputVideo)}`);
  console.log(`   検出数: ${project.detections.length}`);
  console.log(`   有効検出数: ${project.detections.filter(d => d.enabled).length}`);
  
  // 入力動画パスの決定
  const inputVideoPath = options.input || project.inputVideo;
  
  // 出力パスの決定
  const outputPath = options.output || detectionFile.replace('.json', '_clips.mp4');
  
  // 設定の決定（コマンドラインオプション > プロジェクト設定）
  const beforeSeconds = options.before ? parseFloat(options.before) : project.processingOptions.beforeSeconds;
  const afterSeconds = options.after ? parseFloat(options.after) : project.processingOptions.afterSeconds;
  
  // 有効な検出のみを使用
  const enabledDetections = project.detections.filter(d => d.enabled);
  
  if (enabledDetections.length === 0) {
    console.log('⚠️  有効な検出がありません。JSONファイルを確認してください。');
    return;
  }
  
  console.log(`\n🎯 生成される動画セグメント:`);
  enabledDetections.forEach((detection, index) => {
    const minutes = Math.floor(detection.timeInSeconds / 60);
    const seconds = Math.floor(detection.timeInSeconds % 60);
    const startTime = Math.max(0, detection.timeInSeconds - beforeSeconds);
    const endTime = detection.timeInSeconds + afterSeconds;
    const duration = endTime - startTime;
    
    console.log(`  ${index + 1}. ${minutes}:${seconds.toString().padStart(2, '0')} `+
                `(${Math.round(detection.confidence * 100)}%) - ${duration}秒`);
    if (detection.note) {
      console.log(`     メモ: ${detection.note}`);
    }
  });
  
  console.log(`\n📝 動画生成設定:`);
  console.log(`   入力動画: ${inputVideoPath}`);
  console.log(`   出力動画: ${outputPath}`);
  console.log(`   前方秒数: ${beforeSeconds}秒`);
  console.log(`   後方秒数: ${afterSeconds}秒`);
  console.log(`   総セグメント数: ${enabledDetections.length}`);
  console.log(`   予想総時間: ${Math.round(enabledDetections.length * (beforeSeconds + afterSeconds))}秒`);
  
  if (options.preview) {
    console.log('\n🔍 プレビューモードのため、ここで終了します。');
    return;
  }
  
  // 動画生成
  const videoProcessor = new VideoProcessor();
  
  try {
    console.log('\n✂️  動画セグメントを作成中...');
    
    // 検出結果をVideoSegment形式に変換
    const segments: VideoSegment[] = enabledDetections.map(detection => ({
      startTime: Math.max(0, detection.timeInSeconds - beforeSeconds),
      endTime: detection.timeInSeconds + afterSeconds,
      duration: beforeSeconds + afterSeconds
    }));
    
    console.log('🎬 動画を結合中...');
    await videoProcessor.extractAndConcatenateSegments(
      inputVideoPath,
      segments,
      outputPath
    );
    
    console.log(`\n✅ 動画生成完了！`);
    console.log(`📁 出力ファイル: ${outputPath}`);
    
    // 統計情報
    const totalDuration = segments.reduce((sum, seg) => sum + seg.duration, 0);
    console.log(`\n📊 生成統計:`);
    console.log(`   セグメント数: ${segments.length}`);
    console.log(`   総再生時間: ${Math.floor(totalDuration / 60)}:${Math.floor(totalDuration % 60).toString().padStart(2, '0')}`);
    
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