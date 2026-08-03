import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildFullContainer, type Container } from '@oxgeneral/orch';

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

interface WorkspaceEntry {
  record: WorkspaceRecord;
  container?: Container;
  containerPromise?: Promise<Container>;
}

interface PersistedState {
  workspaces: WorkspaceRecord[];
}

const STATE_DIR = join(homedir(), '.orch-webui');
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
        this.entries.set(record.id, { record });
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
    this.entries.set(record.id, { record });
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
        return container;
      })
      .catch((err) => {
        entry.containerPromise = undefined;
        throw err;
      });

    return entry.containerPromise;
  }

  /** Return an already-built container without triggering a build (used by routes that need
   * a live container and should 404/409 rather than lazily activate — e.g. the SSE stream). */
  getActiveContainer(id: string): Container | undefined {
    return this.entries.get(id)?.container;
  }
}

export const workspaceManager = new WorkspaceManager();
