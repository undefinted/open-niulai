# RunningHub workflow integration

RunningHub is the advanced workflow option in the video studio. MiniMax remains the low-configuration quick-generation path.

## User configuration

1. Create or copy a video workflow in RunningHub.
2. Obtain an API Key and connect it in Open NiuLai's model connection dialog.
3. Open the workflow's exported API JSON.
4. Enter the workflow ID and the node ID containing the positive prompt.
5. If a first frame is uploaded, also enter the image loading node ID.
6. Confirm the RunningHub account charge before submitting the task.

The default prompt field is `text`; the default image field is `image`. Change these values when the selected custom node exposes a different field name.

## Security and billing

- The API Key is kept in the current browser tab's `sessionStorage`.
- The key is sent only to same-origin Cloudflare Pages Functions and then to RunningHub over HTTPS.
- Keys, workflow passwords, and uploaded resources are not committed to GitHub.
- Each task requires an explicit charge confirmation.
- Output links may expire according to RunningHub policy; production deployments should copy accepted results to controlled object storage.

## API routes

- `POST /api/runninghub/uploads`: upload an optional first frame.
- `POST /api/video-jobs`: create either a MiniMax or RunningHub task.
- `GET /api/video-jobs/:id?provider=runninghub`: poll outputs and normalize the result.
