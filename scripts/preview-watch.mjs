import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

// A single polling loop avoids macOS file-watcher limits and never opens one
// persistent descriptor per source file. Ignore editor/system temporary files.
export async function watchPreviewFiles({ directories = [], files = [], onChange, onError = console.error, intervalMs = 1000 }) {
  let stopped = false, busy = false;
  async function fingerprint() {
    const entries = [];
    async function visit(file, recursive) {
      try {
        const info = await stat(file);
        if (recursive && info.isDirectory()) {
          for (const entry of (await readdir(file, { withFileTypes: true })).sort((a,b)=>a.name.localeCompare(b.name))) {
            if (!entry.name.startsWith('.') && !entry.isSymbolicLink()) await visit(path.join(file,entry.name),true);
          }
        } else entries.push(`${file}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`);
      } catch (error) { if (error.code === 'ENOENT') entries.push(`${file}:missing`); else throw error; }
    }
    for (const directory of directories) await visit(directory,true);
    for (const file of files) await visit(file,false);
    return entries.join('\n');
  }
  let previous = await fingerprint();
  const timer = setInterval(async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      const next = await fingerprint();
      if (!stopped && next !== previous) { previous = next; onChange(); }
    } catch (error) { if (!stopped) onError(error); }
    finally { busy = false; }
  }, intervalMs);
  return { close() { stopped = true; clearInterval(timer); } };
}
