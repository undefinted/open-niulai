# RunningHub workflow integration

RunningHub is the unified execution and billing layer for the video studio. MiniMax H3, Seedance, and custom generation are presented as workflow presets backed by one RunningHub account.

## User configuration

1. Create or copy a video workflow in RunningHub.
2. Obtain an API Key and connect it once in Open NiuLai's RunningHub dialog.
3. Open the workflow's exported API JSON.
4. Choose the matching MiniMax H3, Seedance, or custom preset, then enter the workflow ID and the node ID containing the positive prompt.
5. If a first frame is uploaded, also enter the image loading node ID.
6. Confirm the RunningHub account charge before submitting the task.

The default prompt field is `text`; the default image field is `image`. Change these values when the selected custom node exposes a different field name. Presets are product-facing labels, not fabricated workflow IDs: users bind workflows they own or copy in RunningHub.

## Security and billing

- The API Key is kept in the current browser tab's `sessionStorage`. Non-secret workflow mappings and the latest 20 job summaries use browser `localStorage` so a user can resume after reloading.
- The key is sent only to same-origin Cloudflare Pages Functions and then to RunningHub over HTTPS.
- Keys, workflow passwords, and uploaded resources are not committed to GitHub.
- Each task requires an explicit charge confirmation.
- Paid creation requests carry an idempotency key, are rate-limited, and are never automatically retried after an uncertain provider response.
- Production stores signed anonymous job metadata for up to seven days; it does not store the API Key or workflow access password.
- Output links may expire according to RunningHub policy; production deployments should copy accepted results to controlled object storage.

## API routes

- `POST /api/runninghub/uploads`: upload an optional first frame.
- `POST /api/video-jobs`: create a RunningHub task; the legacy MiniMax adapter remains available only for backend compatibility.
- `GET /api/video-jobs/:id?provider=runninghub`: poll outputs and normalize the result.
