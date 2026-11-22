import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { STATE_DIR } from '../paths.js';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { buildFullContainer, type Container, type OrchestratorEvent } from '@oxgeneral/orch';

const execFileAsync = promisify(execFile);

/**
 * How many recent `OrchestratorEvent`s each activated workspace keeps in memory, replayed to a
 * newly-opened SSE connection before it starts receiving live events. `@oxgeneral/orch` has no
 * persisted general-purpose event log (only per-run output logs via `RunService.readEvents*`,
 * which are unrelated) — without this, the Activity tab shows nothing at all unless the viewer
 * personally triggers a new action *while the tab happens to be open*, which is what kept making
 * an already-fixed live feed (see events.ts) look "still broken" to anyone just opening the tab
 * to look. This buffer starts filling the moment a workspace is activated, independent of whether
 * any Activity tab is open, so switching to the tab later still shows what already happened.
 */
const EVENT_BACKLOG_LIMIT = 200;

/**
 * `buildFullContainer(context: CliContext)` takes a plain object — `CliContext` itself is
 * declared in the library's source but NOT part of its public `index.ts` export list (confirmed
 * against the installed package's `dist/index.d.ts`: the `export { ... }` barrel omits it). We
 * mirror its shape locally rather than importing a type that doesn't exist on the public surface.
 */
interface CliContext {
  projectRoot: string;
  json: boolean;
  quiet: boolean;
  noColor: boolean;
  ascii: boolean;
}

/**
 * A registered workspace: a local folder this server can operate ORCH on.
 * Only `id` / `projectRoot` / `label` are persisted — the live `Container` is rebuilt
 * in-memory on activation, never serialized.
 */
export interface WorkspaceRecord {
  id: string;
  projectRoot: string;
  label: string;
  addedAt: string;
}

export interface BrowseDirectoryItem {
  name: string;
  path: string;
  isDir: true;
  hasOrchestry: boolean;
}

export interface BrowseDirectoryResult {
  currentPath: string;
  parentPath: string | null;
  items: BrowseDirectoryItem[];
}

interface WorkspaceEntry {
  record: WorkspaceRecord;
  container?: Container;
  containerPromise?: Promise<Container>;
  /** Oldest-first ring buffer of the last `EVENT_BACKLOG_LIMIT` events, see constant above. */
  recentEvents: OrchestratorEvent[];
}

interface PersistedState {
  workspaces: WorkspaceRecord[];
}

const STATE_FILE = join(STATE_DIR, 'workspaces.json');

/**
 * Server-side registry of known workspaces (local ORCH project folders).
 *
 * Distinct from ORCH's own internal `IWorkspaceManager` (git worktree management inside a
 * single project's `.orchestry/`) — this one maps workspace ids to project roots and
 * lazily-built `Container` instances, and persists the recent-folders list (paths + labels
 * only, never the live container) across server restarts.
 */
export class WorkspaceManager {
  private readonly entries = new Map<string, WorkspaceEntry>();
  private loaded = false;

