# DebugWise AI

面向编程入门学生的 Python 调试辅导工具:**先诊断,再修复**。学生必须先写假设、做实验,系统才会逐级放出提示(三级支持阶梯),且不会替学生重写程序。全部代码在浏览器中运行(Pyodide),无后端。

在线地址:<https://stephaneguisard.github.io/debugwise-ai/>

## 特性

- **假设 → 实验 → 提示 的门控流程**:每解锁一级提示,都需要"一条新假设 + 一次新记录的实验"。
- **三级支持阶梯**:L1 缺陷类别 + 诊断性问题;L2 缩小范围的提示;L3 仅给出需改动的行。
- **浏览器内运行 Python**:Pyodide 0.26.4 跑在 Web Worker 里,7–9 秒超时自动终止(防死循环)。
- **内置诊断引擎**(`src/engine.py`):基于 `ast` 静态分析 + 运行时异常识别,覆盖 IndexError、NameError、TypeError、累加器未重置、过早 return、`range` 少一位等常见新手错误。
- **可选 Claude**(自带 API Key):更灵活的提示、解释点评、追问;失败时自动回退到内置引擎。
- **教师视图**:学习记录、风险标记(低置信度、连续快速求助等)、布置作业。
- **零服务器分享**:作业与学习记录压缩后编码进 URL `#hash`。

## 目录结构

```
.
├── index.html            # 构建产物,GitHub Pages 直接托管
├── build.py              # 构建脚本:src/ → index.html
├── src/
│   ├── template.html     # 页面骨架,含 {{STYLE}} {{ENGINE_JSON}} {{APP_JS}} 占位符
│   ├── style.css, extra.css
│   ├── app.js            # 前端全部逻辑(状态、渲染、Worker 通信、Claude、分享)
│   └── engine.py         # 在 Pyodide 内运行的 Python 引擎
├── legacy/               # 早期单文件版本(v1),仅留档
└── docs/TECHNICAL.md     # 详细技术文档
```

## 构建与部署

```bash
python3 build.py        # 读取 src/,生成 dist/index.html
cp dist/index.html .    # 根目录 index.html 即线上版本
```

仅需 Python 3 标准库。GitHub Pages 设置:Source = `main` 分支根目录(仓库含 `.nojekyll`)。本地预览请用 `python3 -m http.server`,因为 Worker 通过 Blob URL 创建,`file://` 下部分浏览器会受限。

## 文档

详见 [docs/TECHNICAL.md](docs/TECHNICAL.md)。
