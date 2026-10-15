# DebugWise Pro

DebugWise AI 的带后端版本:在原有"先诊断再修复"的纯前端基础上,增加教师账号、班级码、服务器集中收集学习记录、服务器端 Claude 代理(学生无需自己的 API Key)。

## 运行

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
python3 web/build.py                       # 生成 server/static/index.html
ANTHROPIC_API_KEY=sk-ant-... TEACHER_INVITE=我的邀请码 \
  .venv/bin/uvicorn server.main:app --reload   # http://127.0.0.1:8000
```

环境变量(均可选):`ANTHROPIC_API_KEY`(开启服务器端 Claude)、`TEACHER_INVITE`(设置后注册教师需邀请码)、`DB_PATH`(SQLite 路径)。

## 流程

1. 教师打开页面 → Teacher → 创建账号,得到 6 位**班级码**。
2. 学生做完任务,在 Record 区填姓名和班级码 → 提交;同一学生同一任务再次提交会覆盖旧记录。
3. 教师登录后在 Learning records 看到全班记录、风险标记与完整过程。

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/config | 是否有服务器、是否启用 AI |
| POST | /api/teacher/register, /login | 返回 Bearer token 与班级码 |
| POST | /api/records | 学生提交(凭班级码,限流 30 次/10 分钟) |
| GET / DELETE | /api/records[/id] | 教师读取/删除本班记录 |
| POST | /api/claude | Claude 代理(限流 40 次/小时/IP,模型白名单) |

测试:`DB_PATH=/tmp/t.db .venv/bin/python tests_api.py`

## 部署

`Dockerfile` 可直接用于 Render / Railway / Fly.io;SQLite 文件需挂载持久卷到 `/data`。

## 安全说明

密码用 scrypt 加盐;token 在库中只存 SHA-256;学生提交无需账号,班级码即写入凭证(不要公开张贴)。仍无邮箱验证与密码找回,正式上线前建议补上。
