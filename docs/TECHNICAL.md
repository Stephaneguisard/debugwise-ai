# DebugWise AI 技术文档

> 版本对应仓库 `main` 分支。代码规模:`app.js` ≈ 66 KB、`engine.py` ≈ 40 KB、构建产物 `index.html` ≈ 137 KB。

## 1. 产品定位与设计原则

DebugWise 是面向编程入门课程的调试辅导工具。核心教学假设:新手最缺的不是答案,而是"提出假设并用实验验证"的习惯。因此:

1. **先诊断**:求助前必须写假设(`Step 1`)并做至少一次实验(`Step 2`)。
2. **分级放出帮助**:L1 → L2 → L3,逐级解锁,每级都要求新的假设和新的实验。
3. **不替学生写程序**:L3 只给"需改动的行",绝不返回完整程序(内置引擎和 Claude 提示词都如此约束)。
4. **诚实的不确定性**:诊断置信度 < 0.6 时向学生显示警告,并在教师端标记。
5. **隐私**:所有代码在本地执行;只有用户主动填入 API Key 才会调用外部 API;只有主动分享才会产生记录链接。

## 2. 总体架构

```
┌────────────────────────── 浏览器(单页,无后端) ──────────────────────────┐
│  app.js(主线程)                                                            │
│  ├─ 状态/持久化: localStorage (dw2.*)                                        │
│  ├─ UI 渲染: 手写模板字符串 + innerHTML(所有用户文本经 esc() 转义)         │
│  ├─ 门控/提示/风险标记逻辑                                                  │
│  ├─ Claude 调用(可选): fetch → api.anthropic.com                          │
│  └─ 分享: deflate-raw 压缩 + base64url → URL #hash                          │
│            │ postMessage(JSON)                                              │
│            ▼                                                                │
│  Web Worker(Blob URL 创建)                                                │
│  └─ Pyodide 0.26.4 (CDN: jsdelivr) → 执行 engine.py → dw_dispatch(json)    │
└─────────────────────────────────────────────────────────────────────────────┘
```

要点:

- **单文件交付**:`build.py` 把 CSS、`engine.py`(以 JSON 字符串形式)、`app.js` 内联进 `template.html`,产出一个自包含的 `index.html`(仅依赖外部的 Google Fonts 与 Pyodide CDN)。
- **引擎注入方式**:`engine.py` 内容被 `json.dumps` 后写入页面常量 `ENGINE_PY`,再嵌入 Worker 源码字符串;Worker 启动后 `py.runPython(ENGINE)` 定义 `dw_dispatch`。构建时对 `</` 转义为 `<\/`,避免提前闭合 `<script>`。
- **Worker 通过 Blob URL 创建**,因此无需额外的 JS 文件即可部署到静态托管。

## 3. 构建流程(`build.py`)

```
template.html  +  style.css + extra.css  →  替换 {{STYLE}}
               +  engine.py (json.dumps)  →  替换 {{ENGINE_JSON}}
               +  app.js                  →  替换 {{APP_JS}}
输出 dist/index.html 与 dist/.nojekyll
```

构建是**确定性**的:同一份 `src/` 重复构建得到逐字节相同的 `index.html`(已验证与线上文件一致)。

## 4. Python 引擎(`src/engine.py`)

### 4.1 请求协议

唯一入口 `dw_dispatch(json_str) -> json_str`,三种请求类型:

| type | 入参 | 返回 |
|---|---|---|
| `run` | `code`, 可选 `call`(表达式)、`stdin`(行数组) | `{ok, out, err, has_value, value}` |
| `tests` | `code`, `tests:[{call, expect}]`, `stdin` | `{rows:[{call, expect, got, pass, out, err, bad_expect}]}` |
| `diagnose` | `code`, `failure`(首个失败测试的结果) | 诊断对象(见 4.3) |

任何内部异常被捕获并返回 `{internal:true, error:"..."}`,不会让 Worker 崩溃。

### 4.2 执行沙箱 `_exec`

