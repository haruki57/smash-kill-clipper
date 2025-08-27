import { Command } from 'commander';
import { ProcessingOptions } from './types';
import { isVideoFile, generateOutputPath } from './utils/file';

export function createCLI(): Command {
  const program = new Command();

  program
    .name('smash-clip')
    .description('Extract kill-screen moments from Smash Bros videos')
    .version('1.0.0');

  program
    .argument('<input>', 'Input video file path')
    .option('-o, --output <path>', 'Output video file path')
    .option('-b, --before <seconds>', 'Seconds to include before kill-screen (default: 3)', '3')
    .option('-a, --after <seconds>', 'Seconds to include after kill-screen (default: 2)', '2')
    .option('-t, --threshold <value>', 'Confidence threshold for detection (0-1, default: 0.7)', '0.7')
    .option('--dry-run', 'Show detected timestamps without creating output video', false)
    .action(async (input: string, options: any) => {
      // この処理はindex.tsで実行される
    });

  return program;
}

async function validateAndProcessOptions(input: string, options: any): Promise<ProcessingOptions> {
  if (!(await isVideoFile(input))) {
    throw new Error(`Input file is not a valid video file: ${input}`);
  }

  const beforeSeconds = parseFloat(options.before);
  const afterSeconds = parseFloat(options.after);
  const confidenceThreshold = parseFloat(options.threshold);

  if (isNaN(beforeSeconds) || beforeSeconds < 0) {
    throw new Error('Before seconds must be a positive number');
  }

  if (isNaN(afterSeconds) || afterSeconds < 0) {
    throw new Error('After seconds must be a positive number');
  }

  if (isNaN(confidenceThreshold) || confidenceThreshold < 0 || confidenceThreshold > 1) {
    throw new Error('Confidence threshold must be between 0 and 1');
  }

  const outputPath = options.output || generateOutputPath(input);

  return {
    inputPath: input,
    outputPath,
    beforeSeconds,
    afterSeconds,
    confidenceThreshold
  };
}