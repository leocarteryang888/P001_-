# 零件库本机共享 API

服务只绑定 `127.0.0.1:8765`。共享快照保存在 `outputs/04-3D零件库/shared-part-library.json`；历史版本以 `.rev-<revision>.json` 保存。服务只接受精确路径 `/api/part-library`，且只提供 GET/PUT。空库首次读取返回 `exists:false`，客户端不得据此自动发布或覆盖；发布必须由用户在当前零件库页面明确触发。

## 读取最新快照

`GET /api/part-library`

有快照时返回：

```json
{
  "exists": true,
  "library": {
    "schemaVersion": 2,
    "revision": 3,
    "updatedAt": "2026-09-25T08:00:00.000Z",
    "parts": [],
    "categories": []
  }
}
```

空库返回 `{"exists":false,"revision":null,"library":null}`。

## 保存或发布

`PUT /api/part-library`，JSON 请求体：

```json
{
  "expectedRevision": 3,
  "library": {
    "schemaVersion": 2,
    "parts": [],
    "categories": []
  }
}
```

首次发布需 `expectedRevision: null`。后续保存需提交 GET 得到的修订号。成功返回 `200` 和新 `library`（revision 自动递增）；版本不匹配返回 `409`，客户端应保留本地编辑并重新 GET/提示用户处理冲突。服务将旧快照另存为对应 `.rev-N.json`，然后通过临时文件替换当前快照。若备份失败则不替换当前版本。

`parts` 必须为数组（最多 5000 条）；`categories` 可省略或为 `{id,name}` 字符串字段对象数组。请求体上限 16 MiB；超过限制返回 413，服务端不改动当前快照，客户端应提示用户并保留本地编辑。只允许本机回环连接并校验 Host；不开放跨源访问。路径、存储位置均由服务端固定，不能由请求参数指定。

建议客户端流程：页面打开时 GET 最新版本；如果服务端无快照，继续使用页面现有本地数据，但显示“尚未发布共享版本”；用户明确选择发布后才以 `expectedRevision:null` 发起 PUT。已有共享版本时，本地提交使用它的 revision；收到 409 后不可自动重试覆盖。
