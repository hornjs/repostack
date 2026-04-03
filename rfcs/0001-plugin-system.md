# RFC: Repostack 插件系统

**状态：** 草稿  
**作者：** @hornjs  
**创建时间：** 2026-04-03  
**相关议题：** 无

---

## 1. 摘要

为 `repostack` 引入一套基于配置的插件系统，允许用户在不修改核心代码的前提下扩展 CLI 命令、拦截生命周期事件（尤其是 `run` 命令），并修改仓库解析行为。

---

## 2. 动机

目前 `repostack` 存在多个"已预留但未实现"的扩展点：

- `repostack.yaml` 中的 `commands` 字段虽然已在文档中说明，但缺乏执行引擎。
- `run` 命令内部存在 `onRepoStart` / `onRepoDone` 回调，但它们仅用于 CLI 的 spinner 输出，未向终端用户暴露。
- 团队无法在不修改 `src/cli.ts` 的情况下添加与自身技术栈强相关的自定义工作流（例如 `deploy`、`test-matrix`、`changeset-check`）。

插件系统可以在保持核心代码精简稳定的同时，解锁社区与团队的扩展能力。

---

## 3. 目标

1. **配置驱动激活：** 插件在 `repostack.yaml` 中声明，启动时自动加载。
2. **最小侵入式改动：** 现有命令无需重写，Hook 采用增量方式注入。
3. **同时支持本地与 npm 包：** 既可以是文件路径（`./plugins/xxx`），也可以是 npm 包（`repostack-plugin-xxx` 或带作用域的包）。
4. **类型安全：** 提供 `definePlugin()` 辅助函数，并发布 TypeScript 类型声明。
5. **向后兼容：** 不包含 `plugins` 字段的 `repostack.yaml` 行为与现在完全一致。

## 4. 非目标

1. **动态插件市场 / 注册中心：** 不构建包管理器或插件商店。
2. **进程级插件隔离：** 插件与 CLI 运行在同一个 Node.js 进程中（出于简洁与性能考虑）。
3. **UI 渲染插件：** v1 版本不提供自定义 TUI 或 ncurses 渲染 API。
4. **覆盖内置命令：** 内置命令（`init`、`run`、`sync` 等）保持不可变；插件只能**新增**命令。

---

## 5. 设计方案

### 5.1. 配置 Schema

```yaml
version: 1

plugins:
  # npm 包（从项目根目录出发，使用 Node.js 模块解析规则）
  - name: repostack-plugin-pnpm
    options:
      recursive: true

  # 本地文件或目录
  - path: ./plugins/deploy
    options:
      env: production

  # 官方插件简写（自动补全前缀 repostack-plugin-）
  - name: pnpm   # 实际解析为 repostack-plugin-pnpm

settings:
  concurrency: 4
```

**校验规则：**
- 每个条目必须且只能包含 `name` 或 `path` 之一。
- 重复的 `name` 值触发警告而非致命错误（后者覆盖前者）。
- `options` 是任意类 JSON 对象，会作为参数传给插件工厂函数。

### 5.2. 插件入口约定

插件是一个 JavaScript/TypeScript 模块，默认导出以下两者之一：

- `RepostackPlugin` 对象，或
- 工厂函数 `(options: unknown) => RepostackPlugin | Promise<RepostackPlugin>`。

```ts
// repostack-plugin-example/index.ts
import { definePlugin } from "repostack";

export default definePlugin((options) => ({
  name: "example",
  onConfigLoaded({ config }) {
    // 修改或校验配置
    return config;
  },
}));
```

### 5.3. Hook 生命周期

Hook 按 `repostack.yaml` 中声明的**顺序**依次调用。

```
main()
  ├── loadConfig()
  ├── 解析并加载 plugins
  ├── hook: onConfigLoaded          （按顺序，每个插件接收上一个插件的返回结果）
  ├── createCLI()
  ├── 注册内置命令
  ├── hook: onRegisterCommands      （按顺序）
  ├── 解析 argv
  ├── 若命令为 "run"
  │     ├── 解析 repos
  │     ├── hook: onReposResolved   （按顺序）
  │     ├── 遍历每个 repo
  │     │     ├── hook: onRunBefore  （按顺序；可跳过或重写命令）
  │     │     ├── 执行 shell
  │     │     └── hook: onRunAfter   （按顺序）
  │     └── 完成
  └── 退出
```

---

## 6. 详细 API

### 6.1. 插件接口

```ts
export interface RepostackPlugin {
  /** 唯一标识符，用于日志输出与去重。 */
  name: string;

  /**
   * 在 `repostack.yaml` 加载完成后立即调用。
   * 返回值将替换 config，供后续所有操作使用。
   */
  onConfigLoaded?(ctx: {
    root: string;
    config: RepostackConfig;
  }): RepostackConfig | Promise<RepostackConfig>;

  /**
   * 在内置命令注册完毕后调用。
   * 插件可通过 `cac` 实例新增命令。
   */
  onRegisterCommands?(ctx: {
    cli: CAC;
    root: string;
    config: RepostackConfig;
  }): void | Promise<void>;

  /**
   * 在仓库选择（`--repos`、`--view`、`--tags`）解析完成后调用。
   * 返回值将替换仓库列表。
   */
  onReposResolved?(ctx: {
    root: string;
    config: RepostackConfig;
    repos: RepoEntry[];
    view?: string;
  }): RepoEntry[] | Promise<RepoEntry[]>;

  /**
   * 在具体仓库执行 shell 命令之前调用。
   * 返回 `{ skip: true }` 可跳过执行。
   * 返回 `{ command: "..." }` 可重写命令字符串。
   */
  onRunBefore?(ctx: {
    root: string;
    config: RepostackConfig;
    repo: RepoEntry;
    command: string;
    shell: string;
  }):
    | { skip?: boolean; command?: string }
    | Promise<{ skip?: boolean; command?: string }>;

  /**
   * 在具体仓库执行 shell 命令之后调用（无论成功或失败）。
   */
  onRunAfter?(ctx: {
    root: string;
    config: RepostackConfig;
    repo: RepoEntry;
    command: string;
    shell: string;
    exitCode: number;
    stdout: string;
    stderr: string;
  }): void | Promise<void>;
}
```

