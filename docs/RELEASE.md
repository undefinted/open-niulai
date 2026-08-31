# Release Checklist

## Code And Skill

- [x] Version in `pyproject.toml` matches the intended tag.
- [x] `python -m pytest -q` passes on Windows and Linux.
- [x] `python scripts/check_release.py` passes.
- [x] `python scripts/check_release.py --require-ai-video` passes for a public release.
- [x] Wheel and source archive build successfully.
- [x] Installed `open-niulai --help` works in a clean environment.
- [x] Codex `quick_validate.py` passes for the Skill directory (`PYTHONUTF8=1` on Windows when the system locale is not UTF-8).

## Media

- [x] README media renders from repository-relative paths.
- [x] Every demo manifest path exists.
- [x] Images pass the character consistency checklist.
- [x] Videos have verified duration/codecs and contain no expiring URLs.
- [x] Demo provenance and provider/model/date are recorded.

## Rights And Secrets

- [x] No protected film frames, characters, logos, copied dialogue, or shot sequences.
- [x] No API keys, `.env`, personal data, private prompts, or provider CDN tokens.
- [x] License, contribution, conduct, security, and IP policies are present.

## Launch

- [ ] GitHub description uses the one-line product positioning.
- [x] First release includes at least three visual demos and one real generated video.
- [x] Release notes distinguish local previews from AI-generated video.
- [ ] The launch post includes one clear CTA: `下一个你想看谁来？`
- [x] Analytics sheet or issue is ready before posting.
