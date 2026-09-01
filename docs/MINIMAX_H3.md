# MiniMax H3 接入说明

Open NiuLai 已支持生成 MiniMax H3 视频作业包，但仓库不会自动发起付费请求，也不会保存 API 密钥。

## 当前状态

- 已支持供应商参数 minimax-h3。
- 网页端已实现临时账户连接、显式付费确认、任务创建、10 秒轮询、视频下载与站内播放。
- 作业使用项目中的首帧，并生成适合 H3 FL2VA 的动作与同步环境音提示词。
- 现有《猫来》样片由本地 Stable Video Diffusion 生成，不标注为 H3 成片。
- 腾讯云 2 核 4 GB 实验机用于部署网站，不适合本地运行 H3 权重。

## 生成作业包

    python scripts/build_video_job.py --demo mao-lai --provider minimax-h3 --duration 5 --out-dir work/mao-minimax-h3

命令只生成 video-job.json 和 subtitles.srt，不产生费用。实际生成时，应在本地或受控部署环境中配置 MiniMax API 密钥，再由独立适配器显式提交、轮询并下载结果。

## 安全约束

- API 密钥只放在环境变量或密钥管理服务中。
- 公网连接必须使用 HTTPS；当前裸 IP 的 HTTP 页面会拒绝接收密钥和付费任务。
- 不把 .env、密钥文件、云账号密码和临时令牌提交到 Git。
- 提交前运行项目的发布检查与敏感信息扫描。
- 报告只展示脱敏后的任务状态、资源标识和结果截图。

## 选型说明

H3 支持图生视频、参考图控制与原生音频，适合作为正式成片候选。是否优于其他模型仍取决于角色一致性、动作幅度、中文台词、生成成本和排队时间，项目采用同一首帧、同一时长和同一提示词做 A/B 对比后再确定最终模型。

官方资料：

- https://github.com/MiniMax-AI/MiniMax-H3
- https://www.minimax.io/blog/minimax-h3
