import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Isolate persisted app state (~/.orch-webui) from the developer's real home directory.
// Must run before any module that reads STATE_DIR is imported.
process.env.ORCH_WEBUI_STATE_DIR = mkdtempSync(join(tmpdir(), 'orch-webui-state-'));
process.env.NODE_ENV = 'test';
