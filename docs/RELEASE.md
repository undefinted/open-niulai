# Release Checklist

## Code And Skill

- [ ] Version in `pyproject.toml` matches the intended tag.
- [ ] `python -m pytest -q` passes on Windows and Linux.
- [ ] `python scripts/check_release.py` passes.
- [ ] Wheel and source archive build successfully.
- [ ] Installed `open-niulai --help` works in a clean environment.
- [ ] Codex `quick_validate.py` passes for the Skill directory.

## Media

- [ ] README media renders from repository-relative paths.
- [ ] Every demo manifest path exists.
- [ ] Images pass the character consistency checklist.
- [ ] Videos have verified duration/codecs and contain no expiring URLs.
- [ ] Demo provenance and provider/model/date are recorded.

## Rights And Secrets

- [ ] No protected film frames, characters, logos, copied dialogue, or shot sequences.
- [ ] No API keys, `.env`, personal data, private prompts, or provider CDN tokens.
- [ ] License, contribution, conduct, security, and IP policies are present.

## Launch

- [ ] GitHub description uses the one-line product positioning.
- [ ] First release includes at least three visual demos and one real generated video.
- [ ] Release notes distinguish local previews from AI-generated video.
- [ ] The launch post includes one clear CTA: `下一个你想看谁来？`
- [ ] Analytics sheet or issue is ready before posting.
