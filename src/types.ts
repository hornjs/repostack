export type RepoEntry = {
  name: string;
  path: string;
  source: string;
  branch: string;
  tags?: string[];
};

export type ViewEntry = {
  repos?: string[];
  tags?: string[];
};

export type ShellConfig = string | {
  windows?: string;
  macos?: string;
  linux?: string;
};

export type UserConfig = {
  repos: Record<string, Partial<RepoEntry>>;
};

export type ScriptEntry = {
  command: string;
  repos?: string[];
  view?: string;
  tags?: string[];
};

export type RepostackConfig = {
  version: 1;
  settings: {
    shell?: ShellConfig;
    concurrency: number;
    continueOnError: boolean;
  };
  repos: RepoEntry[];
  views: Record<string, ViewEntry>;
  scripts: Record<string, ScriptEntry>;
  users?: Record<string, UserConfig>;
};

export type RepostackLock = {
  version: 1;
  checksum?: string;
  repos: Record<string, {
    path: string;
    source: string;
    branch: string;
    revision: string;
  }>;
};
