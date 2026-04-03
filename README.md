# repostack

`repostack` 是一个多仓开发目录编排工具。

它不把独立仓库合并成真正的 monorepo，而是为并排放置的一组 Git 仓库提供更接近 monorepo 的日常开发体验。

## Commands

- `repostack init` - Initialize stack
- `repostack use <path>` - Add repo to stack
- `repostack remove <name>` - Remove repo from stack
- `repostack pull` - Clone missing repos
- `repostack sync` - Sync to locked revisions (with dirty-repo protection)
- `repostack list` - Show repo status
- `repostack run [options] -- <command>` - Run command across repos (interactive repo selection in TTY)
- `repostack snapshot` - Record current state
- `repostack users [command]` - Manage user configuration (interactive menu in TTY)
- `repostack doctor` - Diagnose stack health

## Config

```yaml
version: 1

settings:
  # Shell 支持：自动检测 / 字符串 / 按平台配置
  shell:
    windows: cmd.exe
    macos: /bin/zsh
    linux: /bin/bash
  concurrency: 4
  continueOnError: false

repos:
  - name: evt
    path: evt
    source: git@github.com:hornjs/evt.git
    branch: main
    tags: [runtime, core]

views:
  runtime:
    tags: [runtime]
```
