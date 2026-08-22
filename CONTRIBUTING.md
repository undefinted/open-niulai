# Contributing

Open NiuLai welcomes original templates, workflow improvements, provider adapters, tests, and demo projects.

## Before Opening A Change

1. Keep the product promise intact: one prompt should become a production-ready `X来` package, not only a style prompt.
2. Do not add protected film frames, copied characters, logos, dialogue, or shot-by-shot recreations.
3. Never commit API keys, expiring provider URLs, private prompts, or personal media.
4. Keep paid provider submission explicit. Dry run must remain the default.

## Development

```bash
python -m pip install pytest build
python -m pytest -q
python scripts/check_release.py
python -m build
```

Add behavioral tests for changes to parsing, state transitions, provider payloads, rights boundaries, and filesystem behavior. Avoid tests that only assert headings or exact prose.

## Demo Contributions

A complete demo contains:

- an original prompt and repeatable line;
- an identity lock with every field in `references/character-consistency.md`;
- poster, character reference, and first frame assets;
- a portable manifest entry;
- source/rights information in the pull request;
- no generated Chinese text inside imagery unless it was deliberately verified.

Generated video files should be short, compressed, and accompanied by the provider/model/date. Do not commit ephemeral output URLs.