- 以文件名 `<student>` 编译学生代码、`<call>` 编译调用表达式,因此回溯里能区分"学生代码"与"调用",并据此提取出错行号。
- `contextlib.redirect_stdout/stderr` 捕获输出,截断到 5000 字符。
- 临时替换 `builtins.input`:从提供的 stdin 行依次取值并回显;耗尽时抛出带解释的 `EOFError`(浏览器里没有键盘提示)。
- 回溯整理 `_err_info`:仅保留学生帧,超过 6 帧时折叠为"前 2 + 后 2",生成适合新手阅读的 traceback 文本。
- **超时不在 Python 内处理**,由主线程终止 Worker(见 5.3)。
- 测试比较 `_same`:数值用 `math.isclose`,区分 `bool` 与数字,避免 `True == 1` 误判。期望值通过 `eval` 解析;非法 Python 字面量会标记 `bad_expect`。

> 安全说明:代码仅在用户自己的浏览器 Pyodide 沙箱中执行,不涉及服务器。教师分享的作业链接会在学生浏览器里运行其中代码,同样受浏览器沙箱限制。

### 4.3 诊断流水线 `diagnose(code, failure)`

```
有异常?  ──是──> _err_rules(按异常类型分派)
   │否/未命中
   ▼
AST 可解析? ──是──> _logic_rules(逻辑错误规则,按序尝试)
   │未命中
   ▼
_fallback(通用提示,置信度 0.4)
```

返回结构(`_r` 构造):

```json
{ "category": "...", "misconception": "...", "confidence": 0.0-1.0,
  "line": 行号|null, "l1": "...", "l2": "...", "l3": "...|null", "keywords": ["..."] }
```

- 若 `l3` 缺失,补上"无法有把握地指出单行修改"的通用文案,并将置信度上限压到 0.55。
- **异常类规则**(`_err_rules`):SyntaxError/IndentationError/TabError、IndexError、NameError、UnboundLocalError、TypeError、ZeroDivisionError、KeyError、AttributeError、ValueError、RecursionError(缺少基线条件)、EOFError(`input()` 无数据)、ModuleNotFoundError/ImportError(浏览器不含该包)。
- **逻辑类规则**(`_logic_rules`,无异常也能识别):
  - `_accum_reset` 累加器在循环内被重置
  - `_early_return` 循环内过早 `return`(如 `else: return False`)
  - `_short_range` `range` 边界差一
  - `_floor_div` 在名称含 avg/average/mean/ratio/percent/rate 的函数中误用 `//`
  - `_mutable_default` 可变默认参数
  - `_is_literal` 用 `is` 比较字面量
  - `_find_offbyone`(IndexError 规则的辅助)识别 `range(len(x)+1)`、`while i <= len(x)`、`x[len(x)]` 三种差一越界,并生成修复行
- `keywords` 用于在前端评估学生假设是否切题(见 6.2)。

### 4.4 扩展:新增一条诊断规则

1. 在 `engine.py` 写 `def _my_rule(c):`,其中 `c` 含 `code, tree, err, failure`;命中时 `return _r(category, misconception, confidence, line, l1, l2, l3, keywords)`,否则返回 `None`。
2. 异常类:加入 `_err_rules` 的分派;逻辑类:加入 `_logic_rules` 的元组。
3. 规则顺序即优先级;越具体的规则越靠前。
4. 运行 `python3 build.py` 并复制到根目录 `index.html`。

## 5. 前端(`src/app.js`)

整个应用包在一个 IIFE 中,无框架、无打包器。

### 5.1 状态模型与持久化

`localStorage` 键(前缀 `dw2.`):

| 键 | 内容 |
|---|---|
| `dw2.tasks` | 用户/教师自定义任务数组 |
| `dw2.progress` | `{taskId: Progress}` 每个任务一份进度 |
| `dw2.records` | 教师端保存的学习记录 |
| `dw2.name` / `dw2.task` / `dw2.intro` | 姓名、当前任务、引导是否已关闭 |
| `dw2.aiKey` / `dw2.aiModel` | **用户的 Claude API Key 与模型(仅存本浏览器)** |

`Progress` 结构(`blankProgress`):

```js
{ startedAt, hypotheses:[{text,at}], experiments:[{call,target,expect,result,note,at}],
  hints:[{level,at,payload}], asks:[], revised, tests, testRuns,
  explanation, explFeedback, transfer:{prediction,result,matched,why},
  ref:{a,b,c}, flags:[{type,msg,at}], diagnosis:{category,confidence} }
```

所有读写都包在 `try/catch` 中(隐私模式下 localStorage 可能不可用);保存采用 400 ms 防抖(`saveSoon`)。

