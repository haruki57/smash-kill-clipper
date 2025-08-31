import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
import { promises as fs } from 'fs';
import path from 'path';
import { VideoSegment, KillScreenTimestamp, ProcessingOptions } from '../types';

export class VideoProcessor {
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp');
  }

  async ensureTempDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create temp directory:', error);
    }
  }

  async extractFrames(videoPath: string, outputDir: string, scaleWidth: number = 1280): Promise<string[]> {
    await this.ensureTempDirectory();
    const frameDir = path.join(this.tempDir, 'frames');
    await fs.mkdir(frameDir, { recursive: true });

    return new Promise((resolve, reject) => {
      const framePaths: string[] = [];
      
      // 解像度スケーリング: アスペクト比維持して幅を指定サイズに
      const videoFilters = [
        'fps=5',
        `scale=${scaleWidth}:-2`  // 幅を指定、高さは自動計算（偶数に丸める）
      ];
      
      console.log(`🔧 フレーム抽出設定: ${scaleWidth}px幅にスケーリング`);
      
      ffmpeg(videoPath)
        .outputOptions(['-vf', videoFilters.join(',')])
        .output(path.join(frameDir, 'frame_%04d.png'))
        .on('end', async () => {
          try {
            const files = await fs.readdir(frameDir);
            const sortedFiles = files
              .filter(f => f.endsWith('.png'))
              .sort()
              .map(f => path.join(frameDir, f));
            console.log(`✅ ${sortedFiles.length}フレームを抽出完了 (${scaleWidth}px幅)`);
            resolve(sortedFiles);
          } catch (error) {
            reject(error);
          }
        })
        .on('error', reject)
        .run();
    });
  }

  async getVideoDuration(videoPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }
        
        const duration = metadata.format.duration;
        if (duration) {
          resolve(duration);
        } else {
          reject(new Error('Could not determine video duration'));
        }
      });
    });
  }

  async getVideoFrameRate(videoPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }
        
        const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
        if (videoStream && videoStream.r_frame_rate) {
          const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
          resolve(num / den);
        } else {
          resolve(30); // Default fallback
        }
      });
    });
  }

  createVideoSegments(timestamps: KillScreenTimestamp[], beforeSeconds: number, afterSeconds: number): VideoSegment[] {
    return timestamps.map(timestamp => ({
      startTime: Math.max(0, timestamp.timeInSeconds - beforeSeconds),
      endTime: timestamp.timeInSeconds + afterSeconds,
      duration: beforeSeconds + afterSeconds
    }));
  }

  async extractAndConcatenateSegments(
    videoPath: string,
    segments: VideoSegment[],
    outputPath: string
  ): Promise<void> {
    await this.ensureTempDirectory();
    const segmentDir = path.join(this.tempDir, 'segments');
    await fs.mkdir(segmentDir, { recursive: true });

    const segmentPaths: string[] = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const segmentPath = path.join(segmentDir, `segment_${i.toString().padStart(3, '0')}.mp4`);
      
      await new Promise<void>((resolve, reject) => {
        ffmpeg(videoPath)
          .seekInput(segment.startTime)
          .duration(segment.duration)
          .output(segmentPath)
          .videoCodec('libx264')
          .audioCodec('aac')
          .on('end', () => {
            segmentPaths.push(segmentPath);
            resolve();
          })
          .on('error', reject)
          .run();
      });
    }

    if (segmentPaths.length === 0) {
      throw new Error('No segments to concatenate');
    }

    if (segmentPaths.length === 1) {
      await fs.copyFile(segmentPaths[0], outputPath);
      return;
    }

    const concatListPath = path.join(this.tempDir, 'concat_list.txt');
    const concatList = segmentPaths.map(p => `file '${p}'`).join('\n');
    await fs.writeFile(concatListPath, concatList);

    return new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(concatListPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .videoCodec('libx264')
        .audioCodec('aac')
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', reject)
        .run();
    });
  }

  async cleanup(): Promise<void> {
    try {
      await fs.rm(this.tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to cleanup temp directory:', error);
    }
  }
}