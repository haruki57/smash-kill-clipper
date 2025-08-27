import fs from 'fs-extra';
import path from 'path';

export async function ensureDirectoryExists(dirPath: string): Promise<void> {
  await fs.ensureDir(dirPath);
}

export async function isVideoFile(filePath: string): Promise<boolean> {
  const videoExtensions = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm'];
  const ext = path.extname(filePath).toLowerCase();
  
  if (!videoExtensions.includes(ext)) {
    return false;
  }
  
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

export function generateOutputPath(inputPath: string, suffix = '_kill_clips'): string {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}${suffix}${parsed.ext}`);
}

export async function cleanupDirectory(dirPath: string): Promise<void> {
  try {
    await fs.remove(dirPath);
  } catch (error) {
    console.warn(`Warning: Could not cleanup directory ${dirPath}:`, error);
  }
}