任务类型:`PRESETS`(4 个内置)、`origin: "own"`(学生贴自己的代码)、`origin: "teacher"`(教师创建)、`origin: "link"`(通过链接导入)。ID 前缀分别为预设自带、`m-`、`t-`。

### 5.2 内置任务

| id | 主题 | 考察点 |
|---|---|---|
| `longest-word` | 最长单词 | `range(len+1)` 越界 → IndexError |
| `class-average` | 班级平均分 | 累加器在循环内被重置(静默错误) |
| `study-minutes` | 学习时长 | 表单文本 vs 数字 → TypeError |
| `has-negative` | 是否含负数 | 循环内过早 `return`(静默错误) |

每个任务含:题面、说明、期望行为、评分标准 `criteria`、有缺陷的 `code`、`tests`、以及迁移题 `transfer`。

### 5.3 Python Worker 通信

- `startWorker()` 创建 Blob Worker;Worker 内 `importScripts(pyodide.js)` → `loadPyodide` → `runPython(ENGINE)` → `postMessage({ready:true})`。
- `py(payload, ms)` 返回 Promise;每次请求带自增 `id`,回包按 `id` 匹配 `pending` Map。
- **超时机制**:默认 7 s(测试 9 s)。超时则 `worker.terminate()` 并重新 `startWorker()`,返回 `{timeout:true}`,UI 提示"可能是死循环"。这是对付无限循环的唯一可靠手段(Pyodide 在 Worker 内是同步执行)。
- 首次访问需下载约 10 MB 的 Pyodide,UI 有状态胶囊(`pyPill`)提示。

### 5.4 提示门控(`gate`)

```js
// 自上一条提示以来,是否有新假设 且 有新实验
const last = 最近一次提示的时间 (无则 0)
hyp = hypotheses.some(at > last);  exp = experiments.some(at > last)
```

L1 解锁条件为"至少一条假设 + 一次实验";L2/L3 需要在上一级之后**重新**提交。按钮在 Python 未就绪时禁用(除非配置了 Claude Key)。

### 5.5 提示来源与回退

`requestHint()`:

1. 配置了 Key → `claudeHint()`;失败(401/403/429/网络)则回退 `engineHint()`,并在提示旁注明原因。
2. 无 Key → `engineHint(diag, level, hyp)`,直接取诊断对象的 `l1/l2/l3`。

`hypStatus(text, diag)`:统计假设中命中 `keywords` 的个数(+ 命中诊断行号加 1)。≥3 → `on_track`,≥1 → `partly`,否则 `off_track`,并给出对应反馈文案。该机制简单透明,不依赖模型。

### 5.6 风险标记(`flags`,供教师复核)

| type | 触发条件 |
|---|---|
| `low_conf` | 诊断置信度 < 0.6 |
| `rapid` | 相邻两级提示间隔 < 60 s |
| `early_fix` | 开始后不足 4 分钟就到 L3 |
| `off_track_fix` | 展示 L3 时最新假设仍 `off_track` |
| `thin_expl` | 分享时解释不足 15 词 |

同类标记只记录一次(`addFlag` 去重)。

### 5.7 Claude 集成(可选,自带 Key)

- 直接在浏览器 `fetch("https://api.anthropic.com/v1/messages")`,带头 `anthropic-dangerous-direct-browser-access: true`。默认模型 `claude-sonnet-5-5`,可在设置里切换。
- 三类提示词:**分级提示**(返回严格 JSON:`category / misconception / confidence / hypothesis_status / hypothesis_feedback / support / fix_lines`)、**解释点评**(`rating` + ≤60 词反馈)、**追问**(受当前已解锁级别约束)。
- 提示词中明确"Never return a full corrected program"、L1 不给行号、L3 仅给改动行;`parseJSON` 用正则提取首个 `{...}`,并对 `confidence` 夹取到 [0,1]、对枚举字段做白名单校验。
- **安全注意**:API Key 保存在浏览器 localStorage 且从浏览器直接发送,适合个人/课堂演示;**不应**在公共电脑保留 Key(设置里提供"移除 Key")。生产环境应改为后端代理。

### 5.8 分享机制(无服务器)

```
对象 → JSON → UTF-8 → CompressionStream("deflate-raw") → base64url → "z"+串
(不支持压缩时回退 "r"+base64url)
URL: https://…/debugwise-ai/#task=<串>   # 教师布置作业
     https://…/debugwise-ai/#record=<串>  # 学生提交学习记录
```

