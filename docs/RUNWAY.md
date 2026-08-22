# Runway Adapter

The adapter targets the official Runway image-to-video API contract checked on 2026-08-22:

- endpoint: `POST https://api.dev.runwayml.com/v1/image_to_video`
- API version header: `2024-11-06`
- default model: `gen4.5`
- square output: `960:960`
- local PNG input: data URI, maximum 5MB
- terminal task states: `SUCCEEDED`, `FAILED`, `CANCELED`
- successful output URLs are downloaded immediately because they expire

Official references: [API reference](https://docs.dev.runwayml.com/api/), [getting started](https://docs.dev.runwayml.com/guides/using-the-api/), [input limits](https://docs.dev.runwayml.com/assets/inputs/), and [output lifetime](https://docs.dev.runwayml.com/assets/outputs/).

## Dry Run

Dry run is the default and does not call Runway:

```bash
python scripts/runway_adapter.py --job examples/rendered/mao-runway/video-job.json --out examples/rendered/mao-runway/runway.mp4
```

The image data is summarized by length and never printed to the terminal.

## Paid Submission

Set the secret in the local environment; never commit it or paste it into a prompt. Then explicitly authorize submission:

```bash
python scripts/runway_adapter.py --job examples/rendered/mao-runway/video-job.json --out examples/rendered/mao-runway/runway.mp4 --submit
```

The adapter writes `runway-task.json` beside the output immediately after task creation. On the next invocation it resumes that task instead of creating another paid generation. You can also recover explicitly with `--resume-task TASK_ID`. Downloads are atomic and must pass `ffprobe` before the task is recorded as complete.

For a project created by the installed CLI, use the single end-to-end command. It resolves assets from the project directory and updates `project.json` only after media validation:

```bash
open-niulai generate-video --project path/to/project
open-niulai generate-video --project path/to/project --submit
```

The first command is a free dry run. The second requires `RUNWAYML_API_SECRET` and explicitly authorizes a paid generation.