  /** Load persisted workspace list from ~/.orch-webui/workspaces.json, if present. */
  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await readFile(STATE_FILE, 'utf-8');
      const state = JSON.parse(raw) as PersistedState;
      for (const record of state.workspaces ?? []) {
        this.entries.set(record.id, { record, recentEvents: [] });
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  private async persist(): Promise<void> {
    await mkdir(STATE_DIR, { recursive: true });
    const state: PersistedState = {
      workspaces: [...this.entries.values()].map((e) => e.record),
    };
    await writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  }

  list(): WorkspaceRecord[] {
    return [...this.entries.values()].map((e) => e.record);
  }

  get(id: string): WorkspaceRecord | undefined {
    return this.entries.get(id)?.record;
  }

  /** Register a new workspace folder (does not build a Container yet — see activate()). */
  async register(projectRoot: string, label?: string): Promise<WorkspaceRecord> {
    if (!existsSync(projectRoot)) {
      throw new Error(`Folder does not exist: ${projectRoot}`);
    }
    const existing = [...this.entries.values()].find((e) => e.record.projectRoot === projectRoot);
    if (existing) return existing.record;

    const record: WorkspaceRecord = {
      id: `ws_${randomUUID().slice(0, 8)}`,
      projectRoot,
      label: label ?? projectRoot.split('/').filter(Boolean).pop() ?? projectRoot,
      addedAt: new Date().toISOString(),
    };
    this.entries.set(record.id, { record, recentEvents: [] });
    await this.persist();
    return record;
  }

  async forget(id: string): Promise<void> {
    this.entries.delete(id);
    await this.persist();
  }

  /** Whether the workspace's folder has an initialized `.orchestry/` (vs needing `orch init`). */
  isInitialized(id: string): boolean {
    const record = this.get(id);
    if (!record) return false;
    return existsSync(join(record.projectRoot, '.orchestry'));
  }

  /** Initialize an already-registered folder using ORCH's CLI-only init command. */
  async initialize(id: string): Promise<{ alreadyInitialized: boolean }> {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Unknown workspace: ${id}`);
    if (this.isInitialized(id)) return { alreadyInitialized: true };

    // The package's `exports` map only declares an `import` condition for ".", so a CJS-style
    // `require.resolve('@oxgeneral/orch')` throws ERR_PACKAGE_PATH_NOT_EXPORTED even though the
    // package is installed (confirmed against the real installed package, not just in theory).
    // `import.meta.resolve` honors the `import` condition and resolves to dist/index.js; `init`
    // is CLI-only so we invoke its sibling dist/cli.js (per the package's own `bin` mapping)
    // rather than deep-importing an unexported API.
    const indexUrl = import.meta.resolve('@oxgeneral/orch');
    const cliPath = join(dirname(fileURLToPath(indexUrl)), 'cli.js');
    await execFileAsync(process.execPath, [cliPath, 'init'], {
      cwd: entry.record.projectRoot,
      maxBuffer: 1024 * 1024,
    });
    return { alreadyInitialized: false };
  }

  /** List immediate child directories for the server-side folder picker. */
  async browseDirectory(requestedPath?: string): Promise<BrowseDirectoryResult> {
    const currentPath = await realpath(requestedPath || homedir());
    const currentStat = await stat(currentPath);
    if (!currentStat.isDirectory()) throw new Error(`Path is not a directory: ${currentPath}`);

    const entries = await readdir(currentPath, { withFileTypes: true });
    const items = (await Promise.all(entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry): Promise<BrowseDirectoryItem> => {
        const path = join(currentPath, entry.name);
        return {
          name: entry.name,
          path,
          isDir: true,
          hasOrchestry: existsSync(join(path, '.orchestry')),
        };
      })))
      .sort((a, b) => a.name.localeCompare(b.name));

    const parentPath = dirname(currentPath);
    return {
      currentPath,
      parentPath: parentPath === currentPath ? null : parentPath,
      items,
    };
  }

  /**
   * Build (or return the cached) full `Container` for a workspace. Concurrent calls while a
   * build is in flight share the same promise instead of racing two `buildFullContainer` calls.
   */
  async activate(id: string): Promise<Container> {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Unknown workspace: ${id}`);
    if (entry.container) return entry.container;
    if (entry.containerPromise) return entry.containerPromise;

    const context: CliContext = {
      projectRoot: entry.record.projectRoot,
      json: true,
      quiet: true,
      noColor: true,
      ascii: true,
    };

    entry.containerPromise = buildFullContainer(context)
      .then((container) => {
        entry.container = container;
        entry.containerPromise = undefined;
        // Start recording into the backlog immediately on activation — independent of whether
        // any SSE client is connected — so events that happen before the Activity tab is ever
        // opened are still there to replay once it is. See EVENT_BACKLOG_LIMIT doc comment.
        container.eventBus.onAny((event) => {
          entry.recentEvents.push(event);
          if (entry.recentEvents.length > EVENT_BACKLOG_LIMIT) entry.recentEvents.shift();
        });
        return container;
      })
      .catch((err) => {
        entry.containerPromise = undefined;
        throw err;
      });

    return entry.containerPromise;
  }

  /** Oldest-first snapshot of recent events for this workspace, for replay to a newly-opened
   * SSE connection. Empty if the workspace was never activated or nothing has happened yet. */
  getRecentEvents(id: string): OrchestratorEvent[] {
    return this.entries.get(id)?.recentEvents ?? [];
  }

  /** Return an already-built container without triggering a build (used by routes that need
   * a live container and should 404/409 rather than lazily activate — e.g. the SSE stream). */
  getActiveContainer(id: string): Container | undefined {
    return this.entries.get(id)?.container;
  }
}

export const workspaceManager = new WorkspaceManager();