- `handleHash()` 在加载与 `hashchange` 时解析:`#teacher` 切到教师视图;`#task=` 导入作业并切换;`#record=` 导入记录进教师端。解析后用 `history.replaceState` 清掉 hash。
- 作业 ID 由 `hash(title, code, tests)` 派生(djb2),同一作业重复导入不会产生重复项。
- 记录对象 `recordObj`:`{v:1, student, taskId, taskTitle, sharedAt, code, task, progress}`。链接超过约 7000 字符时提示改用 `.json` 下载。
- 导出格式:Markdown 学习记录(`recordMarkdown`)与 JSON。

### 5.9 教师视图

- **Records**:汇总卡片(记录数、需复核数、低置信度数、平均提示级别),可"只看被标记"的记录,查看某条记录的完整假设/实验/提示/解释/反思。内含示例记录 `EXAMPLES`。
- **Assignments**:基于"有缺陷代码 + `call => expected` 测试"创建作业,`buildTask` 会先在 Pyodide 中验证——若测试全部通过(没有 bug)、期望值非法或代码超时,会拒绝创建;可复制学生链接。
- 教师身份**没有认证**:视图切换纯属前端;数据都在各自浏览器本地。

### 5.10 UI 与可访问性

- 左栏"证据"(题面、原始代码、失败现象)常驻,右栏为 7 步流程 + 学习记录。
- 浅色/深色主题通过 CSS 变量 + `prefers-color-scheme`,并支持 `data-theme` 覆盖。
- `:focus-visible` 焦点环、`prefers-reduced-motion` 时关闭平滑滚动、表单控件均有 label、`aria-pressed` 用于角色切换。
- 所有动态内容走 `esc()` 转义后再拼入 HTML,避免 XSS(含从链接导入的作业与记录)。

## 6. 学生学习流程(8 个区块)

1. **假设** → 2. **实验**(对原始代码或自己的修订版运行任意调用,先写预期再看结果,再写"这说明什么") → 3. **支持阶梯** → 4. **修订并测试** → 5. **用自己的话解释 bug**(≥15 词才可检查) → 6. **迁移**(新代码,先预测再运行,并指出适用的原则) → 7. **反思**(三问) → **学习记录**(姓名、复制/下载/分享链接)。

## 7. 已知限制与改进建议

| 项 | 说明 |
|---|---|
| 无后端 | 教师无法集中收取记录;依赖链接/文件传递。需要时可加一个只收 JSON 的小服务。 |
| API Key 暴露 | 浏览器直连 Anthropic,Key 在本机明文存储。公开部署建议加代理并做限流。 |
| 内置规则覆盖面 | 仅覆盖常见新手错误;未命中走低置信度兜底(0.4),并标记给教师。 |
| 假设评估是关键词法 | `hypStatus` 为启发式,可能误判;Claude 模式下由模型判断。 |
| 首次加载慢 | 需下载约 10 MB Pyodide;可考虑自托管或 Service Worker 缓存。 |
| 外部 CDN | 依赖 jsdelivr 与 Google Fonts,断网时 Python 无法加载;如需离线,需自托管 Pyodide。 |
| 无自动化测试 | 建议为 `engine.py` 的各规则补 pytest 用例(它是纯 Python,可在 CPython 下直接测试)。 |
| 仅支持标准库 | 浏览器版 Python 无法 `pip install` 任意包;`ModuleNotFoundError` 有专门提示。 |

## 8. 历史版本

`legacy/debugwise-v1.html` 与 `legacy/debugwise-v1-offline.html` 为早期单文件版本(未拆分源码,不含 Pyodide 引擎,与当前架构不同),仅作留档;当前开发以 `src/` 为准。

## 9. 常见维护任务

- **改样式**:编辑 `src/style.css` / `extra.css`。
- **改文案/结构**:`src/template.html`;事件绑定在 `app.js` 末尾及各 `render*`。
- **加内置任务**:在 `app.js` 的 `PRESETS` 追加对象(`id/title/problem/instructions/expected/criteria/code/tests/transfer`),确保 `tests` 在原始代码上至少一条失败。
- **升级 Pyodide**:修改 `app.js` 中常量 `PYODIDE` 的版本号,并回归测试四个内置任务。
- **发布**:`python3 build.py && cp dist/index.html index.html`,提交推送,GitHub Pages 自动更新。
