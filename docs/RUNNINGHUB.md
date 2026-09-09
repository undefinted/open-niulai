# RunningHub AI instance integration

Open NiuLai uses a two-stage product flow: generate and review the script first, then send the confirmed video prompt and optional first frame to a published RunningHub AI application instance. The default interface does not ask ordinary users for a workflow ID or node ID.

## Default AI instance mode

1. An administrator selects and tests a published AI application in RunningHub.
2. Copy its `WebAppId` and exposed input mappings from the RunningHub API call page.
3. Add the mapping to the server-side `RUNNINGHUB_AI_APPS` JSON configuration.
4. The browser reads only the sanitized `/api/video-instances` catalog and displays the instance name, description, input support, estimated cost text, and availability.
5. After the user confirms the charge, the server calls `POST /task/openapi/ai-app/run` with the hidden `WebAppId` and mapped `nodeInfoList`.
6. The browser polls the existing RunningHub outputs endpoint and displays the returned video.

The deployment recognizes `minimax-h3` and `seedance` as stable product-facing slots. They remain visibly unavailable until a real instance mapping is configured. This prevents a placeholder from being presented as a working paid integration.

## Advanced workflow mode

The “自定义工作流” option preserves the previous expert flow. It calls `POST /task/openapi/create` and requires a workflow ID, prompt node mapping, and an image node mapping when a first frame is uploaded. These non-secret mappings are saved in the current browser; the access password is not saved.

## Security and billing

- Each user supplies their own RunningHub API Key. It stays in the current tab's `sessionStorage` and is sent only to same-origin Pages Functions over HTTPS.
- `WebAppId` and administrator node mappings remain in the server environment and are removed from the public instance response.
- Every paid submission requires a visible confirmation and an idempotency key. The server does not automatically recreate failed tasks.
- AI applications published by third parties can change or disappear. Revalidate each catalog entry before demonstrations and keep at least one tested fallback instance.
- Output links may expire according to RunningHub policy. Accepted production results should eventually be copied to controlled object storage.

## API surface

- `GET /api/video-instances`: return the sanitized AI instance catalog.
- `POST /api/runninghub/uploads`: upload an optional first frame.
- `POST /api/video-jobs`: create either an AI App task or an advanced workflow task.
- `GET /api/video-jobs/:id?provider=runninghub`: query and normalize the result.

See [Cloudflare Pages deployment](CLOUDFLARE_PAGES.md) for the environment variable schema.
