import { execFile } from 'node:child_process';

export function execFileAsync(command: string, args: string[], cwd?: string) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(command, args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        const next = new Error(stderr || stdout || error.message);
        (next as any).cause = error;
        reject(next);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}
