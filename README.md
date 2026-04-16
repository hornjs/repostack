# repostack

`repostack` 是一个多仓开发目录编排工具。

它不把独立仓库合并成真正的 monorepo，而是为并排放置的一组 Git 仓库提供更接近 monorepo 的日常开发体验。

## Commands

```text
$ repostack --help
repostack/0.0.0

Usage:
  $ repostack <command> [options]

Commands:
  init                    Initialize repostack.yaml in the current directory
  use [path]              Register a repo in the current stack
  remove <name>           Remove a repo from the current stack
  doctor                  Diagnose stack configuration and health
  whoami                  Show the current user
  users [command] [name]  Manage user configuration for this stack
  pull                    Clone repos that are declared but missing locally
  sync                    Fetch and checkout revisions from the current lock file
  list                    Show the current branch, revision, and dirty state for each repo
  run [script]            Run a named script across selected repos
  snapshot                Write repostack.lock.yaml from current repo revisions

For more info, run any command with the `--help` flag:
  $ repostack init --help
  $ repostack use --help
  $ repostack remove --help
  $ repostack doctor --help
  $ repostack whoami --help
  $ repostack users --help
  $ repostack pull --help
  $ repostack sync --help
  $ repostack list --help
  $ repostack run --help
  $ repostack snapshot --help

Options:
  -d, --debug    Display orchestration debug output
  -v, --version  Display version number
  -h, --help     Display this message
```

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

scripts:
  test:
    command: pnpm test
  build:
    command: pnpm build
    view: runtime
```
