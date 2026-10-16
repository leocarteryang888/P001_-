# 3D 零件库模块维护记录

本记录只覆盖 `src/04-3D零件库/`。模块职责与验证命令见本目录 `README.md`；每项实施需先按根目录 `AGENTS.md` 取得用户同意。

| 日期 | 工作块 / 批准范围 | 修改内容 | 验证 | 未完成项 / 交接 |
|---|---|---|---|---|
| 2026-10-15 | 项目治理文档初始化 | 建立模块独立维护记录模板；未修改零件数据、几何或共享库 | 未运行模块测试（本次仅新增治理文档） | 待阶段 1 基线核对；与最终工作台共享接入待验收 |
| 2026-10-16 | 用户明确批准三个测试的旧源码路径适配 | 仅将 `part-coordinate-contract.test.mjs`、`part-import-atomic.test.mjs`、`part-installation-behavior.test.mjs` 读取的旧 `outputs/03-整机选型工作台/three-preview.js` 路径改为正式源码 `src/03-整机选型工作台/js/three-preview.js`；断言、业务源码、零件数据和运行数据均未修改 | `node --test src/04-3D零件库/tests/part-coordinate-contract.test.mjs src/04-3D零件库/tests/part-import-atomic.test.mjs src/04-3D零件库/tests/part-installation-behavior.test.mjs`：43/43 通过；`node --test src/04-3D零件库/tests/*.test.js src/04-3D零件库/tests/*.test.mjs`：120/120 通过 | 本次只验证测试路径适配及模块自动化回归，不代表共享库与最终工作台完整接入验收；本块等待用户验收，三个测试按受保护状态处理 |