### 6.2. 辅助函数：`definePlugin()`

```ts
export function definePlugin<T = unknown>(
  factory: (options: T) => RepostackPlugin | Promise<RepostackPlugin>
): (options: T) => Promise<RepostackPlugin> {
  return async (options) => {
    const plugin = await factory(options);
    if (!plugin.name || typeof plugin.name !== "string") {
      throw new Error("Plugin must export a 'name' string");
    }
    return plugin;
  };
}
```

该辅助函数用于校验插件形状，并为 IDE 提供完整的类型推断与自动补全。

---

## 7. 通过插件实现命令别名

`repostack.yaml` 中现有的 `commands` 字段：

```yaml
commands:
  build: { command: "pnpm build" }
```

建议在未来**弃用**，改由第一方插件或内置的别名解析机制替代。插件可以更干净地实现相同能力：

```ts
export default definePlugin((options) => ({
  name: "alias",
  onRegisterCommands({ cli, config }) {
    for (const [alias, { command }] of Object.entries(config.commands || {})) {
      cli.command(alias, `Alias for: ${command}`).action(async () => {
        // 委托给 run 内部逻辑
      });
    }
  },
}));
```

**待决策：** `commands` 的内置支持是否应完全移除，仅作为核心语法糖保留？

---

## 8. 安全模型

由于插件与 CLI 运行在同一进程，并拥有相同的文件系统访问权限：

1. **不自动安装：** 若声明了某个 `name` 插件但尚未安装，`repostack` 应快速失败并给出明确的 `ERR_MODULE_NOT_FOUND` 错误。我们**不会**自动执行 `npm install`。
2. **本地路径限制：** `path` 插件必须位于项目根目录（或其子目录）内。超出根目录的绝对路径将被拒绝。
3. **审计追踪：** `repostack doctor` 应列出当前激活的插件及其解析后的绝对路径。
4. **禁止远程 URL：** `path: https://...` 明确超出范围，以避免从网络直接执行任意代码。

---

## 9. 错误处理与诊断

- **插件加载失败：** 打印插件名及底层的 `ERR_MODULE_NOT_FOUND` 或语法错误，然后以退出码 `1` 终止。
- **Hook 异常：** 若某个 Hook 抛出异常，中止当前操作并打印堆栈。对于 `onRunBefore`/`onRunAfter`，即使 `settings.continueOnError` 为 `true`，**插件本身的异常**也应直接中止（需区分插件 bug 与命令执行失败）。
- **调试模式：** 使用 `repostack -d` 时，打印每个 Hook 的调用时机与耗时。

---

## 10. 向后兼容性

- `plugins` 在 `repostack.yaml` 中为可选字段。
- 现有的 `commands` 字段继续被解析，但在做出单独决策之前其执行行为保持不变。
- `repostack.lock.yaml` 不做任何修改。

---

## 11. 待决策问题

1. **插件加载顺序：** `name` 插件是否应始终排在 `path` 插件之前执行，还是完全遵循声明顺序即可？
2. **异步加载与缓存：** 在 watch 模式下，是否应在多次命令调用之间缓存已解析的插件模块？
3. **配置校验集成：** 是否允许插件注册自定义的 Zod/json-schema 校验规则，以验证 `repostack.yaml` 的某些字段？
4. **Workspace 感知：** 若 `repostack` 未来支持嵌套 stack（monorepo 里的多仓组合），插件是否应仅作用于最近的 `repostack.yaml`？
5. **内置命令抽象层：** 是否应提供 `registerCommand(name, handler)` 抽象，隐藏 `cac` API，以便未来更换 CLI 框架时不会影响插件生态？

---

## 12. 未来扩展（v1 之外）

- **Hook: `onSyncBefore` / `onSyncAfter`** —— 用于同步前校验或同步后通知。
- **Hook: `onPullBefore` / `onPullAfter`** —— 用于克隆后自动执行环境初始化（例如 `pnpm install`）。
- **插件组合：** 支持一个 meta-plugin 动态加载其他插件。
- **配置 Schema 扩展：** 插件声明自身消费 `repostack.yaml` 中的哪些字段。

---

## 13. 附录：包含插件的完整 `repostack.yaml` 示例

```yaml
version: 1

plugins:
  - name: repostack-plugin-pnpm
    options:
      recursive: true

  - path: ./plugins/deploy
    options:
      target: vercel

settings:
  concurrency: 4
  continueOnError: false
  shell: /bin/zsh

repos:
  - name: web
    path: web
    source: git@github.com:hornjs/web.git
    tags: [app, frontend]

  - name: api
    path: api
    source: git@github.com:hornjs/api.git
    tags: [app, backend]

views:
  app:
    tags: [app]
```

---

*欢迎通过提交 PR 修改本文档，或在仓库 Discussion 中留言，对本 RFC 进行讨论与迭代。*
