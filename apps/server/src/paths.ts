import { homedir } from 'node:os';
import { join } from 'node:path';

/** Directory for this app's own persisted state. Overridable so tests never touch the real home. */
export const STATE_DIR = process.env.ORCH_WEBUI_STATE_DIR ?? join(homedir(), '.orch-webui');
