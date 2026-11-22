import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { STATE_DIR } from '../paths.js';
import type { CreateAgentInput } from '@oxgeneral/orch';

export type RegistryLinkKind = 'agent' | 'team';

export interface RegistryLink {
  id: string;
  kind: RegistryLinkKind;
  sourceWorkspaceId: string;
  sourceEntityId: string;
  targetWorkspaceId: string;
  targetEntityId: string;
  lastSyncedSnapshot: CreateAgentInput | Record<string, unknown>;
  lastSyncedAt: string;
}

export interface RegistrySettings {
  defaultRegistryWorkspaceId?: string;
}

interface PersistedLinks {
  links: RegistryLink[];
}

const LINKS_FILE = join(STATE_DIR, 'links.json');
const SETTINGS_FILE = join(STATE_DIR, 'settings.json');

/**
 * Persists app-level registry state. It intentionally does not live under a project's
 * `.orchestry` directory because links can span unrelated ORCH projects.
 */
export class RegistryStore {
  private links: RegistryLink[] = [];
  private settings: RegistrySettings = {};
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    this.links = await this.readLinks();
    this.settings = await this.readSettings();
  }

  listLinks(targetWorkspaceId?: string): RegistryLink[] {
    return this.links
      .filter((link) => !targetWorkspaceId || link.targetWorkspaceId === targetWorkspaceId)
      .map((link) => structuredClone(link));
  }

  findLink(sourceWorkspaceId: string, sourceEntityId: string, targetWorkspaceId: string, kind: RegistryLinkKind): RegistryLink | undefined {
    const link = this.links.find((item) => item.sourceWorkspaceId === sourceWorkspaceId
      && item.sourceEntityId === sourceEntityId
      && item.targetWorkspaceId === targetWorkspaceId
      && item.kind === kind);
    return link && structuredClone(link);
  }

  async createLink(input: Omit<RegistryLink, 'id' | 'lastSyncedAt'> & { lastSyncedAt?: string }): Promise<RegistryLink> {
    const link: RegistryLink = {
      ...input,
      id: `lnk_${randomUUID().slice(0, 12)}`,
      lastSyncedAt: input.lastSyncedAt ?? new Date().toISOString(),
      lastSyncedSnapshot: structuredClone(input.lastSyncedSnapshot),
    };
    this.links.push(link);
    await this.persistLinks();
    return structuredClone(link);
  }

  async updateLinkSnapshot(id: string, snapshot: RegistryLink['lastSyncedSnapshot']): Promise<RegistryLink | undefined> {
    const link = this.links.find((item) => item.id === id);
    if (!link) return undefined;
    link.lastSyncedSnapshot = structuredClone(snapshot);
    link.lastSyncedAt = new Date().toISOString();
    await this.persistLinks();
    return structuredClone(link);
  }

  async replaceTargetEntityId(id: string, targetEntityId: string): Promise<RegistryLink | undefined> {
    const link = this.links.find((item) => item.id === id);
    if (!link) return undefined;
    link.targetEntityId = targetEntityId;
    await this.persistLinks();
    return structuredClone(link);
  }

  getSettings(): RegistrySettings {
    return structuredClone(this.settings);
  }

  async updateSettings(settings: RegistrySettings): Promise<RegistrySettings> {
    this.settings = structuredClone(settings);
    await mkdir(STATE_DIR, { recursive: true });
    await writeFile(SETTINGS_FILE, JSON.stringify(this.settings, null, 2), 'utf-8');
    return this.getSettings();
  }

  private async readLinks(): Promise<RegistryLink[]> {
    try {
      const parsed = JSON.parse(await readFile(LINKS_FILE, 'utf-8')) as PersistedLinks;
      return Array.isArray(parsed.links) ? parsed.links : [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }

  private async readSettings(): Promise<RegistrySettings> {
    try {
      const parsed = JSON.parse(await readFile(SETTINGS_FILE, 'utf-8')) as RegistrySettings;
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw err;
    }
  }

  private async persistLinks(): Promise<void> {
    await mkdir(STATE_DIR, { recursive: true });
    await writeFile(LINKS_FILE, JSON.stringify({ links: this.links }, null, 2), 'utf-8');
  }
}

export const registryStore = new RegistryStore();
